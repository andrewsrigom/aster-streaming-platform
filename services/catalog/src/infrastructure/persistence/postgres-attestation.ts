import type { AsterPostgresAdapter } from "@aster/postgres";
import { normalizeAcquisitionAttempt } from "../../domain/media-acquisition.js";
import {
  normalizeProcessingAttempt,
  ARTWORK_RECIPE_VERSION,
} from "../../domain/media-processing.js";
import { MEDIA_RECIPE_VERSION } from "../../domain/media-request.js";
import { normalizeTitleMetadata, artworkPublishable } from "../../domain/metadata.js";
import { normalizeRightsRecord, currentApprovedRights } from "../../domain/rights.js";
import { catalogIdentifier, catalogVersion } from "../../domain/values.js";
import { MediaProcessingError } from "../media/processing-error.js";
import type { PublicationBundle } from "../media/publication-bundle.js";
import { row } from "./postgres-rights.js";

export interface PublicationSelection {
  readonly titleId: string;
  readonly expectedVersion: number;
  readonly hlsAttemptId: string;
  readonly artworkAttemptId: string;
}
export const attestationFunction =
  "catalog.register_media_attestation(uuid,integer,integer,text,text,uuid,uuid,text,text,uuid,uuid,uuid,uuid)";

export function createPostgresMediaAttester(database: Pick<AsterPostgresAdapter, "transaction">) {
  return {
    async probe(signal: AbortSignal): Promise<void> {
      const result = await database.transaction(async (tx) => {
        const response = await tx.query({
          text: "SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) AND pg_has_role(current_user, 'aster_catalog_attester', 'USAGE') AND NOT pg_has_role(current_user, 'aster_catalog_runtime', 'MEMBER') AND NOT pg_has_role(current_user, 'aster_catalog_reader', 'MEMBER') AND NOT has_schema_privilege(current_user, 'catalog', 'CREATE') AND NOT COALESCE(has_schema_privilege(current_user, to_regnamespace('identity'), 'USAGE'), false) AND has_function_privilege(current_user, $1, 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'catalog' AND c.relkind = 'r' AND (has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user, c.oid, 'INSERT,UPDATE'))) AS allowed FROM pg_roles WHERE rolname = current_user",
          values: [attestationFunction],
        });
        return {
          action: "rollback",
          value: response.rowCount === 1 && row(response.rows[0])["allowed"] === true,
        };
      }, signal);
      if (result.status !== "rolled_back" || !result.value) {
        throw new MediaProcessingError(
          "CONTROL_UNAVAILABLE",
          "Attester privilege boundary rejected",
        );
      }
    },
    async read(selection: PublicationSelection, signal: AbortSignal) {
      if (
        ![selection.titleId, selection.hlsAttemptId, selection.artworkAttemptId].every(
          catalogIdentifier,
        ) ||
        !catalogVersion(selection.expectedVersion)
      ) {
        throw new MediaProcessingError("INVALID_OUTPUT", "Invalid publication selector");
      }
      const result = await database.transaction(async (tx) => {
        const response = await tx.query({
          // Computation is checksum-scoped; publication permission comes from this title's current rights.
          text: "SELECT t.version, t.state, t.rights_revision, t.latest_rights_revision, t.metadata, r.record AS rights, h.record AS hls, a.record AS artwork, ha.record AS hls_acquisition, aa.record AS artwork_acquisition, hr.request->'source'->>'container' AS container FROM catalog.titles t JOIN catalog.rights_revisions r ON r.title_id = t.id AND r.revision = t.latest_rights_revision JOIN catalog.media_processing h ON h.id = $2 JOIN catalog.media_processing a ON a.id = $3 JOIN catalog.media_acquisitions ha ON ha.id = h.acquisition_id JOIN catalog.media_acquisitions aa ON aa.id = a.acquisition_id JOIN catalog.media_requests hr ON hr.request_id = h.request_id JOIN catalog.media_requests ar ON ar.request_id = a.request_id WHERE t.id = $1",
          values: [selection.titleId, selection.hlsAttemptId, selection.artworkAttemptId],
        });
        if (response.rowCount !== 1) {
          throw new Error("Publication source unavailable");
        }
        const data = row(response.rows[0]);
        const rights = normalizeRightsRecord(data["rights"]);
        const metadata = normalizeTitleMetadata(data["metadata"]);
        const hls = normalizeProcessingAttempt(data["hls"]);
        const artwork = normalizeProcessingAttempt(data["artwork"]);
        const original = normalizeAcquisitionAttempt(data["hls_acquisition"]);
        const artOriginal = normalizeAcquisitionAttempt(data["artwork_acquisition"]);
        const container = data["container"];
        if (
          !rights ||
          !metadata ||
          !hls?.candidate ||
          !artwork?.candidate ||
          !original?.original ||
          !artOriginal?.original ||
          rights.titleId !== selection.titleId ||
          hls.id !== selection.hlsAttemptId ||
          artwork.id !== selection.artworkAttemptId ||
          hls.status !== "SUCCEEDED" ||
          artwork.status !== "SUCCEEDED" ||
          original.status !== "SUCCEEDED" ||
          artOriginal.status !== "SUCCEEDED" ||
          hls.recipeVersion !== MEDIA_RECIPE_VERSION ||
          artwork.recipeVersion !== ARTWORK_RECIPE_VERSION ||
          hls.sourceChecksum !== original.original.sha256 ||
          artwork.sourceChecksum !== original.original.sha256 ||
          artOriginal.original.sha256 !== original.original.sha256 ||
          artOriginal.original.bytes !== original.original.bytes ||
          (container !== "zip" && container !== "mp4")
        ) {
          throw new Error("Invalid durable candidate");
        }
        return {
          action: "rollback",
          value: {
            version: data["version"],
            state: data["state"],
            rightsRevision: data["rights_revision"],
            latestRightsRevision: data["latest_rights_revision"],
            rights,
            metadata,
            hls,
            artwork,
            identity: {
              sha256: original.original.sha256,
              bytes: original.original.bytes,
              container,
            },
          },
        } as const;
      }, signal);
      if (result.status !== "rolled_back") {
        throw new MediaProcessingError("CONTROL_UNAVAILABLE", "Publication source unavailable");
      }
      if (result.value.version !== selection.expectedVersion) {
        throw new MediaProcessingError("RIGHTS_REVOKED", "Publication version changed");
      }
      return result.value;
    },
    async register(
      selection: PublicationSelection,
      bundle: PublicationBundle,
      rightsRevision: number,
      ids: Readonly<{
        publicationId: string;
        reportId: string;
        actorId: string;
        correlationId: string;
      }>,
      signal: AbortSignal,
    ) {
      if (!Object.values(ids).every(catalogIdentifier)) {
        throw new Error("Invalid attestation identity");
      }
      const result = await database.transaction(async (tx) => {
        const response = await tx.query({
          text: "SELECT catalog.register_media_attestation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS publication_id",
          values: [
            selection.titleId,
            selection.expectedVersion,
            rightsRevision,
            bundle.sourceChecksum,
            bundle.bundleHash,
            selection.hlsAttemptId,
            selection.artworkAttemptId,
            bundle.hls.reportChecksum,
            bundle.artwork.reportChecksum,
            ids.publicationId,
            ids.reportId,
            ids.actorId,
            ids.correlationId,
          ],
        });
        const publicationId = row(response.rows[0])["publication_id"];
        return catalogIdentifier(publicationId)
          ? ({ action: "commit", value: publicationId } as const)
          : ({ action: "rollback", value: null } as const);
      }, signal);
      if (result.status !== "committed" || result.value === null) {
        throw new MediaProcessingError("RIGHTS_REVOKED", "Attestation rejected");
      }
      return result.value;
    },
  };
}
export type PublicationSource = Awaited<
  ReturnType<ReturnType<typeof createPostgresMediaAttester>["read"]>
>;
export function requirePublicationApproval(
  source: PublicationSource,
  bundle: PublicationBundle,
  now: number,
): void {
  const policy = { commercial: true, allowLocalMedia: true };
  if (
    !["RIGHTS_REVIEWED", "MEDIA_READY", "PUBLISHED"].includes(String(source.state)) ||
    source.rightsRevision !== source.latestRightsRevision ||
    source.rightsRevision !== source.rights.revision ||
    !currentApprovedRights(source.rights, now, policy) ||
    source.rights.sourceChecksum !== source.identity.sha256 ||
    !artworkPublishable(source.metadata, source.rights.titleId, now, policy) ||
    source.metadata.artwork?.url !== bundle.artworkUrl ||
    source.metadata.artwork.rights.sourceChecksum !== bundle.poster.sha256 ||
    source.hls.candidate?.prefix !== bundle.hls.prefix ||
    source.hls.candidate.reportChecksum !== bundle.hls.reportChecksum ||
    source.artwork.candidate?.prefix !== bundle.artwork.prefix ||
    source.artwork.candidate.reportChecksum !== bundle.artwork.reportChecksum
  ) {
    throw new MediaProcessingError("RIGHTS_REVOKED", "Current publication approval unavailable");
  }
}
