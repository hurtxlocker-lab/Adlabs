/**
 * src/db/target-safety.ts
 *
 * Strict database target safety verifier.
 *
 * Prevents write-capable commands (migrations, DB integration tests) from
 * executing against the wrong Supabase project by verifying the project
 * reference embedded in DATABASE_URL matches SUPABASE_PROJECT_REF.
 *
 * Safety Invariants:
 *  1. Extracts project ref from connection string without logging secrets.
 *  2. Compares extracted ref against expected SUPABASE_PROJECT_REF.
 *  3. Fails closed (throws TargetSafetyError) on any mismatch, missing config, or parsing failure.
 *  4. Never exposes passwords, usernames, query parameters, or full URLs in errors or logs.
 */

export interface TargetSafetyResult {
  host: string;
  port: string;
  database: string;
  sslStatus: string;
  sslMode: string;
  projectRef: string;
  redactedProjectRef: string;
  matchesExpected: boolean;
}

export class TargetSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetSafetyError";
  }
}

/**
 * Safely redacts a project reference for display (e.g. "abc…xyz").
 */
export function redactProjectRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.length <= 6) {
    return "***";
  }
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-3)}`;
}

/**
 * Extracts the Supabase project reference from a PostgreSQL connection URL.
 *
 * Supported formats:
 *  - Supabase Pooler: username is `postgres.<project-ref>` or `<user>.<project-ref>`
 *  - Supabase Direct: host is `<project-ref>.supabase.co`
 */
export function extractSupabaseProjectRef(databaseUrl: string): string {
  if (!databaseUrl || typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    throw new TargetSafetyError(
      "DATABASE_URL is not set or empty.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new TargetSafetyError(
      "DATABASE_URL is not a valid URL format.",
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new TargetSafetyError(
      "DATABASE_URL has invalid protocol (expected postgresql: or postgres:).",
    );
  }

  // 1. Extract from Pooler username format (e.g. "postgres.<project-ref>")
  const username = decodeURIComponent(parsed.username || "");
  const poolerMatch = username.match(/^[^.]+\.([a-z0-9_-]+)$/i);
  if (poolerMatch && poolerMatch[1]) {
    return poolerMatch[1];
  }

  // 2. Extract from Direct host format (e.g. "db.<project-ref>.supabase.co" or "<project-ref>.supabase.co")
  const host = parsed.hostname;
  const directMatch = host.match(/^(?:db\.)?([a-z0-9_-]+)\.supabase\.co$/i);
  if (directMatch && directMatch[1]) {
    return directMatch[1];
  }

  throw new TargetSafetyError(
    "Could not determine Supabase project reference from connection target. (Unrecognized username/hostname format)",
  );
}

/**
 * Performs full target inspection and validates against expected SUPABASE_PROJECT_REF.
 * Fails closed on any error or mismatch.
 */
export function verifyDatabaseTargetSafety(
  databaseUrl: string,
  expectedProjectRef?: string | null,
): TargetSafetyResult {
  const projectRef = extractSupabaseProjectRef(databaseUrl);

  if (!expectedProjectRef || expectedProjectRef.trim().length === 0) {
    throw new TargetSafetyError(
      "SUPABASE_PROJECT_REF is not configured. Set SUPABASE_PROJECT_REF in .env.local to enable write-capable commands.",
    );
  }

  const expected = expectedProjectRef.trim();

  if (projectRef !== expected) {
    throw new TargetSafetyError(
      `Database target mismatch: connection points to project (${redactProjectRef(projectRef)}), but expected SUPABASE_PROJECT_REF is (${redactProjectRef(expected)}). Execution halted.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new TargetSafetyError("DATABASE_URL is invalid.");
  }

  const host = parsed.hostname;
  const port = parsed.port || "5432";
  const database = parsed.pathname.replace(/^\//, "") || "(default)";
  const sslMode =
    parsed.searchParams.get("sslmode") ??
    "not specified (driver default applies)";

  const isLocalhost =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  const sslStatus = isLocalhost
    ? "disabled (localhost)"
    : "required (non-localhost host — postgres.js auto-enables SSL)";

  return {
    host,
    port,
    database,
    sslStatus,
    sslMode,
    projectRef,
    redactedProjectRef: redactProjectRef(projectRef),
    matchesExpected: true,
  };
}
