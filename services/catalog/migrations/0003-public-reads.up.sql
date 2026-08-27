BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE ROLE aster_catalog_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE INDEX catalog_published_titles ON catalog.titles(id) WHERE state = 'PUBLISHED';
CREATE VIEW catalog.public_candidates WITH (security_barrier = true) AS
SELECT t.id, t.version, t.state, t.rights_revision, t.publication_id, t.latest_rights_revision,
  t.metadata, r.record AS rights,
  jsonb_build_object('id', p.id, 'titleId', p.title_id, 'rightsRevision', p.rights_revision,
    'sourceChecksum', p.source_checksum, 'manifestUrl', p.manifest_url,
    'validationReportId', p.validation_report_id, 'validatedAt', p.validated_at) AS publication
FROM catalog.titles t
JOIN catalog.rights_revisions r ON r.title_id = t.id AND r.revision = t.rights_revision
JOIN catalog.publications p ON p.title_id = t.id AND p.id = t.publication_id AND p.rights_revision = t.rights_revision
WHERE t.state = 'PUBLISHED' AND t.latest_rights_revision = t.rights_revision AND r.status = 'APPROVED';
REVOKE ALL ON catalog.public_candidates FROM PUBLIC;
GRANT USAGE ON SCHEMA catalog TO aster_catalog_reader;
GRANT SELECT ON catalog.public_candidates TO aster_catalog_reader;
INSERT INTO catalog.schema_migrations(version) VALUES (3);
COMMIT;
