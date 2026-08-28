import type { AsterPostgresAdapter } from "@aster/postgres";

export async function probeEngagementStore(
  database: Pick<AsterPostgresAdapter, "transaction">,
  signal: AbortSignal,
): Promise<"ready" | "unavailable"> {
  const result = await database.transaction(async (tx) => {
    const role = await tx.query({
      text: `SELECT current_user = 'aster_engagement_local'
      AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND pg_has_role(current_user, 'aster_engagement_runtime', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'engagement', 'CREATE')
      AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN (current_user, 'aster_engagement_runtime')
        AND pg_has_role(current_user, delegated.oid, 'MEMBER'))
      AND NOT EXISTS (SELECT 1 FROM pg_namespace namespace WHERE namespace.nspname IN ('identity', 'catalog', 'playback', 'discovery')
        AND has_schema_privilege(current_user, namespace.oid, 'USAGE'))
      AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['progress','progress_receipts','outbox','profile_guards','profile_admission','schema_migrations']) name
        WHERE has_table_privilege(current_user, 'engagement.' || name, 'TRUNCATE,REFERENCES,TRIGGER'))
      AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['account_id','slot','deleted']) name
        WHERE has_column_privilege(current_user, 'engagement.profile_guards', name, 'UPDATE'))
      AND NOT has_table_privilege(current_user, 'engagement.profile_guards', 'UPDATE,DELETE')
      AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['id','account_id','profile_id','title_id','slot']) name
        WHERE has_column_privilege(current_user, 'engagement.progress', name, 'UPDATE'))
      AND NOT has_table_privilege(current_user, 'engagement.progress', 'DELETE')
      AND NOT has_table_privilege(current_user, 'engagement.outbox', 'UPDATE,DELETE')
      AND NOT has_table_privilege(current_user, 'engagement.schema_migrations', 'INSERT,UPDATE,DELETE')
      AND NOT has_any_column_privilege(current_user, 'engagement.schema_migrations', 'UPDATE,REFERENCES')
      AS allowed FROM pg_roles WHERE rolname = current_user`,
    });
    const data = role.rows[0] as Record<string, unknown> | undefined;
    if (role.rowCount !== 1 || data?.["allowed"] !== true) {
      return { action: "rollback", value: false };
    }
    const versions = await tx.query({
      text: "SELECT version FROM engagement.schema_migrations ORDER BY version LIMIT 2",
    });
    const version = versions.rows[0] as Record<string, unknown> | undefined;
    if (versions.rowCount !== 1 || version?.["version"] !== 1) {
      return { action: "rollback", value: false };
    }
    const admission = await tx.query({
      text: "SELECT singleton FROM engagement.profile_admission WHERE singleton = true",
    });
    if (admission.rowCount !== 1) {
      return { action: "rollback", value: false };
    }
    const constraint = await tx.query({
      text: "SELECT tgname FROM pg_trigger WHERE tgrelid = 'engagement.progress'::regclass AND tgname = 'engagement_progress_commit' AND tgdeferrable AND tginitdeferred AND tgenabled = 'O'",
    });
    if (constraint.rowCount !== 1) {
      return { action: "rollback", value: false };
    }
    await tx.query({
      text: `SELECT p.id, p.sequence, p.version, p.authority_checked_at, p.authority_expires_at,
      r.idempotency_key, r.result, o.event_id, o.event, g.deleted
      FROM engagement.progress p, engagement.progress_receipts r, engagement.outbox o, engagement.profile_guards g WHERE false`,
    });
    return { action: "rollback", value: true };
  }, signal);
  return result.status === "rolled_back" && result.value ? "ready" : "unavailable";
}
