BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';

CREATE TABLE identity.profiles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 16),
  display_name varchar(60) NOT NULL CHECK (length(display_name) > 0),
  locale varchar(35) NOT NULL CHECK (locale ~ '^[A-Za-z0-9-]{2,35}$'),
  maturity varchar(7) NOT NULL CHECK (maturity IN ('GENERAL', 'TEEN', 'MATURE')),
  avatar_ref text CHECK (avatar_ref IS NULL),
  version integer NOT NULL CHECK (version > 0),
  UNIQUE (account_id, slot),
  UNIQUE (account_id, id)
);
ALTER TABLE identity.sessions ADD COLUMN active_profile_id uuid;
ALTER TABLE identity.sessions ADD CONSTRAINT sessions_active_profile_owner
  FOREIGN KEY (account_id, active_profile_id) REFERENCES identity.profiles(account_id, id)
  ON DELETE SET NULL (active_profile_id);

-- Receipts/events deliberately do not reference the profile row: deletion removes preferences now.
CREATE TABLE identity.profile_receipts (
  account_id uuid NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 64),
  request_digest varchar(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  profile_id uuid NOT NULL,
  profile_version integer NOT NULL CHECK (profile_version > 0),
  expires_at bigint NOT NULL CHECK (expires_at BETWEEN 0 AND 253402300799),
  PRIMARY KEY (account_id, mutation_id),
  UNIQUE (account_id, slot)
);
CREATE INDEX profile_receipts_expiry ON identity.profile_receipts(account_id, expires_at);

CREATE TABLE identity.profile_audit (
  event_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 128),
  profile_id uuid NOT NULL,
  profile_version integer NOT NULL CHECK (profile_version > 0),
  event_type varchar(32) NOT NULL CHECK (event_type IN ('identity.profile-created', 'identity.profile-updated', 'identity.profile-deleted')),
  occurred_at bigint NOT NULL CHECK (occurred_at BETWEEN 0 AND 253402300799),
  UNIQUE (account_id, slot),
  UNIQUE (profile_id, profile_version)
);
CREATE INDEX profile_audit_retention ON identity.profile_audit(account_id, occurred_at, event_id);

CREATE TABLE identity.profile_outbox (
  event_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 128),
  profile_id uuid NOT NULL,
  profile_version integer NOT NULL CHECK (profile_version > 0),
  envelope jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096
    AND envelope ?& ARRAY['eventId', 'eventType', 'schemaVersion', 'occurredAt', 'producer', 'aggregate', 'correlationId', 'causationId', 'trace', 'payload']
    AND envelope->>'eventId' = event_id::text AND envelope->>'schemaVersion' = '1'
    AND envelope->>'producer' = 'identity'
    AND envelope->>'eventType' IN ('identity.profile-created', 'identity.profile-updated', 'identity.profile-deleted')
    AND envelope#>>'{aggregate,id}' = profile_id::text
    AND envelope#>>'{aggregate,version}' = profile_version::text
    AND envelope#>>'{aggregate,type}' = 'Profile'
    AND envelope#>>'{payload,accountId}' = account_id::text
    AND envelope#>>'{payload,profileId}' = profile_id::text,
    false
  )),
  UNIQUE (account_id, slot),
  UNIQUE (profile_id, profile_version)
);

GRANT SELECT, INSERT, DELETE ON identity.profiles TO aster_identity_runtime;
GRANT UPDATE (display_name, locale, maturity, avatar_ref, version) ON identity.profiles TO aster_identity_runtime;
GRANT UPDATE (active_profile_id) ON identity.sessions TO aster_identity_runtime;
GRANT SELECT, INSERT, DELETE ON identity.profile_receipts, identity.profile_audit TO aster_identity_runtime;
GRANT SELECT, INSERT ON identity.profile_outbox TO aster_identity_runtime;
INSERT INTO identity.schema_migrations(version) VALUES (2);
COMMIT;
