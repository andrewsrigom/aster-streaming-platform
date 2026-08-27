-- Destructive recovery for explicitly disposable fixtures only; never discard real rights evidence.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
ALTER TABLE catalog.titles DROP CONSTRAINT latest_rights_owner;
ALTER TABLE catalog.titles DROP CONSTRAINT active_rights_owner;
ALTER TABLE catalog.rights_revisions DROP CONSTRAINT rights_provenance;
DROP TABLE catalog.rights_audit;
DROP TABLE catalog.rights_revisions;
DROP TABLE catalog.titles;
DROP TABLE catalog.schema_migrations;
DROP SCHEMA catalog;
DROP ROLE aster_catalog_runtime;
COMMIT;
