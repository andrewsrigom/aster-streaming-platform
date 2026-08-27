import { readFile } from "node:fs/promises";

import type { ReferenceRuntimeConfig } from "@aster/config";
import { Client } from "pg";

import { validateLocalIdentityConfiguration } from "../identity/local-identity.js";

const MIGRATIONS = ["0001-accounts-sessions", "0002-profiles-outbox"] as const;

export async function migrateLocalIdentity(
  configuration: ReferenceRuntimeConfig,
  signal: AbortSignal,
): Promise<Readonly<{ applied: readonly number[] }>> {
  validateLocalIdentityConfiguration({
    environment: configuration.environment,
    localDemoEnabled: configuration.localDemo !== undefined,
    publicOrigin: configuration.localDemo?.publicOrigin ?? "",
  });
  signal.throwIfAborted();
  const client = new Client({
    connectionString: configuration.databaseUrl,
    connectionTimeoutMillis: 1_000,
    query_timeout: 2_500,
    statement_timeout: 2_000,
    lock_timeout: 1_000,
  });
  client.on("error", () => undefined);
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= client.end();
    return closing;
  };
  const abort = (): void => {
    void close().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await client.connect();
    signal.throwIfAborted();
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(42781, 2) AS acquired",
    );
    if (lock.rows[0]?.acquired !== true) {
      throw new Error("Identity migration is already active.");
    }
    const relation = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('identity.schema_migrations')::text AS relation",
    );
    const versions =
      relation.rows[0]?.relation === null
        ? []
        : (
            await client.query<{ version: number }>(
              "SELECT version FROM identity.schema_migrations ORDER BY version LIMIT 3",
            )
          ).rows.map((row) => row.version);
    if (
      versions.length > MIGRATIONS.length ||
      versions.some((version, index) => version !== index + 1) ||
      (versions.length === 0 && relation.rows[0]?.relation !== null)
    ) {
      throw new Error("Identity schema version is unsupported.");
    }
    const applied: number[] = [];
    for (let index = versions.length; index < MIGRATIONS.length; index++) {
      signal.throwIfAborted();
      const sql = await readFile(
        new URL(`../../../../migrations/${MIGRATIONS[index]}.up.sql`, import.meta.url),
        { encoding: "utf8", signal },
      );
      if (Buffer.byteLength(sql) > 16_384) {
        throw new Error("Identity migration exceeds its source bound.");
      }
      await client.query(sql);
      applied.push(index + 1);
    }
    signal.throwIfAborted();
    await client.query(`DO $local$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aster_identity_local') THEN
          CREATE ROLE aster_identity_local LOGIN PASSWORD 'aster-test-only'
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        END IF;
      END $local$`);
    const role = await client.query<{ allowed: boolean }>(
      `SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        AS allowed FROM pg_roles WHERE rolname = 'aster_identity_local'`,
    );
    if (role.rows[0]?.allowed !== true) {
      throw new Error("Local Identity login has incompatible privileges.");
    }
    await client.query("GRANT aster_identity_runtime TO aster_identity_local");
    signal.throwIfAborted();
    return { applied: Object.freeze(applied) };
  } catch {
    throw new Error("Local Identity migration did not complete.");
  } finally {
    signal.removeEventListener("abort", abort);
    // Closing this sole connection also releases the session advisory lock.
    await close();
  }
}
