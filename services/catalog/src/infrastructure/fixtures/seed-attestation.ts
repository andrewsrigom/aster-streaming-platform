import type { AsterPostgresAdapter } from "@aster/postgres";
import type { ValidatedPublicationReference } from "../../domain/title.js";
import {
  UI_SEED_TITLE_ID,
  UI_SEED_PUBLICATION_ID,
  UI_SEED_REPORT_ID,
  UI_SEED_MANIFEST,
} from "./generated-ui-fixture.js";

export async function attestUiSeed(
  database: AsterPostgresAdapter,
  publication: ValidatedPublicationReference,
  signal: AbortSignal,
): Promise<void> {
  if (
    publication.titleId !== UI_SEED_TITLE_ID ||
    publication.id !== UI_SEED_PUBLICATION_ID ||
    publication.rightsRevision !== 2 ||
    publication.validationReportId !== UI_SEED_REPORT_ID ||
    publication.manifestUrl !== UI_SEED_MANIFEST
  ) {
    throw new Error("UI seed attestation is outside its fixed scope.");
  }
  const result = await database.transaction(async (tx) => {
    await tx.query({
      text: "INSERT INTO catalog.publications (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING",
      values: [
        publication.id,
        publication.titleId,
        publication.rightsRevision,
        publication.sourceChecksum,
        publication.manifestUrl,
        publication.validationReportId,
        publication.validatedAt,
      ],
    });
    const same = await tx.query({
      text: "SELECT id FROM catalog.publications WHERE id=$1 AND title_id=$2 AND rights_revision=$3 AND source_checksum=$4 AND manifest_url=$5 AND validation_report_id=$6 AND validated_at <= $7",
      values: [
        publication.id,
        publication.titleId,
        publication.rightsRevision,
        publication.sourceChecksum,
        publication.manifestUrl,
        publication.validationReportId,
        publication.validatedAt,
      ],
    });
    return { action: same.rowCount === 1 ? "commit" : "rollback", value: same.rowCount === 1 };
  }, signal);
  if (result.status !== "committed" || !result.value) {
    throw new Error("UI seed attestation could not be recorded without overwriting data.");
  }
}
