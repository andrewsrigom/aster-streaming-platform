-- Disposable fixtures only: real publication/audit history requires roll-forward recovery.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
ALTER TABLE catalog.titles DROP CONSTRAINT publication_owner;
DROP TABLE catalog.publication_outbox;
DROP TABLE catalog.command_receipts;
DROP TABLE catalog.command_audit;
DROP TABLE catalog.publications;
REVOKE UPDATE (state, rights_revision, publication_id, metadata) ON catalog.titles FROM aster_catalog_runtime;
ALTER TABLE catalog.titles DROP COLUMN metadata;
DELETE FROM catalog.schema_migrations WHERE version = 2;
COMMIT;
