BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE ROLE aster_playback_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA playback;
REVOKE ALL ON SCHEMA playback FROM PUBLIC;

CREATE TABLE playback.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE playback.session_admission (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton)
);
INSERT INTO playback.session_admission(singleton) VALUES (true);

CREATE TABLE playback.sessions (
  id uuid PRIMARY KEY,
  slot smallint NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 4096),
  title_id uuid NOT NULL,
  publication_id uuid NOT NULL,
  catalog_version integer NOT NULL CHECK (catalog_version >= 1),
  catalog_checked_at bigint NOT NULL CHECK (catalog_checked_at >= 0),
  manifest_url varchar(2048) NOT NULL CHECK (
    manifest_url ~ '^(https://[^/?#@[:space:]]+(/[^?#[:space:]]*)?|http://127[.]0[.]0[.]1:9001/aster-media-published/publications/[a-f0-9]{64}/master[.]m3u8)$'
  ),
  profile_id uuid CHECK (profile_id IS NULL),
  created_at bigint NOT NULL CHECK (created_at >= 0 AND created_at <= 253402300799),
  expires_at bigint NOT NULL CHECK (expires_at > created_at AND expires_at <= created_at + 900 AND expires_at <= 253402300799),
  correlation_id uuid NOT NULL,
  CHECK (catalog_checked_at <= created_at AND catalog_checked_at >= created_at - 2)
);
CREATE INDEX playback_sessions_expiry ON playback.sessions(expires_at, id);

GRANT USAGE ON SCHEMA playback TO aster_playback_runtime;
GRANT SELECT ON playback.schema_migrations, playback.session_admission TO aster_playback_runtime;
-- Row locking needs UPDATE on one column; the singleton CHECK prevents changing its identity.
GRANT UPDATE (singleton) ON playback.session_admission TO aster_playback_runtime;
GRANT SELECT, INSERT, DELETE ON playback.sessions TO aster_playback_runtime;
INSERT INTO playback.schema_migrations(version) VALUES (1);
COMMIT;
