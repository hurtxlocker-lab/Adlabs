import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaUrlResolutionError } from "../errors";
import { resolveMediaUrl } from "../media-url";

describe("Media URL Resolver (Canonical Private Media Gateway)", () => {
  const validSha =
    "8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59";
  const validKey = `media/sha256/${validSha}`;
  const validBaseUrl = "https://media.brainfoods.in";

  const originalEnvMediaBase = process.env.MEDIA_BASE_URL;

  beforeEach(() => {
    delete process.env.MEDIA_BASE_URL;
  });

  afterEach(() => {
    if (originalEnvMediaBase !== undefined) {
      process.env.MEDIA_BASE_URL = originalEnvMediaBase;
    } else {
      delete process.env.MEDIA_BASE_URL;
    }
  });

  it("1. successfully resolves canonical URL with valid base and storage key", () => {
    const url = resolveMediaUrl(validKey, validBaseUrl);
    expect(url).toBe(`https://media.brainfoods.in/media/sha256/${validSha}`);
  });

  it("2. normalizes trailing slashes on base URL cleanly", () => {
    expect(resolveMediaUrl(validKey, "https://media.brainfoods.in/")).toBe(
      `https://media.brainfoods.in/media/sha256/${validSha}`,
    );
    expect(resolveMediaUrl(validKey, "https://media.brainfoods.in///")).toBe(
      `https://media.brainfoods.in/media/sha256/${validSha}`,
    );
  });

  it("3. reads process.env.MEDIA_BASE_URL when second argument is omitted", () => {
    process.env.MEDIA_BASE_URL = "https://media.brainfoods.in";
    expect(resolveMediaUrl(validKey)).toBe(
      `https://media.brainfoods.in/media/sha256/${validSha}`,
    );
  });

  it("4. throws MediaUrlResolutionError if base URL is missing or empty", () => {
    expect(() => resolveMediaUrl(validKey, null)).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl(validKey, undefined)).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl(validKey, "")).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl(validKey, "   ")).toThrow(MediaUrlResolutionError);
  });

  it("5. throws MediaUrlResolutionError if base URL is not HTTPS", () => {
    expect(() => resolveMediaUrl(validKey, "http://media.brainfoods.in")).toThrow(
      /must use https:/,
    );
    expect(() => resolveMediaUrl(validKey, "ftp://media.brainfoods.in")).toThrow(
      /must use https:/,
    );
  });

  it("6. throws MediaUrlResolutionError on malformed base URL", () => {
    expect(() => resolveMediaUrl(validKey, "not-a-valid-url")).toThrow(
      MediaUrlResolutionError,
    );
  });

  it("7. rejects invalid or non-canonical storage keys", () => {
    // Malformed prefix
    expect(() => resolveMediaUrl("images/sha256/" + validSha, validBaseUrl)).toThrow(
      MediaUrlResolutionError,
    );

    // Uppercase hex
    expect(() =>
      resolveMediaUrl("media/sha256/" + validSha.toUpperCase(), validBaseUrl),
    ).toThrow(MediaUrlResolutionError);

    // Short hash
    expect(() =>
      resolveMediaUrl("media/sha256/8bac4800c6273bccf86e4e4275c1553f", validBaseUrl),
    ).toThrow(MediaUrlResolutionError);

    // Path traversal
    expect(() =>
      resolveMediaUrl(`../media/sha256/${validSha}`, validBaseUrl),
    ).toThrow(MediaUrlResolutionError);
    expect(() =>
      resolveMediaUrl(`media/sha256/${validSha}/../../secret`, validBaseUrl),
    ).toThrow(MediaUrlResolutionError);

    // Empty or non-matching key
    expect(() => resolveMediaUrl("", validBaseUrl)).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl("arbitrary-key.jpg", validBaseUrl)).toThrow(
      MediaUrlResolutionError,
    );
  });

  it("8. pure synchronous execution with no network or credential dependencies", () => {
    const result = resolveMediaUrl(validKey, validBaseUrl);
    expect(typeof result).toBe("string");
    expect(result.startsWith("https://")).toBe(true);
  });
});
