import { describe, expect, it } from "vitest";
import { ObjectStorageError } from "../errors";
import { getDeterministicStorageKey, getPublicMediaUrl } from "../storage-key";

describe("Storage Key Pure Tests (True SHA-Addressed Object Identity)", () => {
  const sampleSha =
    "8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59";
  const otherSha =
    "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";

  it("1. same SHA produces exact deterministic key media/sha256/<sha256>", () => {
    const key = getDeterministicStorageKey(sampleSha);
    expect(key).toBe(`media/sha256/${sampleSha}`);
  });

  it("2. different SHA produces different key", () => {
    const key1 = getDeterministicStorageKey(sampleSha);
    const key2 = getDeterministicStorageKey(otherSha);
    expect(key1).not.toBe(key2);
    expect(key2).toBe(`media/sha256/${otherSha}`);
  });

  it("3. key has NO extension and NO semantic media-type directory", () => {
    const key = getDeterministicStorageKey(sampleSha);
    expect(key).not.toContain(".jpg");
    expect(key).not.toContain(".png");
    expect(key).not.toContain(".mp4");
    expect(key).not.toContain(".bin");
    expect(key).not.toContain("media/images");
    expect(key).not.toContain("media/videos");
    expect(key).not.toContain("media/previews");
    expect(key).toBe(`media/sha256/${sampleSha}`);
  });

  it("4. rejects malformed, short, uppercase, or invalid SHA strings", () => {
    expect(() => getDeterministicStorageKey("not-a-sha")).toThrow(
      ObjectStorageError,
    );

    // 63 chars (too short)
    expect(() =>
      getDeterministicStorageKey(
        "8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f5",
      ),
    ).toThrow(ObjectStorageError);

    // Uppercase characters (must be lowercase canonical hex)
    expect(() =>
      getDeterministicStorageKey(
        "8BAC4800C6273BCCF86E4E4275C1553FD58821A0A0DC19F595C95FF599374F59",
      ),
    ).toThrow(ObjectStorageError);

    // Path traversal in SHA
    expect(() =>
      getDeterministicStorageKey(
        "../8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59",
      ),
    ).toThrow(ObjectStorageError);
  });

  it("5. public URL helper cleanly joins base URL and extensionless storage key", () => {
    const key = `media/sha256/${sampleSha}`;
    expect(getPublicMediaUrl(key, "https://cdn.adlabs.example.com")).toBe(
      `https://cdn.adlabs.example.com/media/sha256/${sampleSha}`,
    );

    // Handles trailing slash on base URL
    expect(getPublicMediaUrl(key, "https://cdn.adlabs.example.com/")).toBe(
      `https://cdn.adlabs.example.com/media/sha256/${sampleSha}`,
    );

    // Returns null if base URL is missing or empty
    expect(getPublicMediaUrl(key, null)).toBeNull();
    expect(getPublicMediaUrl(key, undefined)).toBeNull();
    expect(getPublicMediaUrl(key, "   ")).toBeNull();
  });
});
