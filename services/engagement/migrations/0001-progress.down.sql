-- Empty-state rollback only. Preserve all acknowledged data and deletion fences otherwise.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM engagement.profile_guards) OR EXISTS (SELECT 1 FROM engagement.progress) OR EXISTS (SELECT 1 FROM engagement.progress_receipts) OR EXISTS (SELECT 1 FROM engagement.outbox) THEN
    RAISE EXCEPTION 'Retained Engagement data prevents downgrade';
  END IF;
END $guard$;
DROP TABLE engagement.outbox;
DROP TABLE engagement.progress_receipts;
DROP TABLE engagement.progress;
DROP TABLE engagement.profile_guards;
DROP TABLE engagement.profile_admission;
DROP TABLE engagement.schema_migrations;
DROP FUNCTION engagement.progress_commit();
DROP FUNCTION engagement.progress_order();
DROP FUNCTION engagement.guard_identity();
DROP SCHEMA engagement;
DROP ROLE aster_engagement_runtime;
COMMIT;
