import { currentApprovedRights, type RightsUsePolicy } from "./rights.js";
import {
  catalogChecksum,
  catalogIdentifier,
  catalogRecord,
  catalogTimestamp,
  catalogUrl,
  catalogVersion,
} from "./values.js";

export const TITLE_STATES = Object.freeze([
  "DRAFT",
  "RIGHTS_REVIEWED",
  "MEDIA_READY",
  "PUBLISHED",
  "RETIRED",
] as const);
export type TitleState = (typeof TITLE_STATES)[number];

export interface CatalogTitleLifecycle {
  readonly id: string;
  readonly version: number;
  readonly state: TitleState;
  readonly rightsRevision: number | null;
  readonly publicationId: string | null;
}

export interface ValidatedPublicationReference {
  readonly id: string;
  readonly titleId: string;
  readonly rightsRevision: number;
  readonly sourceChecksum: string;
  readonly manifestUrl: string;
  readonly validationReportId: string;
  readonly validatedAt: number;
}

export function normalizePublication(
  value: unknown,
  now: number,
): ValidatedPublicationReference | undefined {
  const input = catalogRecord(value, [
    "id",
    "titleId",
    "rightsRevision",
    "sourceChecksum",
    "manifestUrl",
    "validationReportId",
    "validatedAt",
  ]);
  if (
    !input ||
    !catalogIdentifier(input["id"]) ||
    !catalogIdentifier(input["titleId"]) ||
    !catalogVersion(input["rightsRevision"]) ||
    !catalogChecksum(input["sourceChecksum"]) ||
    !catalogUrl(input["manifestUrl"]) ||
    !catalogIdentifier(input["validationReportId"]) ||
    !catalogTimestamp(input["validatedAt"]) ||
    input["validatedAt"] > now
  ) {
    return undefined;
  }
  return Object.freeze({
    id: input["id"],
    titleId: input["titleId"],
    rightsRevision: input["rightsRevision"],
    sourceChecksum: input["sourceChecksum"],
    manifestUrl: input["manifestUrl"],
    validationReportId: input["validationReportId"],
    validatedAt: input["validatedAt"],
  });
}

export function normalizeTitleLifecycle(value: unknown): CatalogTitleLifecycle | undefined {
  const input = catalogRecord(value, ["id", "version", "state", "rightsRevision", "publicationId"]);
  if (
    !input ||
    !catalogIdentifier(input["id"]) ||
    !catalogVersion(input["version"]) ||
    !TITLE_STATES.some((state) => state === input["state"])
  ) {
    return undefined;
  }
  const state = input["state"] as TitleState;
  const rightsRevision = input["rightsRevision"];
  const publicationId = input["publicationId"];
  if (
    (rightsRevision !== null && !catalogVersion(rightsRevision)) ||
    (publicationId !== null && !catalogIdentifier(publicationId))
  ) {
    return undefined;
  }
  if (state === "DRAFT" && publicationId !== null) {
    return undefined;
  }
  if (publicationId !== null && rightsRevision === null) {
    return undefined;
  }
  if (state === "RIGHTS_REVIEWED" && (rightsRevision === null || publicationId !== null)) {
    return undefined;
  }
  if (
    ["MEDIA_READY", "PUBLISHED"].includes(state) &&
    (rightsRevision === null || publicationId === null)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: input["id"],
    version: input["version"],
    state,
    rightsRevision,
    publicationId,
  });
}

function eligibleMedia(
  title: CatalogTitleLifecycle,
  rights: unknown,
  media: unknown,
  now: number,
  policy: RightsUsePolicy,
) {
  const approved = currentApprovedRights(rights, now, policy);
  if (!approved || approved.titleId !== title.id || approved.revision !== title.rightsRevision) {
    return undefined;
  }
  const ready = normalizePublication(media, now);
  if (
    !ready ||
    ready.titleId !== title.id ||
    ready.rightsRevision !== approved.revision ||
    (approved.sourceChecksum !== null && approved.sourceChecksum !== ready.sourceChecksum) ||
    (approved.reviewedAt !== null && ready.validatedAt < approved.reviewedAt)
  ) {
    return undefined;
  }
  return ready;
}

export function transitionTitle(
  value: unknown,
  target: TitleState,
  facts: Readonly<{ rights: unknown; publication: unknown; now: number; policy: RightsUsePolicy }>,
):
  | Readonly<{ status: "completed"; title: CatalogTitleLifecycle }>
  | Readonly<{
      status: "rejected";
      code: "INVALID_INPUT" | "INVALID_TRANSITION" | "RIGHTS_NOT_APPROVED" | "MEDIA_NOT_READY";
    }> {
  const title = normalizeTitleLifecycle(value);
  if (
    !title ||
    !catalogTimestamp(facts.now) ||
    title.version === 2_147_483_647 ||
    !TITLE_STATES.includes(target)
  ) {
    return { status: "rejected", code: "INVALID_INPUT" };
  }
  const allowed =
    target === "RETIRED"
      ? title.state !== "RETIRED"
      : (title.state === "RETIRED" && target === "DRAFT") ||
        (title.state === "DRAFT" && target === "RIGHTS_REVIEWED") ||
        (title.state === "RIGHTS_REVIEWED" && target === "MEDIA_READY") ||
        (title.state === "MEDIA_READY" && target === "PUBLISHED");
  if (!allowed) {
    return { status: "rejected", code: "INVALID_TRANSITION" };
  }
  let rightsRevision = title.rightsRevision;
  let publicationId = title.publicationId;
  if (target === "DRAFT") {
    // Retain the last review revision as a floor; reopening cannot reuse retired approval.
    publicationId = null;
  } else if (target !== "RETIRED") {
    const approved = currentApprovedRights(facts.rights, facts.now, facts.policy);
    if (
      !approved ||
      approved.titleId !== title.id ||
      (rightsRevision !== null &&
        (title.state === "DRAFT"
          ? approved.revision <= rightsRevision
          : rightsRevision !== approved.revision))
    ) {
      return { status: "rejected", code: "RIGHTS_NOT_APPROVED" };
    }
    rightsRevision = approved.revision;
    if (target === "MEDIA_READY" || target === "PUBLISHED") {
      // This reference must come from owner-verified attestation, never raw public mutation input.
      const ready = eligibleMedia(
        { ...title, rightsRevision },
        approved,
        facts.publication,
        facts.now,
        facts.policy,
      );
      if (!ready || (target === "PUBLISHED" && ready.id !== title.publicationId)) {
        return { status: "rejected", code: "MEDIA_NOT_READY" };
      }
      publicationId = ready.id;
    }
  }
  return {
    status: "completed",
    title: Object.freeze({
      ...title,
      state: target,
      version: title.version + 1,
      rightsRevision,
      publicationId,
    }),
  };
}

export function isPublicTitle(
  value: unknown,
  rights: unknown,
  media: unknown,
  now: number,
  policy: RightsUsePolicy,
): boolean {
  if (!catalogTimestamp(now)) {
    return false;
  }
  const title = normalizeTitleLifecycle(value);
  if (title?.state !== "PUBLISHED") {
    return false;
  }
  const ready = eligibleMedia(title, rights, media, now, policy);
  return ready !== undefined && ready.id === title.publicationId;
}
