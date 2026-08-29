BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';

CREATE TABLE discovery.event_quarantine_admission (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton)
);
INSERT INTO discovery.event_quarantine_admission(singleton) VALUES (true);

CREATE TABLE discovery.event_quarantine (
  id uuid NOT NULL UNIQUE,
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 128),
  topic text NOT NULL CHECK (topic = 'aster.catalog.publication.v1'),
  partition integer NOT NULL CHECK (partition BETWEEN 0 AND 2147483647),
  broker_offset varchar(20) NOT NULL CHECK (broker_offset ~ '^(0|[1-9][0-9]{0,19})$'),
  key_hex varchar(256) CHECK (key_hex ~ '^([a-f0-9]{2})*$'),
  value_hex varchar(16384) NOT NULL CHECK (value_hex ~ '^([a-f0-9]{2})*$'),
  headers jsonb NOT NULL CHECK (jsonb_typeof(headers) = 'object' AND octet_length(headers::text) <= 10240),
  reason text NOT NULL CHECK (reason IN ('envelope','source_absent','source_conflict','projection_conflict')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (topic, partition, broker_offset)
);

CREATE FUNCTION discovery.quarantine_catalog_record(
  record_id uuid, record_topic text, record_partition integer, record_offset text,
  record_key text, record_value text, record_headers jsonb, record_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE prior discovery.event_quarantine%ROWTYPE; next_slot smallint;
BEGIN
  PERFORM singleton FROM discovery.event_quarantine_admission WHERE singleton FOR UPDATE;
  SELECT * INTO prior FROM discovery.event_quarantine
    WHERE topic = record_topic AND partition = record_partition AND broker_offset = record_offset;
  IF FOUND THEN
    IF prior.key_hex IS NOT DISTINCT FROM record_key AND prior.value_hex = record_value
      AND prior.headers = record_headers AND prior.reason = record_reason THEN
      RETURN 'duplicate';
    END IF;
    RETURN 'conflict';
  END IF;
  SELECT candidate.slot INTO next_slot FROM generate_series(1, 128) candidate(slot)
    WHERE NOT EXISTS (SELECT 1 FROM discovery.event_quarantine occupied WHERE occupied.slot = candidate.slot)
    ORDER BY candidate.slot LIMIT 1;
  IF next_slot IS NULL THEN RETURN 'full'; END IF;
  INSERT INTO discovery.event_quarantine(
    id,slot,topic,partition,broker_offset,key_hex,value_hex,headers,reason
  ) VALUES (
    record_id,next_slot,record_topic,record_partition,record_offset,
    record_key,record_value,record_headers,record_reason
  );
  RETURN 'stored';
END;
$function$;

CREATE FUNCTION discovery.read_catalog_quarantine(record_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
  SELECT jsonb_build_object(
    'id',id,'topic',topic,'partition',partition,'offset',broker_offset,
    'keyHex',key_hex,'valueHex',value_hex,'headers',headers
  ) FROM discovery.event_quarantine WHERE id = record_id;
$function$;

CREATE FUNCTION discovery.complete_catalog_replay(record_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE removed integer;
BEGIN
  DELETE FROM discovery.event_quarantine WHERE id = record_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed = 1;
END;
$function$;

REVOKE ALL ON FUNCTION
  discovery.quarantine_catalog_record(uuid,text,integer,text,text,text,jsonb,text),
  discovery.read_catalog_quarantine(uuid),
  discovery.complete_catalog_replay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  discovery.quarantine_catalog_record(uuid,text,integer,text,text,text,jsonb,text),
  discovery.read_catalog_quarantine(uuid),
  discovery.complete_catalog_replay(uuid) TO aster_discovery_projector;

INSERT INTO discovery.schema_migrations(version) VALUES (2);
COMMIT;
