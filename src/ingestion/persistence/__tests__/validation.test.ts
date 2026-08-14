import { describe, expect, it } from "vitest";
import {
  validateNonEmptyString,
  validateNonNegativeBigInt,
  validateNonNegativeInt,
  validateUuid,
} from "../validation";
import {
  IngestionRunStateError,
  InvalidCounterError,
  SourceAccountOwnershipConflictError,
  type SourceAccountRow,
} from "../types";

describe("Persistence Validation & Types", () => {
  describe("validateNonEmptyString", () => {
    it("should return trimmed string when valid", () => {
      expect(validateNonEmptyString("  valid string  ", "test")).toBe(
        "valid string",
      );
    });

    it("should throw on empty, blank, or non-string values", () => {
      expect(() => validateNonEmptyString("", "test")).toThrow(
        /must be a non-empty string/i,
      );
      expect(() => validateNonEmptyString("   \t\n", "test")).toThrow(
        /must be a non-empty string/i,
      );
      expect(() => validateNonEmptyString(null, "test")).toThrow(
        /must be a non-empty string/i,
      );
      expect(() => validateNonEmptyString(12345, "test")).toThrow(
        /must be a non-empty string/i,
      );
    });
  });

  describe("validateUuid", () => {
    it("should accept valid UUID format", () => {
      const validUuid = "123e4567-e89b-12d3-a456-426614174000";
      expect(validateUuid(validUuid, "id")).toBe(validUuid);
    });

    it("should throw on invalid UUID formats", () => {
      expect(() => validateUuid("not-a-uuid", "id")).toThrow(
        /must be a valid UUID format/i,
      );
      expect(() =>
        validateUuid("123e4567-e89b-12d3-a456-42661417400Z", "id"),
      ).toThrow(/must be a valid UUID format/i);
    });
  });

  describe("validateNonNegativeInt", () => {
    it("should accept valid non-negative safe integers", () => {
      expect(validateNonNegativeInt(0, "counter")).toBe(0);
      expect(validateNonNegativeInt(42, "counter")).toBe(42);
      expect(validateNonNegativeInt(1_000_000, "counter")).toBe(1_000_000);
    });

    it("should reject negative numbers", () => {
      expect(() => validateNonNegativeInt(-1, "counter")).toThrow(
        InvalidCounterError,
      );
    });

    it("should reject floating point numbers", () => {
      expect(() => validateNonNegativeInt(3.14, "counter")).toThrow(
        InvalidCounterError,
      );
    });

    it("should reject NaN, Infinity, and unsafe numbers", () => {
      expect(() => validateNonNegativeInt(Number.NaN, "counter")).toThrow(
        InvalidCounterError,
      );
      expect(() => validateNonNegativeInt(Number.POSITIVE_INFINITY, "counter")).toThrow(
        InvalidCounterError,
      );
      expect(() =>
        validateNonNegativeInt(9007199254740993, "counter"),
      ).toThrow(InvalidCounterError);
    });

    it("should reject non-number types", () => {
      expect(() => validateNonNegativeInt("10", "counter")).toThrow(
        InvalidCounterError,
      );
      expect(() => validateNonNegativeInt(null, "counter")).toThrow(
        InvalidCounterError,
      );
    });
  });

  describe("validateNonNegativeBigInt", () => {
    it("should accept valid non-negative bigints", () => {
      expect(validateNonNegativeBigInt(BigInt(0), "byteCounter")).toBe(
        BigInt(0),
      );
      expect(validateNonNegativeBigInt(BigInt(1048576), "byteCounter")).toBe(
        BigInt(1048576),
      );
    });

    it("should reject negative bigints", () => {
      expect(() =>
        validateNonNegativeBigInt(BigInt(-1), "byteCounter"),
      ).toThrow(InvalidCounterError);
    });

    it("should reject standard numbers or non-bigint types", () => {
      expect(() => validateNonNegativeBigInt(100, "byteCounter")).toThrow(
        InvalidCounterError,
      );
      expect(() => validateNonNegativeBigInt("100", "byteCounter")).toThrow(
        InvalidCounterError,
      );
    });
  });

  describe("Domain Errors", () => {
    it("should carry structured context in SourceAccountOwnershipConflictError", () => {
      const mockAccount: SourceAccountRow = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        brandId: "brand-1111-1111",
        source: "meta",
        sourcePageId: "10982347102",
        sourcePageUrl: null,
        displayName: "Mamaearth India",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const error = new SourceAccountOwnershipConflictError(
        "Conflict detected",
        mockAccount,
        "brand-2222-2222",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("SourceAccountOwnershipConflictError");
      expect(error.existingAccount).toBe(mockAccount);
      expect(error.attemptedBrandId).toBe("brand-2222-2222");
    });

    it("should instantiate IngestionRunStateError and InvalidCounterError correctly", () => {
      const stateErr = new IngestionRunStateError("Run already finished");
      expect(stateErr).toBeInstanceOf(Error);
      expect(stateErr.name).toBe("IngestionRunStateError");

      const counterErr = new InvalidCounterError("Negative counter");
      expect(counterErr).toBeInstanceOf(Error);
      expect(counterErr.name).toBe("InvalidCounterError");
    });
  });
});
