BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE TABLE catalog.media_requests (
  request_id uuid PRIMARY KEY,
  title_id uuid NOT NULL REFERENCES catalog.titles(id),
  rights_revision integer NOT NULL,
  actor_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  requested_at bigint NOT NULL CHECK (requested_at BETWEEN 0 AND 253402300799),
  source_fingerprint char(64) NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 16),
  request jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(request) = 'object' AND octet_length(request::text) <= 8192
    AND request->>'requestId' = request_id::text
    AND request->>'titleId' = title_id::text
    AND request->>'rightsRevision' = rights_revision::text, false)),
  UNIQUE (title_id, source_fingerprint),
  UNIQUE (title_id, slot),
  FOREIGN KEY (title_id, rights_revision) REFERENCES catalog.rights_revisions(title_id, revision)
);
REVOKE ALL ON catalog.media_requests FROM PUBLIC;
GRANT SELECT, INSERT ON catalog.media_requests TO aster_catalog_runtime;
INSERT INTO catalog.schema_migrations(version) VALUES (4);
COMMIT;
