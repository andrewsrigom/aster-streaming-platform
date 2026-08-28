BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE TABLE catalog.media_acquisitions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES catalog.media_requests(request_id),
  number smallint NOT NULL CHECK (number BETWEEN 1 AND 3),
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  record jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(record) = 'object' AND octet_length(record::text) <= 2048
    AND record->>'id' = id::text AND record->>'requestId' = request_id::text
    AND record->>'number' = number::text AND record->>'status' = status, false)),
  UNIQUE (request_id, number)
);
CREATE UNIQUE INDEX media_acquisitions_running ON catalog.media_acquisitions ((true)) WHERE status = 'RUNNING';
REVOKE ALL ON catalog.media_acquisitions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON catalog.media_acquisitions TO aster_catalog_runtime;
INSERT INTO catalog.schema_migrations(version) VALUES (5);
COMMIT;
