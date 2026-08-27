import type { AsterPostgresAdapter } from "@aster/postgres";

export async function probeCatalogReader(
  database: Pick<AsterPostgresAdapter, "transaction">,
  signal: AbortSignal,
): Promise<"ready" | "unavailable"> {
  const result = await database.transaction(async (tx) => {
    const role = await tx.query({
      text: `SELECT current_user = 'aster_catalog_reader_local'
        AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        AND pg_has_role(current_user, 'aster_catalog_reader', 'USAGE')
        AND NOT pg_has_role(current_user, 'aster_catalog_runtime', 'MEMBER')
        AND NOT has_schema_privilege(current_user, 'catalog', 'CREATE')
        AND NOT COALESCE(has_schema_privilege(current_user, to_regnamespace('identity'), 'USAGE'), false)
        AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN (current_user, 'aster_catalog_reader')
          AND pg_has_role(current_user, delegated.oid, 'MEMBER'))
        AND NOT EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname IN ('catalog', 'identity') AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND NOT (namespace.nspname = 'catalog' AND relation.relname = 'public_candidates')
          AND (has_table_privilege(current_user, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(current_user, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
        AS allowed FROM pg_roles WHERE rolname = current_user`,
    });
    const data = role.rows[0] as Record<string, unknown> | undefined;
    if (role.rowCount !== 1 || data?.["allowed"] !== true) {
      return { action: "rollback", value: false };
    }
    await tx.query({
      text: "SELECT id, version, state, rights_revision, publication_id, latest_rights_revision, metadata, rights, publication FROM catalog.public_candidates WHERE false",
    });
    return { action: "rollback", value: true };
  }, signal);
  return result.status === "rolled_back" && result.value ? "ready" : "unavailable";
}
