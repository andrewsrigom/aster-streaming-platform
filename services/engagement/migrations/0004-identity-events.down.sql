BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
LOCK TABLE engagement.profile_guards, engagement.profile_deletions, engagement.event_quarantine IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM engagement.schema_migrations WHERE version > 4)
    OR EXISTS (SELECT 1 FROM engagement.profile_deletions)
    OR EXISTS (SELECT 1 FROM engagement.event_quarantine)
    OR EXISTS (SELECT 1 FROM engagement.profile_guards WHERE deleted) THEN
    RAISE EXCEPTION 'Retain deletion and quarantine state; roll forward';
  END IF;
END $guard$;
DROP FUNCTION engagement.consume_profile_deletion(uuid, uuid, uuid, integer, bigint),
  engagement.quarantine_identity_record(uuid, text, integer, text, text, text, jsonb, text),
  engagement.read_identity_quarantine(uuid), engagement.complete_identity_replay(uuid);
DROP TABLE engagement.profile_deletions, engagement.event_quarantine, engagement.event_quarantine_admission;
REVOKE USAGE ON SCHEMA engagement FROM aster_engagement_consumer;
DROP ROLE aster_engagement_consumer;
DELETE FROM engagement.schema_migrations WHERE version = 4;
COMMIT;
