-- Destructive only for explicitly disposable local data. Never discard pending delivery facts in production.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
ALTER TABLE identity.sessions DROP CONSTRAINT sessions_active_profile_owner;
ALTER TABLE identity.sessions DROP COLUMN active_profile_id;
DROP TABLE identity.profile_outbox;
DROP TABLE identity.profile_audit;
DROP TABLE identity.profile_receipts;
DROP TABLE identity.profiles;
DELETE FROM identity.schema_migrations WHERE version = 2;
COMMIT;
