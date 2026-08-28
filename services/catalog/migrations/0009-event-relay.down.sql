BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
LOCK TABLE catalog.outbox_relay_state IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM catalog.outbox_relay_state WHERE token IS NOT NULL) THEN
    RAISE EXCEPTION 'Retain active or uncertain relay claim and roll forward';
  END IF;
  IF EXISTS (SELECT 1 FROM catalog.schema_migrations WHERE version > 9) THEN
    RAISE EXCEPTION 'Reverse later dependencies first';
  END IF;
END;
$guard$;
DROP FUNCTION catalog.acknowledge_outbox(uuid, uuid), catalog.claim_outbox(uuid);
DROP INDEX catalog.catalog_outbox_delivery_order;
DROP TABLE catalog.outbox_relay_state;
REVOKE USAGE ON SCHEMA catalog FROM aster_catalog_relay;
DROP ROLE aster_catalog_relay;
DELETE FROM catalog.schema_migrations WHERE version = 9;
COMMIT;
