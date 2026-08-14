import {
  curiousCoderItemSchema,
  type CuriousCoderItem,
} from "./schema";

export interface ParsedCuriousCoderPayload {
  data: CuriousCoderItem;
  raw: unknown;
}

export type ParseCuriousCoderResult =
  | { success: true; data: CuriousCoderItem; raw: unknown }
  | { success: false; error: Error; raw: unknown };

/**
 * Validates and parses a Curious Coder raw item into a strongly typed structure,
 * while preserving the original unmodified raw object for downstream raw storage.
 *
 * Throws an Error if required identity fields (e.g. ad_archive_id) are missing.
 */
export function parseCuriousCoderItem(raw: unknown): ParsedCuriousCoderPayload {
  const result = curiousCoderItemSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `[${issue.path.join(".") || "root"}]: ${issue.message}`)
      .join(", ");
    throw new Error(`Curious Coder payload validation failed: ${formatted}`);
  }

  return {
    data: result.data,
    raw,
  };
}

/**
 * Non-throwing variant for batch or pipeline error-handling.
 */
export function safeParseCuriousCoderItem(
  raw: unknown,
): ParseCuriousCoderResult {
  const result = curiousCoderItemSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `[${issue.path.join(".") || "root"}]: ${issue.message}`)
      .join(", ");
    return {
      success: false,
      error: new Error(`Curious Coder payload validation failed: ${formatted}`),
      raw,
    };
  }

  return {
    success: true,
    data: result.data,
    raw,
  };
}
