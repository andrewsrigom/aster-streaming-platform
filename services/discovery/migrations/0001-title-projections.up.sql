BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '3s';
CREATE ROLE aster_discovery_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE aster_discovery_projector NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA discovery;
REVOKE ALL ON SCHEMA discovery FROM PUBLIC;

CREATE TABLE discovery.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE discovery.generations (
  id uuid PRIMARY KEY,
  state varchar(8) NOT NULL CHECK (state IN ('ACTIVE', 'BUILDING', 'PREVIOUS')),
  started_at bigint NOT NULL CHECK (started_at BETWEEN 0 AND 253402300799),
  completed_at bigint CHECK (completed_at BETWEEN started_at AND 253402300799),
  barrier_offsets jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(barrier_offsets) = 'object' AND octet_length(barrier_offsets::text) <= 4096),
  handled_offsets jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(handled_offsets) = 'object' AND octet_length(handled_offsets::text) <= 4096),
  last_title_id uuid,
  scan_complete boolean NOT NULL DEFAULT false,
  rows_applied integer NOT NULL DEFAULT 0 CHECK (rows_applied BETWEEN 0 AND 1000000)
);
CREATE UNIQUE INDEX discovery_one_active_generation ON discovery.generations(state) WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX discovery_one_building_generation ON discovery.generations(state) WHERE state = 'BUILDING';
CREATE UNIQUE INDEX discovery_one_previous_generation ON discovery.generations(state) WHERE state = 'PREVIOUS';
CREATE TABLE discovery.generation_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_generation uuid NOT NULL REFERENCES discovery.generations(id),
  building_generation uuid REFERENCES discovery.generations(id),
  previous_generation uuid REFERENCES discovery.generations(id),
  CHECK (building_generation IS NULL OR building_generation <> active_generation),
  CHECK (previous_generation IS NULL OR previous_generation <> active_generation),
  CHECK (building_generation IS NULL OR previous_generation IS NULL)
);
INSERT INTO discovery.generations(id, state, started_at, completed_at, scan_complete)
  VALUES ('00000000-0000-4000-8000-000000090001', 'ACTIVE', 0, 0, true);
INSERT INTO discovery.generation_control(singleton, active_generation)
  VALUES (true, '00000000-0000-4000-8000-000000090001');

CREATE TABLE discovery.title_fences (
  title_id uuid PRIMARY KEY,
  source_version integer NOT NULL CHECK (source_version BETWEEN 1 AND 2147483647),
  projection_version smallint NOT NULL CHECK (projection_version = 1),
  observed_at bigint NOT NULL CHECK (observed_at BETWEEN 0 AND 253402300799),
  visible_until bigint,
  indexed_at bigint NOT NULL CHECK (indexed_at BETWEEN observed_at AND observed_at + 2),
  trigger_event_id uuid,
  document_digest char(64) CHECK (document_digest ~ '^[a-f0-9]{64}$'),
  default_locale varchar(35),
  genres jsonb,
  editorial_labels jsonb,
  release_year integer,
  published_at bigint,
  CHECK ((document_digest IS NULL AND visible_until IS NULL AND default_locale IS NULL
      AND genres IS NULL AND editorial_labels IS NULL AND release_year IS NULL AND published_at IS NULL)
    OR (document_digest IS NOT NULL AND visible_until > observed_at AND visible_until <= observed_at + 300
      AND default_locale IS NOT NULL AND jsonb_typeof(genres) = 'array'
      AND jsonb_array_length(genres) <= 8 AND jsonb_typeof(editorial_labels) = 'array'
      AND jsonb_array_length(editorial_labels) <= 8 AND (release_year IS NULL OR release_year BETWEEN 1888 AND 9999)
      AND published_at BETWEEN 0 AND observed_at))
);
CREATE TABLE discovery.fence_localizations (
  title_id uuid NOT NULL REFERENCES discovery.title_fences(title_id) ON DELETE CASCADE,
  locale varchar(35) NOT NULL,
  title varchar(320) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 320),
  synopsis varchar(2048) NOT NULL CHECK (char_length(synopsis) BETWEEN 1 AND 2048),
  PRIMARY KEY (title_id, locale)
);
CREATE FUNCTION discovery.guard_title_fence() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
  IF NEW.title_id <> OLD.title_id OR NEW.projection_version <> OLD.projection_version
    OR NEW.source_version < OLD.source_version OR NEW.observed_at < OLD.observed_at
    OR (NEW.source_version = OLD.source_version AND OLD.document_digest IS NULL AND NEW.document_digest IS NOT NULL)
    OR (NEW.source_version = OLD.source_version AND OLD.document_digest IS NOT NULL
      AND NEW.document_digest IS NOT NULL AND NEW.document_digest <> OLD.document_digest)
    OR (NEW.source_version = OLD.source_version AND NEW.observed_at = OLD.observed_at
      AND NEW.document_digest IS NOT NULL AND NEW.visible_until <> OLD.visible_until) THEN
    RAISE EXCEPTION 'Discovery source fence regression';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER discovery_guard_title_fence BEFORE UPDATE ON discovery.title_fences
  FOR EACH ROW EXECUTE FUNCTION discovery.guard_title_fence();

CREATE TABLE discovery.generation_titles (
  generation_id uuid NOT NULL REFERENCES discovery.generations(id) ON DELETE CASCADE,
  title_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version BETWEEN 1 AND 2147483647),
  projection_version smallint NOT NULL CHECK (projection_version = 1),
  observed_at bigint NOT NULL CHECK (observed_at BETWEEN 0 AND 253402300799),
  visible_until bigint,
  indexed_at bigint NOT NULL CHECK (indexed_at BETWEEN observed_at AND observed_at + 2),
  trigger_event_id uuid,
  document_digest char(64) CHECK (document_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (generation_id, title_id),
  CHECK ((document_digest IS NULL AND visible_until IS NULL)
    OR (document_digest IS NOT NULL AND visible_until > observed_at AND visible_until <= observed_at + 300))
);
CREATE INDEX discovery_generation_visibility ON discovery.generation_titles(generation_id, visible_until, title_id)
  WHERE document_digest IS NOT NULL;
CREATE TABLE discovery.search_documents (
  generation_id uuid NOT NULL,
  title_id uuid NOT NULL,
  locale varchar(35) NOT NULL,
  normalized_title varchar(320) NOT NULL CHECK (char_length(normalized_title) BETWEEN 1 AND 320),
  normalized_synopsis varchar(2048) NOT NULL CHECK (char_length(normalized_synopsis) BETWEEN 1 AND 2048),
  normalized_genres varchar(391) NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', normalized_title), 'A') ||
    setweight(to_tsvector('simple', normalized_genres), 'B') ||
    setweight(to_tsvector('simple', normalized_synopsis), 'C')
  ) STORED,
  PRIMARY KEY (generation_id, title_id, locale),
  FOREIGN KEY (generation_id, title_id) REFERENCES discovery.generation_titles(generation_id, title_id) ON DELETE CASCADE
);
CREATE INDEX discovery_search_vector ON discovery.search_documents USING gin(search_vector);

GRANT USAGE ON SCHEMA discovery TO aster_discovery_runtime, aster_discovery_projector;
GRANT SELECT ON discovery.generation_control, discovery.generations,
  discovery.generation_titles, discovery.search_documents TO aster_discovery_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA discovery TO aster_discovery_projector;
GRANT INSERT, UPDATE ON discovery.title_fences, discovery.generation_titles TO aster_discovery_projector;
GRANT INSERT, UPDATE, DELETE ON discovery.fence_localizations, discovery.search_documents TO aster_discovery_projector;
GRANT INSERT, UPDATE, DELETE ON discovery.generations TO aster_discovery_projector;
GRANT UPDATE (building_generation, previous_generation, active_generation) ON discovery.generation_control TO aster_discovery_projector;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA discovery FROM PUBLIC;
INSERT INTO discovery.schema_migrations(version) VALUES (1);
COMMIT;
