-- Destructive disposable/approved recovery only. Normal application rollback retains this schema.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
DROP TABLE playback.sessions;
DROP TABLE playback.session_admission;
DROP TABLE playback.schema_migrations;
DROP SCHEMA playback;
DROP ROLE aster_playback_runtime;
COMMIT;
