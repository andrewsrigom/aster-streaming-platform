BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM discovery.event_quarantine) THEN
    RAISE EXCEPTION 'Retain Discovery event quarantine and roll forward';
  END IF;
END;
$block$;

DROP FUNCTION discovery.complete_catalog_replay(uuid);
DROP FUNCTION discovery.read_catalog_quarantine(uuid);
DROP FUNCTION discovery.quarantine_catalog_record(uuid,text,integer,text,text,text,jsonb,text);
DROP TABLE discovery.event_quarantine;
DROP TABLE discovery.event_quarantine_admission;
DELETE FROM discovery.schema_migrations WHERE version = 2;
COMMIT;
