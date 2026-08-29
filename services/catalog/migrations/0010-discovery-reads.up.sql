BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE ROLE aster_catalog_discovery_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE VIEW catalog.discovery_sources WITH (security_barrier = true) AS
SELECT t.id AS title_id, t.version AS source_version,
  CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'title', jsonb_build_object('id', p.id, 'version', p.version, 'state', p.state,
      'rightsRevision', p.rights_revision, 'publicationId', p.publication_id),
    'latestRightsRevision', p.latest_rights_revision,
    'metadata', p.metadata, 'rights', p.rights, 'publication', p.publication)
  END AS candidate,
  CASE WHEN p.id IS NULL THEN NULL ELSE (
    SELECT a.occurred_at
    FROM catalog.publication_activations activation
    JOIN catalog.command_audit a USING (title_id, title_version)
    WHERE activation.title_id = t.id AND activation.publication_id = t.publication_id
    ORDER BY activation.title_version DESC LIMIT 1
  ) END AS published_at
FROM catalog.titles t LEFT JOIN catalog.public_candidates p ON p.id = t.id;
REVOKE ALL ON catalog.discovery_sources FROM PUBLIC;
GRANT USAGE ON SCHEMA catalog TO aster_catalog_discovery_reader;
GRANT SELECT ON catalog.discovery_sources TO aster_catalog_discovery_reader;
INSERT INTO catalog.schema_migrations(version) VALUES (10);
COMMIT;
