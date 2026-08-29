import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { localDiscoveryDatabase } from "./runtime-configuration.js";

const MIGRATIONS = ["0001-title-projections", "0002-catalog-events", "0003-home-rails"] as const;
const MAX_COMPATIBLE_SCHEMA_VERSION = 3;

export function discoveryLocalSchemaCompatible(
  versions: readonly number[],
  relationExists: boolean,
): boolean {
  return (
    versions.length <= MAX_COMPATIBLE_SCHEMA_VERSION &&
    !(versions.length === 0 && relationExists) &&
    versions.every((version, index) => version === index + 1)
  );
}

async function ensureLogin(
  client: Client,
  login: "aster_discovery_local" | "aster_discovery_projector_local",
  role: "aster_discovery_runtime" | "aster_discovery_projector",
): Promise<void> {
  await client.query(`DO $local$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${login}') THEN
      CREATE ROLE ${login} LOGIN PASSWORD 'aster-test-only'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    END IF;
  END $local$`);
  const check = await client.query<{ allowed: boolean }>(`SELECT rolcanlogin
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    AND NOT EXISTS (
      SELECT 1 FROM pg_roles delegated
      WHERE delegated.rolname NOT IN ('${login}', '${role}')
        AND pg_has_role('${login}', delegated.oid, 'MEMBER')
    ) AS allowed FROM pg_roles WHERE rolname = '${login}'`);
  if (check.rows[0]?.allowed !== true) {
    throw new Error("Incompatible local Discovery login.");
  }
  await client.query(`GRANT ${role} TO ${login}`);
}

export async function migrateLocalDiscovery(
  environment: Readonly<Record<string, string | undefined>>,
  signal: AbortSignal,
) {
  const connectionString = localDiscoveryDatabase(environment, "migration");
  signal.throwIfAborted();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 1_000,
    statement_timeout: 2_000,
    query_timeout: 2_500,
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
      "SELECT pg_try_advisory_lock(42781, 9) AS acquired",
    );
    if (lock.rows[0]?.acquired !== true) {
      throw new Error("Discovery migration already active.");
    }
    const relation = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('discovery.schema_migrations')::text AS relation",
    );
    const versions =
      relation.rows[0]?.relation === null
        ? []
        : (
            await client.query<{ version: number }>(
              `SELECT version FROM discovery.schema_migrations ORDER BY version LIMIT ${MAX_COMPATIBLE_SCHEMA_VERSION + 1}`,
            )
          ).rows.map((row) => row.version);
    if (!discoveryLocalSchemaCompatible(versions, relation.rows[0]?.relation !== null)) {
      throw new Error("Unsupported Discovery schema.");
    }
    const applied: number[] = [];
    for (let index = versions.length; index < MIGRATIONS.length; index++) {
      signal.throwIfAborted();
      const sql = await readFile(
        new URL(`../../../migrations/${MIGRATIONS[index]}.up.sql`, import.meta.url),
        { encoding: "utf8", signal },
      );
      if (Buffer.byteLength(sql) > 16_384) {
        throw new Error("Discovery migration exceeds its source bound.");
      }
      await client.query(sql);
      applied.push(index + 1);
    }
    await ensureLogin(client, "aster_discovery_local", "aster_discovery_runtime");
    await ensureLogin(client, "aster_discovery_projector_local", "aster_discovery_projector");
    signal.throwIfAborted();
    return { applied: Object.freeze(applied) };
  } catch {
    throw new Error("Local Discovery migration did not complete.");
  } finally {
    signal.removeEventListener("abort", abort);
    await close();
  }
}
