BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
ALTER TABLE catalog.titles ADD COLUMN metadata jsonb CHECK (
  metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 32768)
);
CREATE TABLE catalog.publications (
  id uuid PRIMARY KEY,
  title_id uuid NOT NULL,
  rights_revision integer NOT NULL,
  source_checksum char(64) NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  manifest_url varchar(2048) NOT NULL,
  validation_report_id uuid NOT NULL UNIQUE,
  validated_at bigint NOT NULL CHECK (validated_at BETWEEN 0 AND 253402300799),
  UNIQUE (title_id, id, rights_revision),
  FOREIGN KEY (title_id, rights_revision) REFERENCES catalog.rights_revisions(title_id, revision)
);
ALTER TABLE catalog.titles ADD CONSTRAINT publication_owner
  FOREIGN KEY (id, publication_id, rights_revision) REFERENCES catalog.publications(title_id, id, rights_revision);
CREATE TABLE catalog.command_audit (
  id uuid PRIMARY KEY,
  title_id uuid NOT NULL REFERENCES catalog.titles(id),
  title_version integer NOT NULL CHECK (title_version > 1),
  kind varchar(12) NOT NULL CHECK (kind IN ('create', 'edit', 'review', 'media-ready', 'publish', 'retire', 'dispute', 'expire', 'reopen')),
  actor_id uuid NOT NULL,
  occurred_at bigint NOT NULL CHECK (occurred_at BETWEEN 0 AND 253402300799),
  correlation_id uuid NOT NULL,
  mutation_id uuid NOT NULL,
  reason varchar(512),
  metadata jsonb CHECK (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 32768)),
  UNIQUE (title_id, title_version)
);
CREATE TABLE catalog.command_receipts (
  title_id uuid NOT NULL REFERENCES catalog.titles(id),
  mutation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  digest char(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  expires_at bigint NOT NULL CHECK (expires_at BETWEEN 0 AND 253402300799),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 64),
  title_version integer NOT NULL,
  result jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 1024
    AND result->>'titleId' = title_id::text AND result->>'version' = title_version::text, false)),
  PRIMARY KEY (title_id, mutation_id),
  UNIQUE (title_id, slot),
  FOREIGN KEY (title_id, title_version) REFERENCES catalog.command_audit(title_id, title_version)
);
CREATE TABLE catalog.publication_outbox (
  event_id uuid PRIMARY KEY,
  title_id uuid NOT NULL REFERENCES catalog.titles(id),
  title_version integer NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 128),
  event_type varchar(32) NOT NULL CHECK (event_type IN ('catalog.title-published', 'catalog.title-retired')),
  event jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(event) = 'object' AND octet_length(event::text) <= 4096
    AND event->>'eventId' = event_id::text AND event->>'eventType' = event_type
    AND event->>'schemaVersion' = '1' AND event->>'producer' = 'catalog'
    AND event->'aggregate'->>'id' = title_id::text AND event->'aggregate'->>'version' = title_version::text
    AND event->'payload'->>'titleId' = title_id::text, false)),
  UNIQUE (title_id, slot),
  UNIQUE (title_id, title_version),
  FOREIGN KEY (title_id, title_version) REFERENCES catalog.command_audit(title_id, title_version)
);
GRANT UPDATE (state, rights_revision, publication_id, metadata) ON catalog.titles TO aster_catalog_runtime;
GRANT SELECT ON catalog.publications TO aster_catalog_runtime;
GRANT SELECT, INSERT ON catalog.command_audit, catalog.publication_outbox TO aster_catalog_runtime;
GRANT SELECT, INSERT, DELETE ON catalog.command_receipts TO aster_catalog_runtime;
INSERT INTO catalog.schema_migrations(version) VALUES (2);
COMMIT;
