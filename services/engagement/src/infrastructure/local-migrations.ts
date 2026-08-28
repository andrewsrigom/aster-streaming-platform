import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { localEngagementDatabase } from "./runtime-configuration.js";

const MIGRATIONS = [
  "0001-progress",
  "0002-watchlist",
  "0003-event-relay",
  "0004-identity-events",
] as const;

export async function migrateLocalEngagement(
  environment: Readonly<Record<string, string | undefined>>,
  signal: AbortSignal,
) {
  const connectionString = localEngagementDatabase(environment, "migration");
  signal.throwIfAborted();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 1000,
    statement_timeout: 2000,
    query_timeout: 2500,
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
      "SELECT pg_try_advisory_lock(42781, 8) AS acquired",
    );
    if (lock.rows[0]?.acquired !== true) {
      throw new Error("Engagement migration already active.");
    }
    const relation = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('engagement.schema_migrations')::text AS relation",
    );
    const versions =
      relation.rows[0]?.relation === null
        ? []
        : (
            await client.query<{ version: number }>(
              "SELECT version FROM engagement.schema_migrations ORDER BY version LIMIT 5",
            )
          ).rows.map((row) => row.version);
    if (
      versions.length > MIGRATIONS.length ||
      versions.some((version, index) => version !== index + 1) ||
      (versions.length === 0 && relation.rows[0]?.relation !== null)
    ) {
      throw new Error("Unsupported Engagement schema.");
    }
    const applied: number[] = [];
    for (let index = versions.length; index < MIGRATIONS.length; index++) {
      signal.throwIfAborted();
      const sql = await readFile(
        new URL(`../../../migrations/${MIGRATIONS[index]}.up.sql`, import.meta.url),
        { encoding: "utf8", signal },
      );
      if (Buffer.byteLength(sql) > 16384) {
        throw new Error("Engagement migration exceeds its source bound.");
      }
      await client.query(sql);
      applied.push(index + 1);
    }
    signal.throwIfAborted();
    await client.query(`DO $local$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aster_engagement_local') THEN
        CREATE ROLE aster_engagement_local LOGIN PASSWORD 'aster-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END $local$`);
    const role = await client.query<{ allowed: boolean }>(`SELECT rolcanlogin
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN ('aster_engagement_local', 'aster_engagement_runtime')
        AND pg_has_role('aster_engagement_local', delegated.oid, 'MEMBER')) AS allowed
      FROM pg_roles WHERE rolname = 'aster_engagement_local'`);
    if (role.rows[0]?.allowed !== true) {
      throw new Error("Incompatible local Engagement login.");
    }
    await client.query("GRANT aster_engagement_runtime TO aster_engagement_local");
    await client.query(`DO $local$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aster_engagement_relay_local') THEN
        CREATE ROLE aster_engagement_relay_local LOGIN PASSWORD 'aster-test-only'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END $local$`);
    const relay = await client.query<{ allowed: boolean }>(`SELECT rolcanlogin
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN ('aster_engagement_relay_local', 'aster_engagement_relay')
        AND pg_has_role('aster_engagement_relay_local', delegated.oid, 'MEMBER')) AS allowed
      FROM pg_roles WHERE rolname = 'aster_engagement_relay_local'`);
    if (relay.rows[0]?.allowed !== true) {
      throw new Error("Incompatible local Engagement relay login.");
    }
    await client.query("GRANT aster_engagement_relay TO aster_engagement_relay_local");
    await client.query(`DO $local$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aster_engagement_consumer_local') THEN
        CREATE ROLE aster_engagement_consumer_local LOGIN PASSWORD 'aster-test-only'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END $local$`);
    const consumer = await client.query<{ allowed: boolean }>(`SELECT rolcanlogin
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN ('aster_engagement_consumer_local', 'aster_engagement_consumer')
        AND pg_has_role('aster_engagement_consumer_local', delegated.oid, 'MEMBER')) AS allowed
      FROM pg_roles WHERE rolname = 'aster_engagement_consumer_local'`);
    if (consumer.rows[0]?.allowed !== true) {
      throw new Error("Incompatible local Engagement consumer login.");
    }
    await client.query("GRANT aster_engagement_consumer TO aster_engagement_consumer_local");
    signal.throwIfAborted();
    return { applied: Object.freeze(applied) };
  } catch {
    throw new Error("Local Engagement migration did not complete.");
  } finally {
    signal.removeEventListener("abort", abort);
    await close();
  }
}
