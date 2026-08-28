BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
CREATE ROLE aster_engagement_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA engagement;
REVOKE ALL ON SCHEMA engagement FROM PUBLIC;

CREATE TABLE engagement.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE engagement.profile_admission (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton)
);
INSERT INTO engagement.profile_admission(singleton) VALUES (true);
CREATE TABLE engagement.profile_guards (
  profile_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  slot smallint NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 1024),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (profile_id, account_id)
);
CREATE TABLE engagement.progress (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL,
  account_id uuid NOT NULL,
  title_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 256),
  playback_session_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  version integer NOT NULL CHECK (version > 0),
  position_ms integer NOT NULL CHECK (position_ms >= 0),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 43200000 AND position_ms <= duration_ms),
  status varchar(16) NOT NULL CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  occurred_at bigint NOT NULL CHECK (occurred_at BETWEEN 0 AND 253402300799),
  updated_at bigint NOT NULL CHECK (updated_at BETWEEN 0 AND 253402300799),
  authority_checked_at bigint NOT NULL CHECK (authority_checked_at BETWEEN updated_at - 2 AND updated_at),
  authority_expires_at bigint NOT NULL CHECK (authority_expires_at > updated_at AND authority_expires_at <= 253402300799),
  UNIQUE (profile_id, title_id),
  UNIQUE (profile_id, slot),
  FOREIGN KEY (profile_id, account_id) REFERENCES engagement.profile_guards(profile_id, account_id)
);
CREATE INDEX engagement_history_order ON engagement.progress(profile_id, updated_at DESC, id DESC);
CREATE INDEX engagement_continue_order ON engagement.progress(profile_id, updated_at DESC, id DESC) WHERE status = 'IN_PROGRESS';
CREATE TABLE engagement.progress_receipts (
  profile_id uuid NOT NULL,
  account_id uuid NOT NULL,
  title_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 1024),
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 2048),
  expires_at bigint NOT NULL CHECK (expires_at BETWEEN 0 AND 253402300799),
  PRIMARY KEY (profile_id, idempotency_key),
  UNIQUE (profile_id, slot),
  FOREIGN KEY (profile_id, account_id) REFERENCES engagement.profile_guards(profile_id, account_id),
  CHECK ((result->>'profileId' = profile_id::text AND result->>'accountId' = account_id::text AND result->>'titleId' = title_id::text) IS TRUE)
);
CREATE INDEX engagement_receipt_expiry ON engagement.progress_receipts(profile_id, expires_at, slot);
CREATE TABLE engagement.outbox (
  event_id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES engagement.profile_guards(profile_id),
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 1024),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object' AND octet_length(event::text) <= 2048),
  UNIQUE (aggregate_id, aggregate_version),
  UNIQUE (profile_id, slot),
  CHECK ((event->>'eventId' = event_id::text AND event->'aggregate'->>'id' = aggregate_id::text AND (event->'aggregate'->>'version')::integer = aggregate_version AND event->'payload'->>'profileId' = profile_id::text) IS TRUE)
);

CREATE FUNCTION engagement.guard_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.slot IS DISTINCT FROM OLD.slot OR (OLD.deleted AND NOT NEW.deleted) THEN
    RAISE EXCEPTION 'Engagement profile identity is immutable';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER engagement_guard_identity BEFORE UPDATE ON engagement.profile_guards FOR EACH ROW EXECUTE FUNCTION engagement.guard_identity();

CREATE FUNCTION engagement.progress_order() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.title_id IS DISTINCT FROM OLD.title_id OR NEW.slot IS DISTINCT FROM OLD.slot OR NEW.sequence <= OLD.sequence OR NEW.version <> OLD.version + 1 OR NEW.updated_at < OLD.updated_at) THEN
    RAISE EXCEPTION 'Engagement progress ordering rejected';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.version <> 1 THEN
    RAISE EXCEPTION 'Engagement initial progress version rejected';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER engagement_progress_order BEFORE INSERT OR UPDATE ON engagement.progress FOR EACH ROW EXECUTE FUNCTION engagement.progress_order();

CREATE FUNCTION engagement.progress_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
DECLARE checked_now bigint := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()));
BEGIN
  IF NEW.authority_expires_at <= checked_now OR NEW.authority_checked_at NOT BETWEEN checked_now - 2 AND checked_now THEN
    RAISE EXCEPTION 'Engagement authority expired before commit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement.profile_guards g WHERE g.profile_id = NEW.profile_id AND g.account_id = NEW.account_id AND NOT g.deleted) THEN
    RAISE EXCEPTION 'Engagement profile unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement.progress_receipts r WHERE r.profile_id = NEW.profile_id AND r.title_id = NEW.title_id AND r.account_id = NEW.account_id AND r.result = jsonb_build_object('id', NEW.id, 'accountId', NEW.account_id, 'profileId', NEW.profile_id, 'titleId', NEW.title_id, 'playbackSessionId', NEW.playback_session_id, 'sequence', NEW.sequence, 'version', NEW.version, 'positionMs', NEW.position_ms, 'durationMs', NEW.duration_ms, 'status', NEW.status, 'occurredAt', NEW.occurred_at, 'updatedAt', NEW.updated_at) AND r.expires_at > checked_now) THEN
    RAISE EXCEPTION 'Engagement progress receipt required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement.outbox o JOIN engagement.progress_receipts r ON r.profile_id = o.profile_id AND r.title_id = NEW.title_id AND r.result->>'id' = NEW.id::text AND (r.result->>'version')::integer = NEW.version WHERE o.aggregate_id = NEW.id AND o.aggregate_version = NEW.version AND o.profile_id = NEW.profile_id AND o.event->>'eventType' = 'engagement.progress-recorded' AND o.event->>'producer' = 'engagement' AND o.event->'aggregate'->>'type' = 'Progress' AND (o.event->>'schemaVersion')::integer = 1 AND o.event->>'causationId' = r.idempotency_key::text AND o.event->'payload' = jsonb_build_object('profileId', NEW.profile_id, 'titleId', NEW.title_id, 'sequence', NEW.sequence, 'positionMs', NEW.position_ms, 'durationMs', NEW.duration_ms, 'status', NEW.status)) THEN
    RAISE EXCEPTION 'Engagement progress event required';
  END IF;
  RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER engagement_progress_commit AFTER INSERT OR UPDATE ON engagement.progress DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engagement.progress_commit();

GRANT USAGE ON SCHEMA engagement TO aster_engagement_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA engagement TO aster_engagement_runtime;
GRANT UPDATE (singleton) ON engagement.profile_admission TO aster_engagement_runtime;
-- Row locking requires UPDATE privilege; the trigger prevents identity changes.
GRANT UPDATE (profile_id) ON engagement.profile_guards TO aster_engagement_runtime;
GRANT INSERT ON engagement.profile_guards, engagement.progress, engagement.progress_receipts, engagement.outbox TO aster_engagement_runtime;
GRANT UPDATE (playback_session_id, sequence, version, position_ms, duration_ms, status, occurred_at, updated_at, authority_checked_at, authority_expires_at) ON engagement.progress TO aster_engagement_runtime;
GRANT DELETE ON engagement.progress_receipts TO aster_engagement_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA engagement FROM PUBLIC;
INSERT INTO engagement.schema_migrations(version) VALUES (1);
COMMIT;
