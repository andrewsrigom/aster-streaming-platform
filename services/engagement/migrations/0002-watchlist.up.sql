BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';

CREATE TABLE engagement.watchlists (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL UNIQUE,
  title_id uuid NOT NULL,
  present boolean NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  updated_at bigint NOT NULL CHECK (updated_at BETWEEN 0 AND 253402300799),
  authority_checked_at bigint NOT NULL CHECK (authority_checked_at BETWEEN updated_at - 2 AND updated_at),
  authority_expires_at bigint NOT NULL CHECK (authority_expires_at > updated_at AND authority_expires_at <= 253402300799),
  write_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
  UNIQUE (profile_id, account_id),
  FOREIGN KEY (profile_id, account_id) REFERENCES engagement.profile_guards(profile_id, account_id)
);
CREATE TABLE engagement.watchlist_entries (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  account_id uuid NOT NULL,
  title_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 256),
  added_at bigint NOT NULL CHECK (added_at BETWEEN 0 AND 253402300799),
  UNIQUE (profile_id, title_id),
  UNIQUE (profile_id, slot),
  FOREIGN KEY (profile_id, account_id) REFERENCES engagement.watchlists(profile_id, account_id)
);
CREATE INDEX engagement_watchlist_order ON engagement.watchlist_entries(profile_id, added_at DESC, id DESC);
CREATE TABLE engagement.watchlist_receipts (
  profile_id uuid NOT NULL,
  account_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 1024),
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 2048),
  expires_at bigint NOT NULL CHECK (expires_at BETWEEN 0 AND 253402300799),
  PRIMARY KEY (profile_id, idempotency_key),
  UNIQUE (profile_id, slot),
  FOREIGN KEY (profile_id, account_id) REFERENCES engagement.watchlists(profile_id, account_id),
  CHECK ((result->>'profileId' = profile_id::text AND result->>'accountId' = account_id::text) IS TRUE)
);
CREATE INDEX engagement_watchlist_receipt_expiry ON engagement.watchlist_receipts(profile_id, expires_at, slot);

CREATE FUNCTION engagement.watchlist_order() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.version <> OLD.version + 1 OR NEW.updated_at < OLD.updated_at) THEN
    RAISE EXCEPTION 'Engagement watchlist ordering rejected';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.version <> 1 THEN
    RAISE EXCEPTION 'Engagement initial watchlist version rejected';
  END IF;
  NEW.write_transaction := pg_current_xact_id();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER engagement_watchlist_order BEFORE INSERT OR UPDATE ON engagement.watchlists FOR EACH ROW EXECUTE FUNCTION engagement.watchlist_order();

CREATE FUNCTION engagement.watchlist_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  checked_now bigint := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()));
  expected_result jsonb := jsonb_build_object('id', NEW.id, 'accountId', NEW.account_id, 'profileId', NEW.profile_id, 'titleId', NEW.title_id, 'present', NEW.present, 'version', NEW.version, 'updatedAt', NEW.updated_at);
BEGIN
  IF NEW.authority_expires_at <= checked_now OR NEW.authority_checked_at NOT BETWEEN checked_now - 2 AND checked_now THEN
    RAISE EXCEPTION 'Engagement watchlist authority expired';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement.profile_guards g WHERE g.profile_id = NEW.profile_id AND g.account_id = NEW.account_id AND NOT g.deleted) THEN
    RAISE EXCEPTION 'Engagement profile unavailable';
  END IF;
  IF NEW.present <> EXISTS (SELECT 1 FROM engagement.watchlist_entries e WHERE e.profile_id = NEW.profile_id AND e.account_id = NEW.account_id AND e.title_id = NEW.title_id) THEN
    RAISE EXCEPTION 'Engagement watchlist membership required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement.watchlist_receipts r WHERE r.profile_id = NEW.profile_id AND r.account_id = NEW.account_id AND r.result = expected_result AND r.expires_at > checked_now) THEN
    RAISE EXCEPTION 'Engagement watchlist receipt required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM engagement.outbox o JOIN engagement.watchlist_receipts r ON r.profile_id = o.profile_id
    WHERE o.profile_id = NEW.profile_id AND o.aggregate_id = NEW.id AND o.aggregate_version = NEW.version
      AND r.result = expected_result AND o.event->>'causationId' = r.idempotency_key::text
      AND o.event->>'eventType' = 'engagement.watchlist-changed' AND o.event->>'producer' = 'engagement'
      AND (o.event->>'schemaVersion')::integer = 1 AND o.event->'aggregate'->>'type' = 'Watchlist'
      AND o.event->'payload' = jsonb_build_object('profileId', NEW.profile_id, 'titleId', NEW.title_id, 'present', NEW.present)
  ) THEN
    RAISE EXCEPTION 'Engagement watchlist event required';
  END IF;
  RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER engagement_watchlist_commit AFTER INSERT OR UPDATE ON engagement.watchlists DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engagement.watchlist_commit();

CREATE FUNCTION engagement.watchlist_entry_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
DECLARE
  entry_profile uuid;
  entry_account uuid;
  entry_title uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    entry_profile := OLD.profile_id; entry_account := OLD.account_id; entry_title := OLD.title_id;
  ELSE
    entry_profile := NEW.profile_id; entry_account := NEW.account_id; entry_title := NEW.title_id;
  END IF;
  -- Only the future privileged deletion consumer can set this irreversible fence.
  IF EXISTS (SELECT 1 FROM engagement.profile_guards g WHERE g.profile_id = entry_profile AND g.account_id = entry_account AND g.deleted) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement.watchlists w
    WHERE w.profile_id = entry_profile AND w.account_id = entry_account AND w.title_id = entry_title
      AND w.present = (TG_OP <> 'DELETE') AND w.write_transaction = pg_current_xact_id()) THEN
    RAISE EXCEPTION 'Engagement membership requires its watchlist command';
  END IF;
  RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER engagement_watchlist_entry_commit AFTER INSERT OR DELETE ON engagement.watchlist_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engagement.watchlist_entry_commit();

GRANT SELECT ON engagement.watchlists, engagement.watchlist_entries, engagement.watchlist_receipts TO aster_engagement_runtime;
GRANT INSERT (id, account_id, profile_id, title_id, present, version, updated_at, authority_checked_at, authority_expires_at) ON engagement.watchlists TO aster_engagement_runtime;
GRANT UPDATE (title_id, present, version, updated_at, authority_checked_at, authority_expires_at) ON engagement.watchlists TO aster_engagement_runtime;
GRANT INSERT, DELETE ON engagement.watchlist_entries, engagement.watchlist_receipts TO aster_engagement_runtime;
REVOKE ALL ON FUNCTION engagement.watchlist_order(), engagement.watchlist_commit(), engagement.watchlist_entry_commit() FROM PUBLIC;
INSERT INTO engagement.schema_migrations(version) VALUES (2);
COMMIT;
