import type { AsterPostgresAdapter } from "@aster/postgres";

type Database = Pick<AsterPostgresAdapter, "transaction">;

async function probe(
  database: Database,
  role: "runtime" | "projector",
  signal: AbortSignal,
): Promise<boolean> {
  const login = role === "runtime" ? "aster_discovery_local" : "aster_discovery_projector_local";
  const membership = role === "runtime" ? "aster_discovery_runtime" : "aster_discovery_projector";
  const foreign = role === "runtime" ? "aster_discovery_projector" : "aster_discovery_runtime";
  const result = await database.transaction(async (tx) => {
    const access = await tx.query({
      text: `SELECT current_user=$1::text
        AND rolcanlogin
        AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        AND pg_has_role(current_user,$2::text,'USAGE')
        AND NOT pg_has_role(current_user,$3::text,'USAGE')
        AND NOT has_schema_privilege(current_user,'discovery','CREATE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_namespace namespace
          WHERE namespace.nspname IN ('identity','catalog','playback','engagement')
            AND has_schema_privilege(current_user,namespace.oid,'USAGE')
        ) AS allowed FROM pg_roles WHERE rolname=current_user`,
      values: [login, membership, foreign],
    });
    if (
      access.rowCount !== 1 ||
      access.rows.length !== 1 ||
      Object.getOwnPropertyDescriptor(access.rows[0], "allowed")?.value !== true
    ) {
      return { action: "rollback", value: false } as const;
    }
    const versions = await tx.query({
      text: "SELECT version FROM discovery.schema_migrations ORDER BY version LIMIT 3",
    });
    if (
      versions.rowCount !== 2 ||
      versions.rows.length !== 2 ||
      versions.rows.some(
        (value, index) =>
          typeof value !== "object" ||
          value === null ||
          Object.getOwnPropertyDescriptor(value, "version")?.value !== index + 1,
      )
    ) {
      return { action: "rollback", value: false } as const;
    }
    const state = await tx.query({
      text: `SELECT c.singleton,g.state
        FROM discovery.generation_control c
        JOIN discovery.generations g ON g.id=c.active_generation
        WHERE c.singleton AND g.state='ACTIVE'`,
    });
    if (state.rowCount !== 1) {
      return { action: "rollback", value: false } as const;
    }
    if (role === "runtime") {
      const denied = await tx.query({
        text: `SELECT NOT has_table_privilege(current_user,'discovery.generations','INSERT,UPDATE,DELETE')
          AND NOT has_table_privilege(current_user,'discovery.generation_titles','INSERT,UPDATE,DELETE')
          AND NOT has_table_privilege(current_user,'discovery.search_documents','INSERT,UPDATE,DELETE')
          AS allowed`,
      });
      const row = denied.rows[0];
      if (
        denied.rowCount !== 1 ||
        typeof row !== "object" ||
        row === null ||
        Object.getOwnPropertyDescriptor(row, "allowed")?.value !== true
      ) {
        return { action: "rollback", value: false } as const;
      }
    } else {
      const functions = await tx.query({
        text: `SELECT
          has_function_privilege(current_user,
            'discovery.quarantine_catalog_record(uuid,text,integer,text,text,text,jsonb,text)','EXECUTE')
          AND has_function_privilege(current_user,
            'discovery.read_catalog_quarantine(uuid)','EXECUTE')
          AND has_function_privilege(current_user,
            'discovery.complete_catalog_replay(uuid)','EXECUTE')
          AND NOT has_table_privilege(current_user,'discovery.event_quarantine','SELECT,INSERT,UPDATE,DELETE')
          AS allowed`,
      });
      const row = functions.rows[0];
      if (
        functions.rowCount !== 1 ||
        typeof row !== "object" ||
        row === null ||
        Object.getOwnPropertyDescriptor(row, "allowed")?.value !== true
      ) {
        return { action: "rollback", value: false } as const;
      }
    }
    return { action: "rollback", value: true } as const;
  }, signal);
  return result.status === "rolled_back" && result.value;
}

export async function probeDiscoveryStores(
  runtime: Database,
  projector: Database,
  signal: AbortSignal,
): Promise<"ready" | "unavailable"> {
  const results = await Promise.all([
    probe(runtime, "runtime", signal),
    probe(projector, "projector", signal),
  ]).catch(() => [false, false]);
  return results.every(Boolean) ? "ready" : "unavailable";
}
