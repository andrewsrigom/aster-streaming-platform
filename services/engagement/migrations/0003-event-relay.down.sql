BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
LOCK TABLE engagement.outbox_relay_state IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM engagement.outbox_relay_state WHERE token IS NOT NULL) THEN
    RAISE EXCEPTION 'Retain active or uncertain relay claim and roll forward';
  END IF;
  IF EXISTS (SELECT 1 FROM engagement.schema_migrations WHERE version > 3) THEN
    RAISE EXCEPTION 'Reverse later dependencies first';
  END IF;
END;
$guard$;
DROP FUNCTION engagement.acknowledge_outbox(uuid, uuid), engagement.claim_outbox(uuid);
DROP INDEX engagement.engagement_outbox_delivery_order;
DROP TABLE engagement.outbox_relay_state;
REVOKE USAGE ON SCHEMA engagement FROM aster_engagement_relay;
DROP ROLE aster_engagement_relay;
DELETE FROM engagement.schema_migrations WHERE version = 3;
COMMIT;
