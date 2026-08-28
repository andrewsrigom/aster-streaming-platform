import type { AsterPostgresAdapter } from "@aster/postgres";

export async function probePlaybackStore(
  database: Pick<AsterPostgresAdapter, "transaction">,
  signal: AbortSignal,
): Promise<"ready" | "unavailable"> {
  const result = await database.transaction(async (tx) => {
    const role = await tx.query({
      text: `SELECT current_user = 'aster_playback_local'
      AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND pg_has_role(current_user, 'aster_playback_runtime', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'playback', 'CREATE')
      AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN (current_user, 'aster_playback_runtime')
        AND pg_has_role(current_user, delegated.oid, 'MEMBER'))
      AND NOT EXISTS (SELECT 1 FROM pg_namespace namespace WHERE namespace.nspname IN ('identity', 'catalog', 'engagement', 'discovery')
        AND has_schema_privilege(current_user, namespace.oid, 'USAGE'))
      AND NOT has_table_privilege(current_user, 'playback.sessions', 'UPDATE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_any_column_privilege(current_user, 'playback.sessions', 'UPDATE,REFERENCES')
      AND NOT has_table_privilege(current_user, 'playback.schema_migrations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND NOT has_any_column_privilege(current_user, 'playback.schema_migrations', 'UPDATE,REFERENCES')
      AS allowed FROM pg_roles WHERE rolname = current_user`,
    });
    const data = role.rows[0] as Record<string, unknown> | undefined;
    if (role.rowCount !== 1 || data?.["allowed"] !== true) {
      return { action: "rollback", value: false };
    }
    const versions = await tx.query({
      text: "SELECT version FROM playback.schema_migrations ORDER BY version LIMIT 2",
    });
    const version = versions.rows[0] as Record<string, unknown> | undefined;
    if (versions.rowCount !== 1 || version?.["version"] !== 1) {
      return { action: "rollback", value: false };
    }
    const admission = await tx.query({
      text: "SELECT singleton FROM playback.session_admission WHERE singleton = true",
    });
    if (admission.rowCount !== 1) {
      return { action: "rollback", value: false };
    }
    await tx.query({
      text: "SELECT id, slot, title_id, publication_id, catalog_version, catalog_checked_at, manifest_url, created_at, expires_at, correlation_id FROM playback.sessions WHERE false",
    });
    return { action: "rollback", value: true };
  }, signal);
  return result.status === "rolled_back" && result.value ? "ready" : "unavailable";
}
