import * as http from "node:http";

interface HttpTraceResult {
  url: string;
  status: number;
  dnsMs: number;
  connectMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
  contentSizeBytes: number;
  contentType: string;
}

function traceHttpRequest(targetUrl: string, headers: Record<string, string> = {}, maxRedirects = 5): Promise<HttpTraceResult> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const t0 = performance.now();
    let tDns = t0;
    let tConnect = t0;
    let tTtfb = t0;

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          "User-Agent": "AdLabs-Profiler/1.0",
          Accept: "text/x-component, */*",
          ...headers,
        },
      },
      (res) => {
        tTtfb = performance.now();

        if (
          res.statusCode &&
          [301, 302, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          maxRedirects > 0
        ) {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          return traceHttpRequest(redirectUrl, headers, maxRedirects - 1)
            .then(resolve)
            .catch(reject);
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          const tEnd = performance.now();
          const body = Buffer.concat(chunks);

          resolve({
            url: targetUrl,
            status: res.statusCode ?? 0,
            dnsMs: Math.round(tDns - t0),
            connectMs: Math.round(tConnect - tDns),
            ttfbMs: Math.round(tTtfb - tConnect),
            downloadMs: Math.round(tEnd - tTtfb),
            totalMs: Math.round(tEnd - t0),
            contentSizeBytes: body.length,
            contentType: res.headers["content-type"] ?? "unknown",
          });
        });
      },
    );

    req.on("socket", (socket) => {
      socket.on("lookup", () => {
        tDns = performance.now();
      });
      socket.on("connect", () => {
        tConnect = performance.now();
      });
    });

    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function main() {
  console.log("================================================================================");
  console.log("AdLabs — RSC & HTML Browser Network Profiling Trace");
  console.log("================================================================================\n");

  // 1. Initial Page Load (Full HTML document)
  console.log("1. Full Document Request: GET http://localhost:3005/discover");
  const htmlTrace = await traceHttpRequest("http://localhost:3005/discover");
  console.table([htmlTrace]);

  // 2. Filter Navigation: Brand Filter (Huel)
  console.log("\n2. Brand Filter Document Navigation (Huel)");
  const brandRscTrace = await traceHttpRequest(
    "http://localhost:3005/discover?brand=549edbea-b202-4e1b-ab47-09df9838b3d4",
  );
  console.table([brandRscTrace]);

  // 3. Filter Navigation: Media Filter (media=VIDEO)
  console.log("\n3. Media Filter Document Navigation (media=VIDEO)");
  const mediaRscTrace = await traceHttpRequest(
    "http://localhost:3005/discover?media=VIDEO",
  );
  console.table([mediaRscTrace]);

  // 4. Filter Navigation: Compound Filter (Brand + VIDEO + Active)
  console.log("\n4. Compound Filter Document Navigation (brand=Huel&media=VIDEO&active=true)");
  const compoundRscTrace = await traceHttpRequest(
    "http://localhost:3005/discover?brand=549edbea-b202-4e1b-ab47-09df9838b3d4&media=VIDEO&active=true",
  );
  console.table([compoundRscTrace]);

  process.exit(0);
}

main().catch(console.error);
