BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '2s';
CREATE ROLE aster_catalog_attester NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA catalog TO aster_catalog_attester;
GRANT SELECT ON catalog.titles, catalog.rights_revisions, catalog.media_processing,
  catalog.media_acquisitions, catalog.media_requests TO aster_catalog_attester;

CREATE TABLE catalog.media_attestations (
  publication_id uuid PRIMARY KEY REFERENCES catalog.publications(id),
  title_id uuid NOT NULL,
  rights_revision integer NOT NULL,
  title_version integer NOT NULL CHECK (title_version > 0),
  bundle_hash text NOT NULL CHECK (bundle_hash ~ '^[a-f0-9]{64}$'),
  hls_attempt_id uuid NOT NULL REFERENCES catalog.media_processing(id),
  artwork_attempt_id uuid NOT NULL REFERENCES catalog.media_processing(id),
  hls_report_checksum text NOT NULL CHECK (hls_report_checksum ~ '^[a-f0-9]{64}$'),
  artwork_report_checksum text NOT NULL CHECK (artwork_report_checksum ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  database_principal name NOT NULL,
  FOREIGN KEY (title_id, publication_id, rights_revision)
    REFERENCES catalog.publications(title_id, id, rights_revision),
  UNIQUE (title_id, rights_revision, bundle_hash)
);
REVOKE ALL ON catalog.media_attestations FROM PUBLIC;
GRANT SELECT ON catalog.media_attestations TO aster_catalog_attester, aster_catalog_runtime;

-- Only this operation can cross the technical-registration boundary. It never changes a title.
CREATE FUNCTION catalog.register_media_attestation(
  p_title uuid, p_version integer, p_rights integer, p_source text, p_bundle text,
  p_hls uuid, p_artwork uuid, p_hls_report text, p_artwork_report text,
  p_publication uuid, p_report uuid, p_actor uuid, p_correlation uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $register$
DECLARE
  t catalog.titles%ROWTYPE;
  r jsonb;
  art jsonb;
  at_time bigint;
  prior uuid;
  base_url text;
BEGIN
  IF p_title IS NULL OR p_version IS NULL OR p_rights IS NULL OR p_hls IS NULL
    OR p_artwork IS NULL OR p_publication IS NULL OR p_report IS NULL
    OR p_actor IS NULL OR p_correlation IS NULL OR NOT COALESCE(
      p_source ~ '^[a-f0-9]{64}$' AND p_bundle ~ '^[a-f0-9]{64}$'
      AND p_hls_report ~ '^[a-f0-9]{64}$' AND p_artwork_report ~ '^[a-f0-9]{64}$', false)
  THEN RETURN NULL; END IF;
  SELECT * INTO t FROM catalog.titles WHERE id = p_title FOR UPDATE;
  at_time := floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF NOT FOUND OR t.version <> p_version OR t.rights_revision IS DISTINCT FROM p_rights
    OR t.latest_rights_revision IS DISTINCT FROM p_rights
    OR t.state NOT IN ('RIGHTS_REVIEWED', 'MEDIA_READY', 'PUBLISHED')
  THEN RETURN NULL; END IF;
  SELECT record INTO r FROM catalog.rights_revisions WHERE title_id = p_title AND revision = p_rights;
  art := t.metadata->'artwork'->'rights';
  base_url := 'http://127.0.0.1:9001/aster-media-published/publications/' || p_bundle || '/';
  IF NOT COALESCE(
    r->>'status' = 'APPROVED' AND r->>'sourceChecksum' = p_source
    AND (r->>'reviewedAt')::bigint <= at_time
    AND (r->>'validUntil' IS NULL OR (r->>'validUntil')::bigint > at_time)
    AND r->>'redistributionAllowed' = 'true' AND r->>'modificationAllowed' = 'true'
    AND r->>'commercialUseAllowed' = 'true' AND r->>'shareAlikeRequired' = 'false'
    AND r->>'technicalRestrictions' = 'NONE'
    AND art->>'status' = 'APPROVED' AND art->>'titleId' = p_title::text
    AND art->>'assetSourceUrl' = t.metadata->'artwork'->>'url'
    AND art->>'assetSourceUrl' ~ ('^' || replace(base_url, '.', '\.') || 'poster-[0-9]{1,3}\.jpg$')
    AND art->>'sourceChecksum' ~ '^[a-f0-9]{64}$'
    AND (art->>'reviewedAt')::bigint <= at_time
    AND (art->>'validUntil' IS NULL OR (art->>'validUntil')::bigint > at_time)
    AND art->>'redistributionAllowed' = 'true' AND art->>'modificationAllowed' = 'true'
    AND art->>'commercialUseAllowed' = 'true' AND art->>'shareAlikeRequired' = 'false'
    AND art->>'technicalRestrictions' = 'NONE', false)
  THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog.media_processing WHERE id = p_hls AND status = 'SUCCEEDED'
    AND record->>'sourceChecksum' = p_source AND record->>'recipeVersion' = 'hls-avc-aac-v1'
    AND record->'candidate'->>'reportChecksum' = p_hls_report)
    OR NOT EXISTS (SELECT 1 FROM catalog.media_processing WHERE id = p_artwork AND status = 'SUCCEEDED'
    AND record->>'sourceChecksum' = p_source AND record->>'recipeVersion' = 'frame-jpeg-v1'
    AND record->'candidate'->>'reportChecksum' = p_artwork_report)
  THEN RETURN NULL; END IF;
  SELECT publication_id INTO prior FROM catalog.media_attestations
    WHERE title_id = p_title AND rights_revision = p_rights AND bundle_hash = p_bundle;
  IF FOUND THEN RETURN prior; END IF;
  IF (SELECT count(*) FROM catalog.media_attestations WHERE title_id = p_title) >= 64
  THEN RETURN NULL; END IF;
  INSERT INTO catalog.publications
    (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at)
    VALUES (p_publication, p_title, p_rights, p_source, base_url || 'master.m3u8', p_report, at_time);
  INSERT INTO catalog.media_attestations VALUES
    (p_publication, p_title, p_rights, p_version, p_bundle, p_hls, p_artwork,
     p_hls_report, p_artwork_report, p_actor, p_correlation, session_user);
  RETURN p_publication;
END $register$;
REVOKE ALL ON FUNCTION catalog.register_media_attestation(uuid, integer, integer, text, text,
  uuid, uuid, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog.register_media_attestation(uuid, integer, integer, text, text,
  uuid, uuid, text, text, uuid, uuid, uuid, uuid) TO aster_catalog_attester;
INSERT INTO catalog.schema_migrations(version) VALUES (7);
COMMIT;
