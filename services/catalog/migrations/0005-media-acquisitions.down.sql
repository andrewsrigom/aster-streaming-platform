BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
LOCK TABLE catalog.media_acquisitions IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM catalog.media_acquisitions LIMIT 1) THEN
    RAISE EXCEPTION 'Retain media acquisition audit; use a roll-forward migration';
  END IF;
END $guard$;
DROP TABLE catalog.media_acquisitions;
DELETE FROM catalog.schema_migrations WHERE version = 5;
COMMIT;
