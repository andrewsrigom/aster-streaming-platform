BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
DROP VIEW catalog.discovery_sources;
REVOKE USAGE ON SCHEMA catalog FROM aster_catalog_discovery_reader;
DROP ROLE aster_catalog_discovery_reader;
DELETE FROM catalog.schema_migrations WHERE version = 10;
COMMIT;
