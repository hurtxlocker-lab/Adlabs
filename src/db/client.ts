/**
 * Server-only Drizzle database client.
 *
 * Creates a single Drizzle ORM client backed by the postgres.js driver.
 * Suitable for Supabase Session Pooler (transaction-mode pooling).
 *
 * Design decisions:
 *
 *  1. Uses "server-only" to prevent accidental import in Client Components.
 *  2. Uses "postgres" (postgres.js) as the driver — it is the officially
 *     documented Drizzle driver for Supabase Session Pooler.
 *  3. The connection instance is cached in a module-level variable and
 *     reused across hot-reload cycles in development via `globalThis`.
 *     Without this, each HMR cycle would open a new connection pool.
 *  4. No query is executed on import — importing this module is side-effect
 *     free apart from the initial connection pool creation.
 *  5. The schema is empty at Step 3A. It will be extended in Step 3B.
 *
 * Supabase Session Pooler notes:
 *  - Session Pooler (port 5432 or 6543) supports prepared statements.
 *  - postgres.js uses prepared statements by default; no extra config needed.
 *  - SSL is required by Supabase; postgres.js enables it automatically
 *    when the host is not localhost.
 */

import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env/server";
import * as schema from "@/db/schema";

// ---------------------------------------------------------------------------
// Connection pool — reused across Next.js hot-reload in development.
// In production each process creates exactly one pool.
// ---------------------------------------------------------------------------

const globalForDb = globalThis as unknown as {
  _pgClient: postgres.Sql | undefined;
};

const sql =
  globalForDb._pgClient ??
  postgres(env.DATABASE_URL, {
    ssl: "require",
    max: 1,
    idle_timeout: 1,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = sql;
}

// ---------------------------------------------------------------------------
// Drizzle client — the exported interface for all database queries.
// ---------------------------------------------------------------------------

export const db = drizzle(sql, { schema });

/**
 * Safely closes the underlying PostgreSQL connection pool.
 * Used by CLI scripts and standalone runners to ensure clean process termination.
 */
export async function closeDatabaseConnection(): Promise<void> {
  await sql.end();
  if (process.env.NODE_ENV !== "production") {
    globalForDb._pgClient = undefined;
  }
}
