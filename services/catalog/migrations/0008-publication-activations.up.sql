BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
ALTER TABLE catalog.command_audit DROP CONSTRAINT command_audit_kind_check;
ALTER TABLE catalog.command_audit ADD CONSTRAINT command_audit_kind_check
  CHECK (kind IN ('create', 'edit', 'review', 'media-ready', 'publish', 'retire', 'dispute', 'expire', 'reopen', 'replace', 'rollback'));
CREATE TABLE catalog.publication_activations (
  title_id uuid NOT NULL,
  title_version integer NOT NULL,
  publication_id uuid NOT NULL,
  rights_revision integer NOT NULL,
  PRIMARY KEY (title_id, title_version),
  FOREIGN KEY (title_id, title_version) REFERENCES catalog.command_audit(title_id, title_version),
  FOREIGN KEY (title_id, publication_id, rights_revision)
    REFERENCES catalog.publications(title_id, id, rights_revision)
);
CREATE INDEX publication_activation_lookup
  ON catalog.publication_activations(title_id, publication_id, title_version);
REVOKE ALL ON catalog.publication_activations FROM PUBLIC;
GRANT SELECT ON catalog.publication_activations TO aster_catalog_runtime;
INSERT INTO catalog.publication_activations
  SELECT o.title_id, o.title_version, p.id, p.rights_revision
  FROM catalog.publication_outbox o
  JOIN catalog.publications p ON p.title_id = o.title_id
    AND p.id::text = o.event->'payload'->>'publicationId'
    AND p.rights_revision::text = o.event->'payload'->>'rightsRevision'
  WHERE o.event_type = 'catalog.title-published';

-- Keep activation history after outbox delivery without granting direct audit writes.
CREATE FUNCTION catalog.record_publication_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $activation$
BEGIN
  INSERT INTO catalog.publication_activations
    SELECT id, version, publication_id, rights_revision FROM catalog.titles
    WHERE id = NEW.title_id AND version = NEW.title_version AND state = 'PUBLISHED'
      AND publication_id::text = NEW.event->'payload'->>'publicationId'
      AND rights_revision::text = NEW.event->'payload'->>'rightsRevision';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication event does not match the active title' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $activation$;
REVOKE ALL ON FUNCTION catalog.record_publication_activation() FROM PUBLIC;
CREATE TRIGGER record_publication_activation
  AFTER INSERT ON catalog.publication_outbox FOR EACH ROW
  WHEN (NEW.event_type = 'catalog.title-published')
  EXECUTE FUNCTION catalog.record_publication_activation();
INSERT INTO catalog.schema_migrations(version) VALUES (8);
COMMIT;
