import { describe, expect, it } from "vitest";
import type { MediaAssetRow, StoredMediaInput } from "../types";
import {
  DuplicateMediaRelationshipError,
  MediaAssetConflictError,
} from "../types";
import {
  validateNonEmptyString,
  validateNonNegativeBigInt,
  validateNonNegativeInt,
  validateSha256,
  validateStoredMediaType,
} from "../validation";

describe("Stored Media Mapping & Validation Invariants", () => {
  const sampleValidSha =
    "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855";
  const expectedLowerSha =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("accepts valid 64-hex SHA-256 and canonicalizes to lowercase", () => {
    const canonical = validateSha256(sampleValidSha, "sha256");
    expect(canonical).toBe(expectedLowerSha);
    expect(canonical).toHaveLength(64);
  });

  it("rejects invalid SHA-256 hashes", () => {
    // Too short
    expect(() => validateSha256("abc123", "sha256")).toThrow(/64-character/);
    // Too long (65 chars)
    expect(() =>
      validateSha256(`${expectedLowerSha}a`, "sha256"),
    ).toThrow(/64-character/);
    // Non-hex characters
    expect(() =>
      validateSha256(
        "z3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "sha256",
      ),
    ).toThrow(/64-character/);
    // Empty or non-string
    expect(() => validateSha256("", "sha256")).toThrow();
    expect(() => validateSha256(null, "sha256")).toThrow();
  });

  it("validates byteSize as a non-negative bigint", () => {
    expect(validateNonNegativeBigInt(BigInt(0), "byteSize")).toBe(BigInt(0));
    expect(validateNonNegativeBigInt(BigInt(1048576), "byteSize")).toBe(
      BigInt(1048576),
    );
    expect(() => validateNonNegativeBigInt(BigInt(-1), "byteSize")).toThrow(
      /must be >= 0/,
    );
    expect(() => validateNonNegativeBigInt(1024, "byteSize")).toThrow(
      /must be a bigint/,
    );
  });

  it("validates storageProvider and storageKey as non-empty strings", () => {
    expect(validateNonEmptyString("r2", "storageProvider")).toBe("r2");
    expect(
      validateNonEmptyString("media/images/file.jpg", "storageKey"),
    ).toBe("media/images/file.jpg");
    expect(() => validateNonEmptyString("", "storageProvider")).toThrow(
      /non-empty string/,
    );
    expect(() => validateNonEmptyString("   ", "storageKey")).toThrow(
      /non-empty string/,
    );
  });

  it("validates stored media types strictly", () => {
    expect(validateStoredMediaType("IMAGE", "mediaType")).toBe("IMAGE");
    expect(validateStoredMediaType("VIDEO", "mediaType")).toBe("VIDEO");
    expect(validateStoredMediaType("VIDEO_PREVIEW", "mediaType")).toBe(
      "VIDEO_PREVIEW",
    );
    expect(validateStoredMediaType("UNKNOWN", "mediaType")).toBe("UNKNOWN");
    expect(() => validateStoredMediaType("AUDIO", "mediaType")).toThrow(
      /must be one of/,
    );
    expect(() => validateStoredMediaType("image", "mediaType")).toThrow(
      /must be one of/,
    );
  });

  it("validates relationship positions as safe non-negative integers", () => {
    expect(validateNonNegativeInt(0, "position")).toBe(0);
    expect(validateNonNegativeInt(3, "position")).toBe(3);
    expect(() => validateNonNegativeInt(-1, "position")).toThrow(
      /must be >= 0/,
    );
    expect(() => validateNonNegativeInt(1.5, "position")).toThrow(
      /safe integer/,
    );
  });

  it("verifies MediaAssetConflictError contains structured error details", () => {
    const existingAsset = {
      id: "asset_uuid_1",
      sha256: expectedLowerSha,
      byteSize: BigInt(500),
      storageProvider: "r2",
      storageKey: "media/old_key.jpg",
      mediaType: "IMAGE",
    } as unknown as MediaAssetRow;

    const conflictingInput: StoredMediaInput = {
      sha256: expectedLowerSha,
      byteSize: BigInt(600), // Conflicting byteSize
      storageProvider: "r2",
      storageKey: "media/old_key.jpg",
      mediaType: "IMAGE",
    };

    const error = new MediaAssetConflictError(
      "Byte size conflict",
      expectedLowerSha,
      existingAsset,
      conflictingInput,
    );

    expect(error.name).toBe("MediaAssetConflictError");
    expect(error.sha256).toBe(expectedLowerSha);
    expect(error.existingAsset.id).toBe("asset_uuid_1");
    expect(error.conflictingInput.byteSize).toBe(BigInt(600));
    expect(error.message).toContain("Byte size conflict");
  });

  it("verifies DuplicateMediaRelationshipError contains parentId and sha details", () => {
    const error = new DuplicateMediaRelationshipError(
      "Duplicate relationship tuple",
      "parent_uuid_1",
      expectedLowerSha,
      0,
    );

    expect(error.name).toBe("DuplicateMediaRelationshipError");
    expect(error.parentId).toBe("parent_uuid_1");
    expect(error.sha256).toBe(expectedLowerSha);
    expect(error.position).toBe(0);
  });
});
