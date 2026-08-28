BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
LOCK TABLE catalog.media_requests IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM catalog.media_requests LIMIT 1) THEN
    RAISE EXCEPTION 'Retain media request audit; use a roll-forward migration';
  END IF;
END $guard$;
DROP TABLE catalog.media_requests;
DELETE FROM catalog.schema_migrations WHERE version = 4;
COMMIT;
