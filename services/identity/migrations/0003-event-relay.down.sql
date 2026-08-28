BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
LOCK TABLE identity.outbox_relay_state IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.outbox_relay_state WHERE token IS NOT NULL) THEN
    RAISE EXCEPTION 'Retain active or uncertain relay claim and roll forward';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.schema_migrations WHERE version > 3) THEN
    RAISE EXCEPTION 'Reverse later dependencies first';
  END IF;
END;
$guard$;
DROP FUNCTION identity.acknowledge_outbox(uuid, uuid), identity.claim_outbox(uuid);
DROP INDEX identity.identity_outbox_delivery_order;
DROP TABLE identity.outbox_relay_state;
REVOKE USAGE ON SCHEMA identity FROM aster_identity_relay;
DROP ROLE aster_identity_relay;
DELETE FROM identity.schema_migrations WHERE version = 3;
COMMIT;
