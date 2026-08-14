import * as dns from "node:dns";
import * as net from "node:net";
import { UnsafeMediaUrlError } from "./errors";
import type { DnsLookupFn } from "./types";

/**
 * Strips search params (query string) and hash fragment from a URL string
 * so error logs never expose signed CDN query tokens or sensitive parameters.
 */
export function redactUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // If URL is completely unparseable, strip '?' and '#' manually
    return urlStr.split("?")[0].split("#")[0];
  }
}

/**
 * Checks whether an IPv4 address falls into private, loopback, link-local,
 * CGNAT, multicast, or reserved ranges.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // Invalid format treated as unsafe
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network / default route)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link-Local / Cloud Metadata e.g. 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (b0 === 192 && b1 === 88 && parts[2] === 99) return true;

  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Network Benchmark)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future use: 240.0.0.0 - 255.255.255.254)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address falls into private, loopback, link-local,
 * documentation, or multicast ranges.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // :: (Unspecified)
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

  // ::1 (Loopback)
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped IPv6: ::ffff:a.b.c.d
  if (normalized.startsWith("::ffff:") || normalized.startsWith("0:0:0:0:0:ffff:")) {
    const lastPart = normalized.split(":").pop();
    if (lastPart && net.isIPv4(lastPart)) {
      return isPrivateOrReservedIPv4(lastPart);
    }
  }

  // 64:ff9b::/96 (IPv4/IPv6 translation)
  if (normalized.startsWith("64:ff9b:")) return true;

  // 100::/64 (Discard-only)
  if (normalized.startsWith("100:")) return true;

  // 2001:db8::/32 (Documentation)
  if (normalized.startsWith("2001:db8:") || normalized.startsWith("2001:0db8:")) return true;

  // fc00::/7 (Unique Local Address: fc00.. - fdff..)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // fe80::/10 (Link-Local: fe80.. - febf..)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // ff00::/8 (Multicast)
  if (normalized.startsWith("ff")) return true;

  return false;
}

/**
 * Checks whether any IP address (IPv4 or IPv6) is private or reserved.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    return isPrivateOrReservedIPv4(ip);
  }
  if (family === 6) {
    return isPrivateOrReservedIPv6(ip);
  }
  return true; // Unknown/invalid IP format fails closed
}

/**
 * Default production DNS lookup using Node dns.promises.lookup.
 */
export const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  const results = await dns.promises.lookup(hostname, { all: true });
  return results.map((r) => ({ address: r.address, family: r.family }));
};

/**
 * Validates a target URL against protocol and SSRF rules.
 *
 * Rules:
 *  1. Only http: and https: protocols allowed.
 *  2. Malformed URLs fail closed.
 *  3. Hostname cannot be localhost or *.localhost.
 *  4. Direct IP addresses are checked against private/reserved ranges.
 *  5. Domain names are DNS-resolved, and EVERY resolved IP address is verified.
 *     If any resolved address is private/reserved, fails closed.
 */
export async function validateUrlSafety(
  urlStr: string,
  options?: { dnsLookup?: DnsLookupFn },
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new UnsafeMediaUrlError(
      `Malformed or invalid media URL: "${redactUrl(urlStr)}"`,
      redactUrl(urlStr),
      "MALFORMED_URL",
    );
  }

  const safeUrl = redactUrl(urlStr);

  // 1. Protocol validation
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeMediaUrlError(
      `Unsupported protocol "${parsed.protocol}" for media URL: "${safeUrl}". Only HTTP and HTTPS are allowed.`,
      safeUrl,
      "UNSUPPORTED_PROTOCOL",
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname || hostname.trim().length === 0) {
    throw new UnsafeMediaUrlError(
      `Empty hostname in media URL: "${safeUrl}"`,
      safeUrl,
      "EMPTY_HOSTNAME",
    );
  }

  // 2. Localhost checks
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeMediaUrlError(
      `Access to localhost is forbidden: "${safeUrl}"`,
      safeUrl,
      "LOCALHOST_FORBIDDEN",
    );
  }

  // 3. Direct IP address check (e.g. http://127.0.0.1/ or http://[::1]/)
  const directIpFamily = net.isIP(
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname,
  );

  if (directIpFamily > 0) {
    const rawIp =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    if (isPrivateOrReservedIp(rawIp)) {
      throw new UnsafeMediaUrlError(
        `Access to private or reserved IP address "${rawIp}" is forbidden: "${safeUrl}"`,
        safeUrl,
        "PRIVATE_IP_FORBIDDEN",
      );
    }
    return parsed;
  }

  // 4. DNS resolution check for domain names
  const lookup = options?.dnsLookup ?? defaultDnsLookup;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UnsafeMediaUrlError(
      `DNS lookup failed for hostname "${hostname}" in URL "${safeUrl}": ${message}`,
      safeUrl,
      "DNS_LOOKUP_FAILED",
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new UnsafeMediaUrlError(
      `DNS resolution returned no addresses for hostname "${hostname}" in URL "${safeUrl}"`,
      safeUrl,
      "DNS_NO_ADDRESSES",
    );
  }

  // Fail closed if ANY resolved address is private or reserved
  for (const entry of addresses) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new UnsafeMediaUrlError(
        `Hostname "${hostname}" in URL "${safeUrl}" resolved to private or reserved IP address "${entry.address}". Request rejected.`,
        safeUrl,
        "RESOLVED_PRIVATE_IP_FORBIDDEN",
      );
    }
  }

  return parsed;
}
