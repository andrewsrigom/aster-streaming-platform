BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
LOCK TABLE discovery.generation_control, discovery.generations, discovery.title_fences,
  discovery.generation_titles, discovery.search_documents IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM discovery.schema_migrations WHERE version > 1)
    OR EXISTS (SELECT 1 FROM discovery.title_fences)
    OR EXISTS (SELECT 1 FROM discovery.generation_titles)
    OR EXISTS (SELECT 1 FROM discovery.search_documents)
    OR EXISTS (SELECT 1 FROM discovery.generations WHERE id <> '00000000-0000-4000-8000-000000090001') THEN
    RAISE EXCEPTION 'Retain Discovery projection state; roll forward';
  END IF;
END $guard$;
DROP TABLE discovery.search_documents, discovery.generation_titles, discovery.fence_localizations,
  discovery.title_fences, discovery.generation_control, discovery.generations;
DROP FUNCTION discovery.guard_title_fence();
DELETE FROM discovery.schema_migrations WHERE version = 1;
DROP TABLE discovery.schema_migrations;
DROP SCHEMA discovery;
DROP ROLE aster_discovery_projector;
DROP ROLE aster_discovery_runtime;
COMMIT;
