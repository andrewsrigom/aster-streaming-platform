BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';

CREATE VIEW discovery.rail_documents WITH (security_barrier = true) AS
SELECT
  title.generation_id,
  title.title_id,
  title.source_version,
  title.indexed_at,
  title.visible_until,
  fence.published_at,
  fence.genres,
  fence.editorial_labels
FROM discovery.generation_titles title
JOIN discovery.title_fences fence
  ON fence.title_id = title.title_id
  AND fence.source_version = title.source_version
  AND fence.document_digest = title.document_digest
WHERE title.document_digest IS NOT NULL;

REVOKE ALL ON discovery.rail_documents FROM PUBLIC, aster_discovery_projector;
GRANT SELECT ON discovery.rail_documents TO aster_discovery_runtime;

INSERT INTO discovery.schema_migrations(version) VALUES (3);
COMMIT;
