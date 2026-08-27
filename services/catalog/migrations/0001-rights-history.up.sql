BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE ROLE aster_catalog_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA catalog;
REVOKE ALL ON SCHEMA catalog FROM PUBLIC;

CREATE TABLE catalog.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE catalog.titles (
  id uuid PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),
  state varchar(15) NOT NULL CHECK (state IN ('DRAFT', 'RIGHTS_REVIEWED', 'MEDIA_READY', 'PUBLISHED', 'RETIRED')),
  latest_rights_revision integer CHECK (latest_rights_revision > 0),
  rights_revision integer CHECK (rights_revision > 0),
  publication_id uuid,
  CHECK (rights_revision IS NULL OR (latest_rights_revision IS NOT NULL AND rights_revision <= latest_rights_revision)),
  CHECK (publication_id IS NULL OR rights_revision IS NOT NULL),
  CHECK (state <> 'DRAFT' OR publication_id IS NULL),
  CHECK (state <> 'RIGHTS_REVIEWED' OR (rights_revision IS NOT NULL AND publication_id IS NULL)),
  CHECK (state NOT IN ('MEDIA_READY', 'PUBLISHED') OR (rights_revision IS NOT NULL AND publication_id IS NOT NULL))
);
CREATE TABLE catalog.rights_revisions (
  id uuid NOT NULL UNIQUE,
  title_id uuid NOT NULL REFERENCES catalog.titles(id),
  revision integer NOT NULL CHECK (revision > 0),
  status varchar(19) NOT NULL CHECK (status IN ('DRAFT', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'EXPIRED', 'DISPUTED')),
  record jsonb NOT NULL CHECK (COALESCE(
    jsonb_typeof(record) = 'object' AND octet_length(record::text) <= 32768
    AND record ?& ARRAY['id', 'titleId', 'revision', 'status', 'workTitle', 'creator', 'copyrightHolder',
      'canonicalSourceUrl', 'assetSourceUrl', 'licenseName', 'licenseVersion', 'licenseUrl',
      'attributionText', 'modificationNotice', 'thirdPartyMaterialNotes', 'trademarkNotes',
      'redistributionAllowed', 'commercialUseAllowed', 'modificationAllowed', 'shareAlikeRequired',
      'technicalRestrictions', 'sourceChecksum', 'reviewedAt', 'reviewedBy', 'validUntil', 'evidenceLocations']
    AND record->>'id' = id::text AND record->>'titleId' = title_id::text
    AND record->>'revision' = revision::text AND record->>'status' = status
    AND jsonb_typeof(record->'revision') = 'number'
    AND jsonb_typeof(record->'evidenceLocations') = 'array'
    AND jsonb_array_length(record->'evidenceLocations') <= 8,
    false
  )),
  PRIMARY KEY (title_id, revision)
);
ALTER TABLE catalog.titles ADD CONSTRAINT latest_rights_owner
  FOREIGN KEY (id, latest_rights_revision) REFERENCES catalog.rights_revisions(title_id, revision)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog.titles ADD CONSTRAINT active_rights_owner
  FOREIGN KEY (id, rights_revision) REFERENCES catalog.rights_revisions(title_id, revision);

CREATE TABLE catalog.rights_audit (
  title_id uuid NOT NULL,
  revision integer NOT NULL,
  title_version integer NOT NULL CHECK (title_version > 1),
  actor_id uuid NOT NULL,
  recorded_at bigint NOT NULL CHECK (recorded_at BETWEEN 0 AND 253402300799),
  correlation_id uuid NOT NULL,
  PRIMARY KEY (title_id, revision),
  UNIQUE (title_id, title_version),
  FOREIGN KEY (title_id, revision) REFERENCES catalog.rights_revisions(title_id, revision)
);
-- A committed revision must have provenance, even if a future caller forgets the audit insert.
ALTER TABLE catalog.rights_revisions ADD CONSTRAINT rights_provenance
  FOREIGN KEY (title_id, revision) REFERENCES catalog.rights_audit(title_id, revision)
  DEFERRABLE INITIALLY DEFERRED;

GRANT USAGE ON SCHEMA catalog TO aster_catalog_runtime;
GRANT SELECT, INSERT ON catalog.titles TO aster_catalog_runtime;
GRANT UPDATE (version, latest_rights_revision) ON catalog.titles TO aster_catalog_runtime;
GRANT SELECT, INSERT ON catalog.rights_revisions, catalog.rights_audit TO aster_catalog_runtime;
INSERT INTO catalog.schema_migrations(version) VALUES (1);
COMMIT;
