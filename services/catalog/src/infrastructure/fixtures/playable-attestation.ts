import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type { ValidatedPublicationReference } from "../../domain/title.js";
import { rightsRepositories } from "../persistence/postgres-rights.js";
import { generatedSeed } from "./generated-seed.js";

async function current(tx: AsterPostgresTransaction, seed: ReturnType<typeof generatedSeed>) {
  const repository = rightsRepositories(tx);
  const title = await repository.lockTitle(seed.titleId);
  const rights = await repository.findRights(seed.titleId, null);
  if (
    !title ||
    !rights ||
    ![3, 4, 5].includes(title.version) ||
    title.state !==
      ({ 3: "RIGHTS_REVIEWED", 4: "MEDIA_READY", 5: "PUBLISHED" } as const)[
        title.version as 3 | 4 | 5
      ] ||
    title.rightsRevision !== 2 ||
    title.latestRightsRevision !== 2 ||
    rights.actorId !== seed.actorId ||
    rights.record.revision !== 2 ||
    rights.record.status !== "APPROVED" ||
    Object.entries(seed.rights).some(
      ([key, value]) =>
        JSON.stringify(rights.record[key as keyof typeof rights.record]) !== JSON.stringify(value),
    ) ||
    (title.version >= 4 && title.publicationId !== seed.publicationId)
  ) {
    throw new Error("Playable seed approval no longer matches its fixed scope.");
  }
}

export async function assertPlayableSeedApproval(
  database: AsterPostgresAdapter,
  report: unknown,
  signal: AbortSignal,
) {
  const seed = generatedSeed(report, "playable");
  const result = await database.transaction(async (tx) => {
    await current(tx, seed);
    return { action: "commit", value: true };
  }, signal);
  if (result.status !== "committed" || !result.value) {
    throw new Error("Playable seed approval unavailable.");
  }
}

export async function attestPlayableSeed(
  database: AsterPostgresAdapter,
  report: unknown,
  publication: ValidatedPublicationReference,
  signal: AbortSignal,
) {
  const seed = generatedSeed(report, "playable");
  if (
    publication.id !== seed.publicationId ||
    publication.titleId !== seed.titleId ||
    publication.rightsRevision !== 2 ||
    publication.validationReportId !== seed.reportId ||
    publication.manifestUrl !== seed.manifest ||
    publication.sourceChecksum !== seed.checksum ||
    !Number.isSafeInteger(publication.validatedAt) ||
    publication.validatedAt < 0
  ) {
    throw new Error("Playable seed attestation is outside its fixed scope.");
  }
  const result = await database.transaction(async (tx) => {
    await current(tx, seed);
    await tx.query({
      text: "INSERT INTO catalog.publications (id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING",
      values: [
        publication.id,
        seed.titleId,
        2,
        seed.checksum,
        seed.manifest,
        seed.reportId,
        publication.validatedAt,
      ],
    });
    const same = await tx.query({
      text: "SELECT id FROM catalog.publications WHERE id=$1 AND title_id=$2 AND rights_revision=2 AND source_checksum=$3 AND manifest_url=$4 AND validation_report_id=$5 AND validated_at <= $6",
      values: [
        seed.publicationId,
        seed.titleId,
        seed.checksum,
        seed.manifest,
        seed.reportId,
        publication.validatedAt,
      ],
    });
    return { action: same.rowCount === 1 ? "commit" : "rollback", value: same.rowCount === 1 };
  }, signal);
  if (result.status !== "committed" || !result.value) {
    throw new Error("Playable seed attestation conflict.");
  }
}
