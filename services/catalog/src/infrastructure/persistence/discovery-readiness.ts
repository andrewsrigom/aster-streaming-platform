import type { AsterPostgresAdapter } from "@aster/postgres";

export async function probeCatalogDiscoveryReader(
  database: Pick<AsterPostgresAdapter, "transaction">,
  signal: AbortSignal,
): Promise<"ready" | "unavailable"> {
  const result = await database.transaction(async (tx) => {
    const role = await tx.query({
      text: `SELECT current_user = 'aster_catalog_discovery_reader_local'
      AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      AND pg_has_role(current_user, 'aster_catalog_discovery_reader', 'USAGE')
      AND NOT has_schema_privilege(current_user, 'catalog', 'CREATE')
      AND NOT COALESCE(has_schema_privilege(current_user, to_regnamespace('identity'), 'USAGE'), false)
      AND NOT EXISTS (SELECT 1 FROM pg_roles delegated WHERE delegated.rolname NOT IN (current_user, 'aster_catalog_discovery_reader')
        AND pg_has_role(current_user, delegated.oid, 'MEMBER'))
      AND NOT EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname IN ('catalog', 'identity', 'playback', 'engagement', 'discovery')
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND NOT (namespace.nspname = 'catalog' AND relation.relname = 'discovery_sources')
          AND (has_table_privilege(current_user, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(current_user, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
      AS allowed FROM pg_roles WHERE rolname = current_user`,
    });
    const data = role.rows[0] as Record<string, unknown> | undefined;
    if (role.rowCount !== 1 || data?.["allowed"] !== true) {
      return { action: "rollback", value: false };
    }
    await tx.query({
      text: "SELECT title_id, source_version, candidate, published_at FROM catalog.discovery_sources WHERE false",
    });
    return { action: "rollback", value: true };
  }, signal);
  return result.status === "rolled_back" && result.value ? "ready" : "unavailable";
}
