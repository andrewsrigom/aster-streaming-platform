import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { localCatalogDatabase } from "../identity/local-configuration.js";

const migrations = ["0001-rights-history", "0002-editorial-workflow", "0003-public-reads"] as const;
export async function migrateLocalCatalog(
  environment: Readonly<Record<string, string | undefined>>,
  signal: AbortSignal,
) {
  const connectionString = localCatalogDatabase(environment, "migration");
  signal.throwIfAborted();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 1000,
    query_timeout: 2500,
    statement_timeout: 2000,
    lock_timeout: 1000,
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
      "SELECT pg_try_advisory_lock(42781, 3) AS acquired",
    );
    if (lock.rows[0]?.acquired !== true) {
      throw new Error("Catalog migration already active.");
    }
    const relation = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('catalog.schema_migrations')::text AS relation",
    );
    const versions =
      relation.rows[0]?.relation === null
        ? []
        : (
            await client.query<{ version: number }>(
              "SELECT version FROM catalog.schema_migrations ORDER BY version LIMIT 4",
            )
          ).rows.map((row) => row.version);
    if (
      versions.length > migrations.length ||
      versions.some((version, index) => version !== index + 1) ||
      (versions.length === 0 && relation.rows[0]?.relation !== null)
    ) {
      throw new Error("Unsupported Catalog schema.");
    }
    const applied: number[] = [];
    for (let index = versions.length; index < migrations.length; index++) {
      signal.throwIfAborted();
      const sql = await readFile(
        new URL(`../../../../migrations/${migrations[index]}.up.sql`, import.meta.url),
        { encoding: "utf8", signal },
      );
      if (Buffer.byteLength(sql) > 16384) {
        throw new Error("Catalog migration exceeds its source bound.");
      }
      await client.query(sql);
      applied.push(index + 1);
    }
    await client.query(
      "DO $local$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aster_catalog_local') THEN CREATE ROLE aster_catalog_local LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $local$",
    );
    const role = await client.query<{ allowed: boolean }>(
      "SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AS allowed FROM pg_roles WHERE rolname = 'aster_catalog_local'",
    );
    if (role.rows[0]?.allowed !== true) {
      throw new Error("Incompatible local Catalog role.");
    }
    await client.query("GRANT aster_catalog_runtime TO aster_catalog_local");
    signal.throwIfAborted();
    return { applied: Object.freeze(applied) };
  } finally {
    signal.removeEventListener("abort", abort);
    await close();
  }
}
