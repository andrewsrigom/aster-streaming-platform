BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
LOCK TABLE catalog.media_attestations IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM catalog.media_attestations LIMIT 1) THEN
    RAISE EXCEPTION 'Retain publication attestations; use a roll-forward migration';
  END IF;
END $guard$;
DROP FUNCTION catalog.register_media_attestation(uuid, integer, integer, text, text,
  uuid, uuid, text, text, uuid, uuid, uuid, uuid);
DROP TABLE catalog.media_attestations;
REVOKE SELECT ON catalog.titles, catalog.rights_revisions, catalog.media_processing,
  catalog.media_acquisitions, catalog.media_requests FROM aster_catalog_attester;
REVOKE USAGE ON SCHEMA catalog FROM aster_catalog_attester;
DROP ROLE aster_catalog_attester;
DELETE FROM catalog.schema_migrations WHERE version = 7;
COMMIT;
