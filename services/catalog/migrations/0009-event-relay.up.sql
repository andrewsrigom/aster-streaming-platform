BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
CREATE ROLE aster_catalog_relay NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE TABLE catalog.outbox_relay_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  token uuid,
  event_id uuid,
  expires_at timestamptz,
  CHECK ((token IS NULL AND event_id IS NULL AND expires_at IS NULL)
    OR (token IS NOT NULL AND event_id IS NOT NULL AND expires_at IS NOT NULL))
);
INSERT INTO catalog.outbox_relay_state(singleton) VALUES (true);
CREATE INDEX catalog_outbox_delivery_order
  ON catalog.publication_outbox((event->>'occurredAt'), title_id, title_version);

CREATE FUNCTION catalog.claim_outbox(requested_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  lease catalog.outbox_relay_state%ROWTYPE;
  candidate record;
  checked_now timestamptz;
BEGIN
  IF requested_token IS NULL THEN
    RAISE EXCEPTION 'Invalid relay token';
  END IF;
  SELECT * INTO STRICT lease FROM catalog.outbox_relay_state WHERE singleton FOR UPDATE NOWAIT;
  checked_now := clock_timestamp();
  IF lease.expires_at > checked_now THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  SELECT o.event_id, o.title_id AS aggregate_id,
    o.title_version AS aggregate_version, o.event AS event
  INTO candidate
  FROM catalog.publication_outbox o
  WHERE NOT EXISTS (SELECT 1 FROM catalog.publication_outbox earlier
    WHERE earlier.title_id = o.title_id
      AND earlier.title_version < o.title_version)
  ORDER BY o.event->>'occurredAt', o.title_id, o.title_version
  LIMIT 1;
  IF NOT FOUND THEN
    UPDATE catalog.outbox_relay_state SET token = NULL, event_id = NULL, expires_at = NULL WHERE singleton;
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  UPDATE catalog.outbox_relay_state
    SET token = requested_token, event_id = candidate.event_id,
      expires_at = clock_timestamp() + interval '10 seconds'
    WHERE singleton;
  RETURN jsonb_build_object('status', 'claimed', 'value', jsonb_build_object(
    'token', requested_token, 'eventId', candidate.event_id,
    'aggregateId', candidate.aggregate_id, 'aggregateVersion', candidate.aggregate_version,
    'event', candidate.event));
END;
$function$;

CREATE FUNCTION catalog.acknowledge_outbox(requested_token uuid, requested_event uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  lease catalog.outbox_relay_state%ROWTYPE;
  removed integer;
BEGIN
  IF requested_token IS NULL OR requested_event IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO STRICT lease FROM catalog.outbox_relay_state WHERE singleton FOR UPDATE NOWAIT;
  IF lease.token IS DISTINCT FROM requested_token OR lease.event_id IS DISTINCT FROM requested_event
    OR lease.expires_at IS NULL OR lease.expires_at <= clock_timestamp() THEN
    RETURN false;
  END IF;
  DELETE FROM catalog.publication_outbox WHERE event_id = requested_event;
  GET DIAGNOSTICS removed = ROW_COUNT;
  UPDATE catalog.outbox_relay_state SET token = NULL, event_id = NULL, expires_at = NULL WHERE singleton;
  RETURN removed = 1;
END;
$function$;
REVOKE ALL ON FUNCTION catalog.claim_outbox(uuid), catalog.acknowledge_outbox(uuid, uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA catalog TO aster_catalog_relay;
GRANT EXECUTE ON FUNCTION catalog.claim_outbox(uuid), catalog.acknowledge_outbox(uuid, uuid) TO aster_catalog_relay;
INSERT INTO catalog.schema_migrations(version) VALUES (9);
COMMIT;
