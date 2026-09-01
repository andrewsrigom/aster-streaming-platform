import { createHash } from "node:crypto";

export const PREPARE_QUERY_COUNT_SQL =
  "CREATE EXTENSION IF NOT EXISTS pg_stat_statements; SELECT pg_stat_statements_reset();";
export const RESET_QUERY_COUNT_SQL = "SELECT pg_stat_statements_reset();";
export const READ_QUERY_COUNT_SQL = String.raw`
  SELECT COALESCE(jsonb_object_agg(owner, calls ORDER BY owner), '{}'::jsonb) AS counts
  FROM (
    SELECT
      CASE role.rolname
        WHEN 'aster_catalog_reader_local' THEN 'catalog'
        WHEN 'aster_discovery_local' THEN 'discovery'
        WHEN 'aster_engagement_local' THEN 'engagement'
        WHEN 'aster_identity_local' THEN 'identity'
        WHEN 'aster_playback_local' THEN 'playback'
      END AS owner,
      sum(statement.calls)::int AS calls
    FROM pg_stat_statements statement
    JOIN pg_roles role ON role.oid = statement.userid
    WHERE role.rolname IN (
      'aster_catalog_reader_local',
      'aster_discovery_local',
      'aster_engagement_local',
      'aster_identity_local',
      'aster_playback_local'
    )
      AND statement.query !~* 'pg_(roles|namespace|class|constraint|attribute|proc|trigger)|information_schema|schema_migrations|has_(schema|table|function)_privilege'
      AND statement.query !~* 'FROM catalog\.public_candidates WHERE (false|\$[0-9]+)\s*$'
      AND statement.query !~* 'FROM discovery\.generation_control c\s+JOIN discovery\.generations g ON g\.id=c\.active_generation\s+WHERE c\.singleton AND g\.state=(''ACTIVE''|\$[0-9]+)\s*$'
      AND statement.query !~* 'SELECT g\.id::text AS generation,g\.started_at\s+FROM discovery\.generation_control c\s+JOIN discovery\.generations g ON g\.id=c\.active_generation'
      AND statement.query !~* 'FROM engagement\.profile_admission WHERE singleton'
      AND statement.query !~* 'FROM engagement\.progress p, engagement\.progress_receipts r, engagement\.outbox o, engagement\.profile_guards g WHERE (false|\$[0-9]+)\s*$'
      AND statement.query !~* 'FROM identity\.accounts a, identity\.sessions s, identity\.profiles p,\s+identity\.profile_receipts r, identity\.profile_audit u, identity\.profile_outbox o\s+WHERE (false|\$[0-9]+)\s*$'
      AND statement.query !~* 'FROM playback\.sessions WHERE (false|\$[0-9]+)\s*$'
      AND (
        (role.rolname = 'aster_catalog_reader_local' AND position('catalog.' in statement.query) > 0)
        OR (role.rolname = 'aster_discovery_local' AND position('discovery.' in statement.query) > 0)
        OR (role.rolname = 'aster_engagement_local' AND position('engagement.' in statement.query) > 0)
        OR (role.rolname = 'aster_identity_local' AND position('identity.' in statement.query) > 0)
        OR (role.rolname = 'aster_playback_local' AND position('playback.' in statement.query) > 0)
      )
    GROUP BY role.rolname
  ) measured`;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object.");
  }
  return value;
}

export function selectCurrentTrustedOperation(persistedSource, deliverySource, name) {
  const persisted = object(JSON.parse(persistedSource), "Persisted operation manifest");
  const delivery = object(JSON.parse(deliverySource), "Schema delivery manifest");
  if (!Array.isArray(persisted.operations) || !Array.isArray(delivery.operations)) {
    throw new Error("Operation manifests require finite operation arrays.");
  }
  const current = delivery.operations.filter((entry) => entry?.name === name);
  if (
    current.length !== 1 ||
    typeof current[0]?.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(current[0].sha256)
  ) {
    throw new Error(name + " requires exactly one current delivery hash.");
  }
  const matches = persisted.operations.filter(
    (entry) => entry?.name === name && entry?.id === current[0].sha256,
  );
  const selected = matches[0];
  if (
    matches.length !== 1 ||
    typeof selected?.body !== "string" ||
    selected.type !== "query" ||
    createHash("sha256").update(selected.body).digest("hex") !== selected.id
  ) {
    throw new Error(name + " current trusted body is missing, ambiguous or invalid.");
  }
  return Object.freeze({ body: selected.body, id: selected.id, name, type: selected.type });
}

export function assertFederatedQueryBudget(operation, perOwner, maximumByOwner) {
  const counts = object(perOwner, operation + " query counts");
  const budget = object(maximumByOwner, operation + " query budget");
  const owners = Object.keys(counts).toSorted((left, right) => left.localeCompare(right, "en"));
  const expected = Object.keys(budget).toSorted((left, right) => left.localeCompare(right, "en"));
  if (owners.join("\0") !== expected.join("\0")) {
    throw new Error(`${operation} queried an unexpected owner set: ${owners.join(",")}.`);
  }
  let total = 0;
  for (const owner of owners) {
    const count = counts[owner];
    const maximum = budget[owner];
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      !Number.isSafeInteger(maximum) ||
      maximum < 1 ||
      count > maximum
    ) {
      throw new Error(`${operation} ${owner} query count ${String(count)} exceeds its bound.`);
    }
    total += count;
  }
  return total;
}
