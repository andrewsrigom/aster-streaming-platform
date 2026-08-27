BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
DROP VIEW catalog.public_candidates;
DROP INDEX catalog.catalog_published_titles;
REVOKE USAGE ON SCHEMA catalog FROM aster_catalog_reader;
DROP ROLE aster_catalog_reader;
DELETE FROM catalog.schema_migrations WHERE version = 3;
COMMIT;
