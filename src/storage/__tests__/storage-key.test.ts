import { describe, expect, it } from "vitest";
import { ObjectStorageError } from "../errors";
import {
  getDeterministicStorageKey,
  isCanonicalMediaStorageKey,
} from "../storage-key";

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

  it("5. isCanonicalMediaStorageKey validates exact canonical storage keys", () => {
    // Valid lowercase hex SHA path
    expect(isCanonicalMediaStorageKey(`media/sha256/${sampleSha}`)).toBe(true);
    expect(
      isCanonicalMediaStorageKey(
        "media/sha256/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      ),
    ).toBe(true);

    // Uppercase rejected
    expect(
      isCanonicalMediaStorageKey(
        "media/sha256/8BAC4800C6273BCCF86E4E4275C1553FD58821A0A0DC19F595C95FF599374F59",
      ),
    ).toBe(false);

    // 63 chars (too short)
    expect(
      isCanonicalMediaStorageKey(
        "media/sha256/8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f5",
      ),
    ).toBe(false);

    // 65 chars (too long)
    expect(
      isCanonicalMediaStorageKey(
        "media/sha256/8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374f59a",
      ),
    ).toBe(false);

    // Non-hex characters
    expect(
      isCanonicalMediaStorageKey(
        "media/sha256/8bac4800c6273bccf86e4e4275c1553fd58821a0a0dc19f595c95ff599374fzz",
      ),
    ).toBe(false);

    // Unknown / legacy paths
    expect(isCanonicalMediaStorageKey("media/unknown/e5e5.bin")).toBe(false);
    expect(isCanonicalMediaStorageKey("ads/123/video.mp4")).toBe(false);
    expect(isCanonicalMediaStorageKey("preview/abc.jpg")).toBe(false);

    // Empty / null / undefined / whitespace
    expect(isCanonicalMediaStorageKey("")).toBe(false);
    expect(isCanonicalMediaStorageKey(null)).toBe(false);
    expect(isCanonicalMediaStorageKey(undefined)).toBe(false);
    expect(isCanonicalMediaStorageKey("   ")).toBe(false);
  });
});
