-- Destructive local recovery only: all account/session data from migration 0001 is removed.
-- RESTRICT (the default) refuses rollback once a later migration depends on these objects.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
DROP TABLE identity.sessions;
DROP TABLE identity.accounts;
DROP TABLE identity.schema_migrations;
DROP SCHEMA identity;
DROP ROLE aster_identity_runtime;
COMMIT;
