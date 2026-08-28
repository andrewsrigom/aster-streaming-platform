BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
CREATE ROLE aster_engagement_consumer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE TABLE engagement.profile_deletions (
  profile_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  source_event_id uuid NOT NULL UNIQUE,
  source_version integer NOT NULL CHECK (source_version > 0),
  occurred_at bigint NOT NULL CHECK (occurred_at BETWEEN 0 AND 253402300799),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_progress integer NOT NULL CHECK (removed_progress BETWEEN 0 AND 256),
  removed_progress_receipts integer NOT NULL CHECK (removed_progress_receipts BETWEEN 0 AND 1024),
  removed_watchlists integer NOT NULL CHECK (removed_watchlists BETWEEN 0 AND 1),
  removed_watchlist_entries integer NOT NULL CHECK (removed_watchlist_entries BETWEEN 0 AND 256),
  removed_watchlist_receipts integer NOT NULL CHECK (removed_watchlist_receipts BETWEEN 0 AND 1024),
  removed_outbox integer NOT NULL CHECK (removed_outbox BETWEEN 0 AND 1024),
  FOREIGN KEY (profile_id, account_id) REFERENCES engagement.profile_guards(profile_id, account_id)
);

CREATE FUNCTION engagement.consume_profile_deletion(
  source_event uuid, source_account uuid, source_profile uuid, source_version integer, source_occurred bigint
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  guard engagement.profile_guards%ROWTYPE;
  prior engagement.profile_deletions%ROWTYPE;
  next_slot smallint;
  progress_count integer; receipt_count integer; watchlist_count integer;
  entry_count integer; watchlist_receipt_count integer; outbox_count integer;
BEGIN
  IF source_event IS NULL OR source_account IS NULL OR source_profile IS NULL
    OR source_version IS NULL OR source_version < 1 OR source_occurred IS NULL
    OR source_occurred NOT BETWEEN 0 AND 253402300799 THEN
    RETURN 'conflict';
  END IF;
  SELECT * INTO guard FROM engagement.profile_guards WHERE profile_id = source_profile FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM singleton FROM engagement.profile_admission WHERE singleton FOR UPDATE;
    SELECT * INTO guard FROM engagement.profile_guards WHERE profile_id = source_profile FOR UPDATE;
    IF NOT FOUND THEN
      SELECT candidate.slot INTO next_slot FROM generate_series(1, 1024) candidate(slot)
        WHERE NOT EXISTS (SELECT 1 FROM engagement.profile_guards occupied WHERE occupied.slot = candidate.slot)
        ORDER BY candidate.slot LIMIT 1;
      IF next_slot IS NULL THEN RETURN 'full'; END IF;
      INSERT INTO engagement.profile_guards(profile_id, account_id, slot)
        VALUES (source_profile, source_account, next_slot) RETURNING * INTO guard;
    END IF;
  END IF;
  IF guard.account_id <> source_account THEN RETURN 'conflict'; END IF;
  SELECT * INTO prior FROM engagement.profile_deletions WHERE profile_id = source_profile;
  IF FOUND THEN
    IF prior.source_event_id = source_event AND prior.source_version = source_version
      AND prior.occurred_at = source_occurred AND guard.deleted THEN RETURN 'duplicate'; END IF;
    RETURN 'conflict';
  END IF;
  IF guard.deleted OR EXISTS (SELECT 1 FROM engagement.profile_deletions WHERE source_event_id = source_event) THEN
    RETURN 'conflict';
  END IF;
  -- This is the same irreversible guard held by both request writers.
  UPDATE engagement.profile_guards SET deleted = true WHERE profile_id = source_profile;
  DELETE FROM engagement.watchlist_receipts WHERE profile_id = source_profile;
  GET DIAGNOSTICS watchlist_receipt_count = ROW_COUNT;
  DELETE FROM engagement.watchlist_entries WHERE profile_id = source_profile;
  GET DIAGNOSTICS entry_count = ROW_COUNT;
  DELETE FROM engagement.watchlists WHERE profile_id = source_profile;
  GET DIAGNOSTICS watchlist_count = ROW_COUNT;
  DELETE FROM engagement.progress_receipts WHERE profile_id = source_profile;
  GET DIAGNOSTICS receipt_count = ROW_COUNT;
  DELETE FROM engagement.progress WHERE profile_id = source_profile;
  GET DIAGNOSTICS progress_count = ROW_COUNT;
  DELETE FROM engagement.outbox WHERE profile_id = source_profile;
  GET DIAGNOSTICS outbox_count = ROW_COUNT;
  INSERT INTO engagement.profile_deletions(profile_id, account_id, source_event_id, source_version, occurred_at,
    removed_progress, removed_progress_receipts, removed_watchlists, removed_watchlist_entries, removed_watchlist_receipts, removed_outbox)
    VALUES (source_profile, source_account, source_event, source_version, source_occurred,
      progress_count, receipt_count, watchlist_count, entry_count, watchlist_receipt_count, outbox_count);
  RETURN 'applied';
END;
$function$;

CREATE TABLE engagement.event_quarantine_admission (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton)
);
INSERT INTO engagement.event_quarantine_admission(singleton) VALUES (true);
CREATE TABLE engagement.event_quarantine (
  id uuid NOT NULL UNIQUE,
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 128),
  topic text NOT NULL CHECK (topic = 'aster.identity.profile.v1'),
  partition integer NOT NULL CHECK (partition >= 0),
  broker_offset varchar(20) NOT NULL CHECK (broker_offset ~ '^(0|[1-9][0-9]{0,19})$'),
  key_hex varchar(256) CHECK (key_hex ~ '^([a-f0-9]{2})*$'),
  value_hex varchar(16384) NOT NULL CHECK (value_hex ~ '^([a-f0-9]{2})*$'),
  headers jsonb NOT NULL CHECK (jsonb_typeof(headers) = 'object' AND octet_length(headers::text) <= 10240),
  reason text NOT NULL CHECK (reason IN ('signature', 'envelope', 'identity_conflict')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (topic, partition, broker_offset)
);

CREATE FUNCTION engagement.quarantine_identity_record(
  record_id uuid, record_topic text, record_partition integer, record_offset text,
  record_key text, record_value text, record_headers jsonb, record_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE prior engagement.event_quarantine%ROWTYPE; next_slot smallint;
BEGIN
  PERFORM singleton FROM engagement.event_quarantine_admission WHERE singleton FOR UPDATE;
  SELECT * INTO prior FROM engagement.event_quarantine
    WHERE topic = record_topic AND partition = record_partition AND broker_offset = record_offset;
  IF FOUND THEN
    IF prior.key_hex IS NOT DISTINCT FROM record_key AND prior.value_hex = record_value AND prior.headers = record_headers THEN
      RETURN 'duplicate';
    END IF;
    RETURN 'conflict';
  END IF;
  SELECT candidate.slot INTO next_slot FROM generate_series(1, 128) candidate(slot)
    WHERE NOT EXISTS (SELECT 1 FROM engagement.event_quarantine occupied WHERE occupied.slot = candidate.slot)
    ORDER BY candidate.slot LIMIT 1;
  IF next_slot IS NULL THEN RETURN 'full'; END IF;
  INSERT INTO engagement.event_quarantine(id, slot, topic, partition, broker_offset, key_hex, value_hex, headers, reason)
    VALUES (record_id, next_slot, record_topic, record_partition, record_offset, record_key, record_value, record_headers, record_reason);
  RETURN 'stored';
END;
$function$;

CREATE FUNCTION engagement.read_identity_quarantine(record_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
  SELECT jsonb_build_object('id', id, 'topic', topic, 'partition', partition, 'offset', broker_offset,
    'keyHex', key_hex, 'valueHex', value_hex, 'headers', headers)
    FROM engagement.event_quarantine WHERE id = record_id;
$function$;
CREATE FUNCTION engagement.complete_identity_replay(record_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE removed integer;
BEGIN
  DELETE FROM engagement.event_quarantine WHERE id = record_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed = 1;
END;
$function$;

REVOKE ALL ON FUNCTION engagement.consume_profile_deletion(uuid, uuid, uuid, integer, bigint),
  engagement.quarantine_identity_record(uuid, text, integer, text, text, text, jsonb, text),
  engagement.read_identity_quarantine(uuid), engagement.complete_identity_replay(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA engagement TO aster_engagement_consumer;
GRANT EXECUTE ON FUNCTION engagement.consume_profile_deletion(uuid, uuid, uuid, integer, bigint),
  engagement.quarantine_identity_record(uuid, text, integer, text, text, text, jsonb, text),
  engagement.read_identity_quarantine(uuid), engagement.complete_identity_replay(uuid) TO aster_engagement_consumer;
INSERT INTO engagement.schema_migrations(version) VALUES (4);
COMMIT;
