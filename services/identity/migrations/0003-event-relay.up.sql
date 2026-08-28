BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
CREATE ROLE aster_identity_relay NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE TABLE identity.outbox_relay_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token uuid,
  event_id uuid,
  expires_at timestamptz,
  CHECK ((token IS NULL AND event_id IS NULL AND expires_at IS NULL)
    OR (token IS NOT NULL AND event_id IS NOT NULL AND expires_at IS NOT NULL))
);
INSERT INTO identity.outbox_relay_state(singleton) VALUES (true);
CREATE INDEX identity_outbox_delivery_order
  ON identity.profile_outbox((envelope->>'occurredAt'), profile_id, profile_version);

CREATE FUNCTION identity.claim_outbox(requested_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  lease identity.outbox_relay_state%ROWTYPE;
  candidate record;
  checked_now timestamptz;
BEGIN
  IF requested_token IS NULL THEN
    RAISE EXCEPTION 'Invalid relay token';
  END IF;
  SELECT * INTO STRICT lease FROM identity.outbox_relay_state WHERE singleton FOR UPDATE NOWAIT;
  checked_now := clock_timestamp();
  IF lease.expires_at > checked_now THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  SELECT o.event_id, o.profile_id AS aggregate_id,
    o.profile_version AS aggregate_version, o.envelope AS event
  INTO candidate
  FROM identity.profile_outbox o
  WHERE NOT EXISTS (SELECT 1 FROM identity.profile_outbox earlier
    WHERE earlier.profile_id = o.profile_id
      AND earlier.profile_version < o.profile_version)
  ORDER BY o.envelope->>'occurredAt', o.profile_id, o.profile_version
  LIMIT 1;
  IF NOT FOUND THEN
    UPDATE identity.outbox_relay_state SET token = NULL, event_id = NULL, expires_at = NULL WHERE singleton;
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  UPDATE identity.outbox_relay_state
    SET token = requested_token, event_id = candidate.event_id,
      expires_at = clock_timestamp() + interval '10 seconds'
    WHERE singleton;
  RETURN jsonb_build_object('status', 'claimed', 'value', jsonb_build_object(
    'token', requested_token, 'eventId', candidate.event_id,
    'aggregateId', candidate.aggregate_id, 'aggregateVersion', candidate.aggregate_version,
    'event', candidate.event));
END;
$function$;

CREATE FUNCTION identity.acknowledge_outbox(requested_token uuid, requested_event uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  lease identity.outbox_relay_state%ROWTYPE;
  removed integer;
BEGIN
  IF requested_token IS NULL OR requested_event IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO STRICT lease FROM identity.outbox_relay_state WHERE singleton FOR UPDATE NOWAIT;
  IF lease.token IS DISTINCT FROM requested_token OR lease.event_id IS DISTINCT FROM requested_event
    OR lease.expires_at IS NULL OR lease.expires_at <= clock_timestamp() THEN
    RETURN false;
  END IF;
  DELETE FROM identity.profile_outbox WHERE event_id = requested_event;
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE identity.outbox_relay_state SET token = NULL, event_id = NULL, expires_at = NULL WHERE singleton;
  RETURN removed = 1;
END;
$function$;
REVOKE ALL ON FUNCTION identity.claim_outbox(uuid), identity.acknowledge_outbox(uuid, uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA identity TO aster_identity_relay;
GRANT EXECUTE ON FUNCTION identity.claim_outbox(uuid), identity.acknowledge_outbox(uuid, uuid) TO aster_identity_relay;
INSERT INTO identity.schema_migrations(version) VALUES (3);
COMMIT;
