BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';

REVOKE ALL ON discovery.rail_documents FROM aster_discovery_runtime;
DROP VIEW discovery.rail_documents;
DELETE FROM discovery.schema_migrations WHERE version = 3;
COMMIT;
