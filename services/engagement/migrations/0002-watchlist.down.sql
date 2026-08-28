-- Only empty-state rollback; acknowledged membership, command history and events are retained.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM engagement.watchlists)
    OR EXISTS (SELECT 1 FROM engagement.watchlist_entries)
    OR EXISTS (SELECT 1 FROM engagement.watchlist_receipts)
    OR EXISTS (SELECT 1 FROM engagement.outbox WHERE event->>'eventType' = 'engagement.watchlist-changed') THEN
    RAISE EXCEPTION 'Retained watchlist data prevents downgrade';
  END IF;
END $guard$;
DROP TABLE engagement.watchlist_receipts;
DROP TABLE engagement.watchlist_entries;
DROP TABLE engagement.watchlists;
DROP FUNCTION engagement.watchlist_entry_commit();
DROP FUNCTION engagement.watchlist_commit();
DROP FUNCTION engagement.watchlist_order();
DELETE FROM engagement.schema_migrations WHERE version = 2;
COMMIT;
