BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE TABLE catalog.media_processing (
  id uuid PRIMARY KEY,
  acquisition_id uuid NOT NULL REFERENCES catalog.media_acquisitions(id),
  request_id uuid NOT NULL REFERENCES catalog.media_requests(request_id),
  processing_key text NOT NULL CHECK (processing_key ~ '^[a-f0-9]{64}$'),
  number smallint NOT NULL CHECK (number BETWEEN 1 AND 3),
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  record jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(record) = 'object' AND octet_length(record::text) <= 4096
    AND record->>'id' = id::text AND record->>'acquisitionId' = acquisition_id::text
    AND record->>'requestId' = request_id::text AND record->>'processingKey' = processing_key
    AND record->>'number' = number::text AND record->>'status' = status, false)),
  UNIQUE (processing_key, number)
);
CREATE UNIQUE INDEX media_processing_running ON catalog.media_processing ((true)) WHERE status = 'RUNNING';
REVOKE ALL ON catalog.media_processing FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON catalog.media_processing TO aster_catalog_runtime;
INSERT INTO catalog.schema_migrations(version) VALUES (6);
COMMIT;
