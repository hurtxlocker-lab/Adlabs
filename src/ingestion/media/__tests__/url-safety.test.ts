import { describe, expect, it } from "vitest";
import { UnsafeMediaUrlError } from "../errors";
import {
  isPrivateOrReservedIp,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  redactUrl,
  validateUrlSafety,
} from "../url-safety";

describe("Media URL Safety & SSRF Protection", () => {
  describe("redactUrl", () => {
    it("strips search parameters and hash fragments", () => {
      expect(
        redactUrl("https://cdn.example.com/media/ad_123.jpg?token=secret123&sig=abc#preview"),
      ).toBe("https://cdn.example.com/media/ad_123.jpg");
    });

    it("handles URLs without query or hash", () => {
      expect(redactUrl("http://cdn.example.com/video.mp4")).toBe(
        "http://cdn.example.com/video.mp4",
      );
    });

    it("handles malformed URLs safely by stripping ? and # manually", () => {
      expect(redactUrl("not_a_valid_url?token=xyz#frag")).toBe("not_a_valid_url");
    });
  });

  describe("IPv4 & IPv6 Range Checks", () => {
    it("identifies private and reserved IPv4 ranges", () => {
      expect(isPrivateOrReservedIPv4("127.0.0.1")).toBe(true); // Loopback
      expect(isPrivateOrReservedIPv4("10.0.1.5")).toBe(true); // 10.0.0.0/8
      expect(isPrivateOrReservedIPv4("172.16.0.1")).toBe(true); // 172.16.0.0/12
      expect(isPrivateOrReservedIPv4("172.31.255.255")).toBe(true);
      expect(isPrivateOrReservedIPv4("192.168.1.1")).toBe(true); // 192.168.0.0/16
      expect(isPrivateOrReservedIPv4("169.254.169.254")).toBe(true); // Link-local / metadata
      expect(isPrivateOrReservedIPv4("100.64.0.1")).toBe(true); // CGNAT
      expect(isPrivateOrReservedIPv4("0.0.0.0")).toBe(true); // Broadcast
      expect(isPrivateOrReservedIPv4("224.0.0.1")).toBe(true); // Multicast
      expect(isPrivateOrReservedIPv4("240.0.0.1")).toBe(true); // Reserved
      expect(isPrivateOrReservedIPv4("255.255.255.255")).toBe(true); // Broadcast

      // Public routable IPs
      expect(isPrivateOrReservedIPv4("93.184.216.34")).toBe(false);
      expect(isPrivateOrReservedIPv4("1.1.1.1")).toBe(false);
      expect(isPrivateOrReservedIPv4("8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedIPv4("157.240.1.35")).toBe(false); // Meta CDN IP
    });

    it("identifies private and reserved IPv6 ranges", () => {
      expect(isPrivateOrReservedIPv6("::1")).toBe(true); // Loopback
      expect(isPrivateOrReservedIPv6("::")).toBe(true); // Unspecified
      expect(isPrivateOrReservedIPv6("fc00::1")).toBe(true); // ULA
      expect(isPrivateOrReservedIPv6("fd12:3456:789a::1")).toBe(true); // ULA
      expect(isPrivateOrReservedIPv6("fe80::1")).toBe(true); // Link-local
      expect(isPrivateOrReservedIPv6("ff02::1")).toBe(true); // Multicast
      expect(isPrivateOrReservedIPv6("::ffff:127.0.0.1")).toBe(true); // IPv4-mapped loopback
      expect(isPrivateOrReservedIPv6("::ffff:192.168.1.100")).toBe(true); // IPv4-mapped private

      // Public routable IPv6
      expect(isPrivateOrReservedIPv6("2606:4700:4700::1111")).toBe(false); // Cloudflare
      expect(isPrivateOrReservedIPv6("2a03:2880:f12c:83:face:b00c:0:25de")).toBe(false); // Meta
    });

    it("isPrivateOrReservedIp handles arbitrary strings safely", () => {
      expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("::1")).toBe(true);
      expect(isPrivateOrReservedIp("invalid-ip")).toBe(true); // Fails closed
    });
  });

  describe("validateUrlSafety", () => {
    it("allows valid public HTTPS URLs with public DNS results", async () => {
      const mockLookup = async () => [
        { address: "93.184.216.34", family: 4 },
      ];

      const parsed = await validateUrlSafety(
        "https://cdn.example.com/images/ad1.jpg?sig=xyz",
        { dnsLookup: mockLookup },
      );

      expect(parsed.protocol).toBe("https:");
      expect(parsed.hostname).toBe("cdn.example.com");
    });

    it("allows valid public HTTP URLs with public DNS results", async () => {
      const mockLookup = async () => [
        { address: "157.240.1.35", family: 4 },
      ];

      const parsed = await validateUrlSafety(
        "http://video.fbcdn.net/v/t1.0-9/sample.mp4",
        { dnsLookup: mockLookup },
      );

      expect(parsed.protocol).toBe("http:");
      expect(parsed.hostname).toBe("video.fbcdn.net");
    });

    it("rejects non-http/https protocols", async () => {
      const forbiddenSchemes = [
        "file:///etc/passwd",
        "ftp://ftp.example.com/file.jpg",
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "blob:https://example.com/uuid",
        "javascript:alert(1)",
        "about:blank",
        "ws://example.com/socket",
        "wss://example.com/socket",
      ];

      for (const scheme of forbiddenSchemes) {
        await expect(validateUrlSafety(scheme)).rejects.toThrow(
          UnsafeMediaUrlError,
        );
      }
    });

    it("rejects malformed URLs", async () => {
      await expect(validateUrlSafety("not-a-url")).rejects.toThrow(
        UnsafeMediaUrlError,
      );
      await expect(validateUrlSafety("http://")).rejects.toThrow(
        UnsafeMediaUrlError,
      );
    });

    it("rejects localhost and *.localhost", async () => {
      await expect(validateUrlSafety("http://localhost/ad.jpg")).rejects.toThrow(
        UnsafeMediaUrlError,
      );
      await expect(
        validateUrlSafety("http://sub.localhost/ad.jpg"),
      ).rejects.toThrow(UnsafeMediaUrlError);
    });

    it("rejects direct private IPv4 URLs without DNS lookup", async () => {
      const privateIps = [
        "http://127.0.0.1/test.jpg",
        "http://10.0.0.1/test.jpg",
        "http://172.16.0.1/test.jpg",
        "http://192.168.1.1/test.jpg",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.0.1/test.jpg",
      ];

      for (const url of privateIps) {
        await expect(validateUrlSafety(url)).rejects.toThrow(
          UnsafeMediaUrlError,
        );
      }
    });

    it("rejects direct private IPv6 URLs without DNS lookup", async () => {
      await expect(validateUrlSafety("http://[::1]/test.jpg")).rejects.toThrow(
        UnsafeMediaUrlError,
      );
      await expect(validateUrlSafety("http://[fe80::1]/test.jpg")).rejects.toThrow(
        UnsafeMediaUrlError,
      );
      await expect(validateUrlSafety("http://[fc00::1]/test.jpg")).rejects.toThrow(
        UnsafeMediaUrlError,
      );
    });

    it("rejects domain names resolving to a private IP", async () => {
      const mockLookup = async () => [
        { address: "127.0.0.1", family: 4 },
      ];

      await expect(
        validateUrlSafety("https://malicious.example.com/ad.jpg", {
          dnsLookup: mockLookup,
        }),
      ).rejects.toThrow(UnsafeMediaUrlError);
    });

    it("rejects domain names resolving to cloud metadata IP (169.254.169.254)", async () => {
      const mockLookup = async () => [
        { address: "169.254.169.254", family: 4 },
      ];

      await expect(
        validateUrlSafety("https://metadata.attacker.com/", {
          dnsLookup: mockLookup,
        }),
      ).rejects.toThrow(UnsafeMediaUrlError);
    });

    it("fails closed if ANY resolved IP in a multi-address result is private", async () => {
      // Mixed public and private resolved addresses (e.g. DNS rebinding attempt)
      const mockLookup = async () => [
        { address: "93.184.216.34", family: 4 }, // Public
        { address: "192.168.1.50", family: 4 }, // Private!
      ];

      await expect(
        validateUrlSafety("https://mixed.example.com/ad.jpg", {
          dnsLookup: mockLookup,
        }),
      ).rejects.toThrow(UnsafeMediaUrlError);
    });

    it("rejects when DNS resolution fails or returns no addresses", async () => {
      const mockLookupFailing = async () => {
        throw new Error("ENOTFOUND");
      };

      await expect(
        validateUrlSafety("https://nonexistent.domain.test/ad.jpg", {
          dnsLookup: mockLookupFailing,
        }),
      ).rejects.toThrow(UnsafeMediaUrlError);

      const mockLookupEmpty = async () => [];
      await expect(
        validateUrlSafety("https://empty.domain.test/ad.jpg", {
          dnsLookup: mockLookupEmpty,
        }),
      ).rejects.toThrow(UnsafeMediaUrlError);
    });
  });
});
