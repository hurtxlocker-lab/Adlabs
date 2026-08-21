import { describe, expect, it } from "vitest";
import {
  parseCorpusIngestCliArgs,
  validateCorpusIngestArgs,
  buildCorpusIngestPlan,
  resolveBrandFromItem,
  slugifyBrandName,
  runCorpusIngest,
} from "../ingest-runner";
import type { CuriousCoderItem } from "@/ingestion/sources/meta/curious-coder/schema";

describe("Corpus Ingest Runner — CLI Parsing & Validation", () => {
  const sampleUrl =
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=102636284698547";

  it("parses valid required CLI arguments correctly", () => {
    const raw = parseCorpusIngestCliArgs([
      "--url",
      sampleUrl,
      "--count",
      "50",
      "--country",
      "IN",
    ]);

    expect(raw.url).toBe(sampleUrl);
    expect(raw.count).toBe(50);
    expect(raw.country).toBe("IN");
    expect(raw.scrapeAdDetails).toBe(true); // default
    expect(raw.isDryRun).toBe(false);

    const validated = validateCorpusIngestArgs(raw);
    expect(validated.url).toBe(sampleUrl);
    expect(validated.count).toBe(50);
    expect(validated.country).toBe("IN");
    expect(validated.scrapeAdDetails).toBe(true);
  });

  it("parses equals-style arguments (--url=..., --count=..., --country=...)", () => {
    const raw = parseCorpusIngestCliArgs([
      `--url=${sampleUrl}`,
      "--count=25",
      "--country=us",
      "--brand=mybrand",
      "--concurrency=4",
    ]);

    expect(raw.url).toBe(sampleUrl);
    expect(raw.count).toBe(25);
    expect(raw.country).toBe("us");
    expect(raw.brand).toBe("mybrand");
    expect(raw.concurrency).toBe(4);

    const validated = validateCorpusIngestArgs(raw);
    expect(validated.country).toBe("US"); // normalized to uppercase
    expect(validated.brand).toBe("mybrand");
    expect(validated.concurrency).toBe(4);
  });

  it("normalizes lowercase country codes to uppercase", () => {
    const validated = validateCorpusIngestArgs({
      url: sampleUrl,
      count: 10,
      country: "in",
      isDryRun: false,
    });
    expect(validated.country).toBe("IN");
  });

  it("supports country='ALL'", () => {
    const validated = validateCorpusIngestArgs({
      url: sampleUrl,
      count: 10,
      country: "all",
      isDryRun: false,
    });
    expect(validated.country).toBe("ALL");
  });

  it("defaults scrapeAdDetails to true and overrides with --no-details", () => {
    const defaultRaw = parseCorpusIngestCliArgs(["--url", sampleUrl, "--count", "10", "--country", "IN"]);
    expect(defaultRaw.scrapeAdDetails).toBe(true);

    const noDetailsRaw = parseCorpusIngestCliArgs([
      "--url",
      sampleUrl,
      "--count",
      "10",
      "--country",
      "IN",
      "--no-details",
    ]);
    expect(noDetailsRaw.scrapeAdDetails).toBe(false);
  });

  it("throws on missing required arguments", () => {
    expect(() =>
      validateCorpusIngestArgs({ count: 10, country: "IN", isDryRun: false }),
    ).toThrow(/Missing required argument: --url/);

    expect(() =>
      validateCorpusIngestArgs({ url: sampleUrl, country: "IN", isDryRun: false }),
    ).toThrow(/Missing required argument: --count/);

    expect(() =>
      validateCorpusIngestArgs({ url: sampleUrl, count: 10, isDryRun: false }),
    ).toThrow(/Missing required argument: --country/);
  });

  it("throws on invalid URL protocol or domain", () => {
    expect(() =>
      validateCorpusIngestArgs({
        url: "ftp://example.com",
        count: 10,
        country: "IN",
        isDryRun: false,
      }),
    ).toThrow(/Must be http or https/);

    expect(() =>
      validateCorpusIngestArgs({
        url: "https://notfacebook.com/ads",
        count: 10,
        country: "IN",
        isDryRun: false,
      }),
    ).toThrow(/Must be a Meta\/Facebook Ad Library URL/);
  });

  it("throws on invalid count (0, negative, non-integer, > 500)", () => {
    expect(() =>
      validateCorpusIngestArgs({
        url: sampleUrl,
        count: 0,
        country: "IN",
        isDryRun: false,
      }),
    ).toThrow(/Must be a positive integer/);

    expect(() =>
      validateCorpusIngestArgs({
        url: sampleUrl,
        count: -5,
        country: "IN",
        isDryRun: false,
      }),
    ).toThrow(/Must be a positive integer/);

    expect(() =>
      validateCorpusIngestArgs({
        url: sampleUrl,
        count: 1000,
        country: "IN",
        isDryRun: false,
      }),
    ).toThrow(/DEV safety maximum is 500/);
  });

  it("throws on invalid country format", () => {
    expect(() =>
      validateCorpusIngestArgs({
        url: sampleUrl,
        count: 10,
        country: "INDIA",
        isDryRun: false,
      }),
    ).toThrow(/Must be a 2-letter ISO country code/);

    expect(() =>
      validateCorpusIngestArgs({
        url: sampleUrl,
        count: 10,
        country: "12",
        isDryRun: false,
      }),
    ).toThrow(/Must be a 2-letter ISO country code/);
  });
});

describe("Corpus Ingest Runner — Plan & Provider Payload Contract", () => {
  const sampleUrl =
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=102636284698547";

  it("builds exact Curious Coder actor payload", () => {
    const plan = buildCorpusIngestPlan({
      url: sampleUrl,
      count: 50,
      country: "IN",
      concurrency: 2,
      scrapeAdDetails: true,
      isDryRun: false,
    });

    expect(plan.actorInput.urls).toEqual([{ url: sampleUrl }]);
    expect(plan.actorInput.count).toBe(50);
    expect(plan.actorInput["scrapePageAds.countryCode"]).toBe("IN");
    expect(plan.actorInput["scrapePageAds.activeStatus"]).toBe("all");
    expect(plan.actorInput["scrapePageAds.sortBy"]).toBe("impressions_desc");
    expect(plan.actorInput.scrapeAdDetails).toBe(true);

    // Stale fields never present
    expect(plan.actorInput).not.toHaveProperty("startUrls");
    expect(plan.actorInput).not.toHaveProperty("resultsLimit");
  });

  it("clamps provider count to MIN_PROVIDER_COUNT (10) when requested count is smaller", () => {
    const plan = buildCorpusIngestPlan({
      url: sampleUrl,
      count: 3,
      country: "IN",
      concurrency: 2,
      scrapeAdDetails: true,
      isDryRun: false,
    });

    expect(plan.validatedInput.count).toBe(3);
    expect(plan.actorInput.count).toBe(10); // clamped
  });
});

describe("Corpus Ingest Runner — Brand Resolution", () => {
  it("slugifies brand names cleanly", () => {
    expect(slugifyBrandName("The Souled Store")).toBe("the-souled-store");
    expect(slugifyBrandName("Dot & Key Skincare")).toBe("dot-key-skincare");
    expect(slugifyBrandName("  Mamaearth India! ")).toBe("mamaearth-india");
  });

  it("resolves brand from explicit override or item payload", () => {
    const override = resolveBrandFromItem(undefined, "Custom Brand");
    expect(override.name).toBe("Custom Brand");
    expect(override.slug).toBe("custom-brand");

    const knownMamaearth = resolveBrandFromItem({
      page_id: "123",
      page_name: "Mamaearth Official",
      page_profile_uri: "https://facebook.com/mamaearthindia",
    } as unknown as CuriousCoderItem);
    expect(knownMamaearth.name).toBe("Mamaearth");
    expect(knownMamaearth.slug).toBe("mamaearth");

    const generic = resolveBrandFromItem({
      page_id: "999888",
      page_name: "Acme Store",
    } as unknown as CuriousCoderItem);
    expect(generic.name).toBe("Acme Store");
    expect(generic.slug).toBe("acme-store");
  });
});

describe("Corpus Ingest Runner — Dry-Run Safety", () => {
  const sampleUrl =
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=IN&view_all_page_id=102636284698547";

  it("executes dry-run without network or DB mutations", async () => {
    const result = await runCorpusIngest({
      url: sampleUrl,
      count: 20,
      country: "IN",
      isDryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
  });
});
