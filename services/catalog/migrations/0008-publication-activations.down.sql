BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
LOCK TABLE catalog.publication_outbox, catalog.command_audit, catalog.publication_activations IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM catalog.publication_activations)
    OR EXISTS (SELECT 1 FROM catalog.command_audit WHERE kind IN ('replace', 'rollback')) THEN
    RAISE EXCEPTION 'Retain publication activation audit; use a roll-forward migration';
  END IF;
END $guard$;
DROP TRIGGER record_publication_activation ON catalog.publication_outbox;
DROP FUNCTION catalog.record_publication_activation();
DROP TABLE catalog.publication_activations;
ALTER TABLE catalog.command_audit DROP CONSTRAINT command_audit_kind_check;
ALTER TABLE catalog.command_audit ADD CONSTRAINT command_audit_kind_check
  CHECK (kind IN ('create', 'edit', 'review', 'media-ready', 'publish', 'retire', 'dispute', 'expire', 'reopen'));
DELETE FROM catalog.schema_migrations WHERE version = 8;
COMMIT;
