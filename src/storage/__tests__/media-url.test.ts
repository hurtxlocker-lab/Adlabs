import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    if (originalEnvMediaBase !== undefined) {
      process.env.MEDIA_BASE_URL = originalEnvMediaBase;
    } else {
      delete process.env.MEDIA_BASE_URL;
    }
    vi.unstubAllEnvs();
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

  it("3. reads process.env.MEDIA_BASE_URL when second argument is omitted in non-dev environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MEDIA_BASE_URL = "https://media.brainfoods.in";
    expect(resolveMediaUrl(validKey)).toBe(
      `https://media.brainfoods.in/media/sha256/${validSha}`,
    );
  });

  it("4. resolves to same-origin dev proxy in development environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveMediaUrl(validKey)).toBe(`/api/dev-media/sha256/${validSha}`);
  });

  it("5. allows explicit mediaBaseUrl override even in development environment", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveMediaUrl(validKey, "https://custom.media.cdn")).toBe(
      `https://custom.media.cdn/media/sha256/${validSha}`,
    );
  });

  it("6. throws MediaUrlResolutionError if base URL is missing or empty in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveMediaUrl(validKey, null)).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl(validKey, undefined)).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl(validKey, "")).toThrow(MediaUrlResolutionError);
    expect(() => resolveMediaUrl(validKey, "   ")).toThrow(MediaUrlResolutionError);
  });

  it("7. throws MediaUrlResolutionError if base URL is not HTTPS", () => {
    expect(() => resolveMediaUrl(validKey, "http://media.brainfoods.in")).toThrow(
      /must use https:/,
    );
    expect(() => resolveMediaUrl(validKey, "ftp://media.brainfoods.in")).toThrow(
      /must use https:/,
    );
  });

  it("8. throws MediaUrlResolutionError on malformed base URL", () => {
    expect(() => resolveMediaUrl(validKey, "not-a-valid-url")).toThrow(
      MediaUrlResolutionError,
    );
  });

  it("9. rejects invalid or non-canonical storage keys", () => {
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
});
