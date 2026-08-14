import { InvalidCounterError } from "./types";

/**
 * Validates that a string is non-empty and trimmed.
 */
export function validateNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Field "${fieldName}" must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Validates a UUID string format.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateUuid(value: unknown, fieldName: string): string {
  const str = validateNonEmptyString(value, fieldName);
  if (!UUID_REGEX.test(str)) {
    throw new Error(`Field "${fieldName}" must be a valid UUID format`);
  }
  return str;
}

/**
 * Validates that an integer counter is a finite, safe integer >= 0.
 */
export function validateNonNegativeInt(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new InvalidCounterError(
      `Counter "${fieldName}" must be a number, received ${typeof value}`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new InvalidCounterError(
      `Counter "${fieldName}" must be a safe integer, received ${value}`,
    );
  }
  if (value < 0) {
    throw new InvalidCounterError(
      `Counter "${fieldName}" must be >= 0, received ${value}`,
    );
  }
  return value;
}

/**
 * Validates that a byte counter is a bigint >= 0n.
 */
export function validateNonNegativeBigInt(
  value: unknown,
  fieldName: string,
): bigint {
  if (typeof value !== "bigint") {
    throw new InvalidCounterError(
      `Byte counter "${fieldName}" must be a bigint, received ${typeof value}`,
    );
  }
  if (value < BigInt(0)) {
    throw new InvalidCounterError(
      `Byte counter "${fieldName}" must be >= 0, received ${value}`,
    );
  }
  return value;
}
