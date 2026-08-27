import {
  catalogChecksum,
  catalogIdentifier,
  catalogRecord,
  catalogText,
  catalogTimestamp,
  catalogUrl,
  catalogVersion,
} from "./values.js";

const RIGHTS_STATES = [
  "DRAFT",
  "NEEDS_CLARIFICATION",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "DISPUTED",
] as const;
type RightsStatus = (typeof RIGHTS_STATES)[number];
const TEXT_FIELDS = [
  "workTitle",
  "creator",
  "copyrightHolder",
  "licenseName",
  "licenseVersion",
  "attributionText",
  "modificationNotice",
  "thirdPartyMaterialNotes",
  "trademarkNotes",
] as const;
const URL_FIELDS = ["canonicalSourceUrl", "assetSourceUrl", "licenseUrl"] as const;
const PERMISSION_FIELDS = [
  "redistributionAllowed",
  "commercialUseAllowed",
  "modificationAllowed",
  "shareAlikeRequired",
] as const;
type TextFields = Record<(typeof TEXT_FIELDS)[number] | (typeof URL_FIELDS)[number], string | null>;
type PermissionFields = Record<(typeof PERMISSION_FIELDS)[number], boolean | null>;

export interface RightsRecord extends Readonly<TextFields>, Readonly<PermissionFields> {
  readonly id: string;
  readonly titleId: string;
  readonly revision: number;
  readonly status: RightsStatus;
  readonly technicalRestrictions: "NONE" | "INCOMPATIBLE" | null;
  readonly sourceChecksum: string | null;
  readonly reviewedAt: number | null;
  readonly reviewedBy: string | null;
  readonly validUntil: number | null;
  readonly evidenceLocations: readonly string[];
}

export interface RightsUsePolicy {
  readonly commercial: boolean;
}

const KEYS = [
  "id",
  "titleId",
  "revision",
  "status",
  ...TEXT_FIELDS,
  ...URL_FIELDS,
  ...PERMISSION_FIELDS,
  "technicalRestrictions",
  "sourceChecksum",
  "reviewedAt",
  "reviewedBy",
  "validUntil",
  "evidenceLocations",
];

function evidenceList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (
    typeof length !== "number" ||
    length > 8 ||
    Reflect.ownKeys(descriptors).length !== length + 1
  ) {
    return undefined;
  }
  const items: string[] = [];
  for (let index = 0; index < length; index++) {
    const entry = descriptors[String(index)];
    const item: unknown = entry && "value" in entry ? entry.value : undefined;
    if (
      !catalogText(item, 512) ||
      (!catalogUrl(item) && !/^evidence\/[a-z0-9-]+\/[a-z0-9-]+\.(?:txt|json|md)$/u.test(item))
    ) {
      return undefined;
    }
    items.push(item);
  }
  if (new Set(items).size !== items.length) {
    return undefined;
  }
  return Object.freeze(items);
}

export function normalizeRightsRecord(value: unknown): RightsRecord | undefined {
  try {
    const input = catalogRecord(value, KEYS);
    if (
      !input ||
      !catalogIdentifier(input["id"]) ||
      !catalogIdentifier(input["titleId"]) ||
      !catalogVersion(input["revision"]) ||
      !RIGHTS_STATES.some((state) => state === input["status"])
    ) {
      return undefined;
    }
    const text = {} as TextFields;
    for (const field of [...TEXT_FIELDS, ...URL_FIELDS]) {
      const item = input[field];
      if (
        item !== null &&
        !(URL_FIELDS.some((url) => url === field)
          ? catalogUrl(item)
          : catalogText(item, field === "licenseVersion" ? 32 : 1024))
      ) {
        return undefined;
      }
      text[field] = item as string | null;
    }
    const permissions = {} as PermissionFields;
    for (const field of PERMISSION_FIELDS) {
      const item = input[field];
      if (item !== null && typeof item !== "boolean") {
        return undefined;
      }
      permissions[field] = item;
    }
    const restrictions = input["technicalRestrictions"];
    const checksum = input["sourceChecksum"];
    const reviewedAt = input["reviewedAt"];
    const reviewedBy = input["reviewedBy"];
    const validUntil = input["validUntil"];
    const locations = evidenceList(input["evidenceLocations"]);
    if (
      (restrictions !== null && restrictions !== "NONE" && restrictions !== "INCOMPATIBLE") ||
      (checksum !== null && !catalogChecksum(checksum)) ||
      (reviewedAt !== null && !catalogTimestamp(reviewedAt)) ||
      (reviewedBy !== null && !catalogIdentifier(reviewedBy)) ||
      (validUntil !== null && !catalogTimestamp(validUntil)) ||
      !locations
    ) {
      return undefined;
    }
    return Object.freeze({
      ...text,
      ...permissions,
      id: input["id"],
      titleId: input["titleId"],
      revision: input["revision"],
      status: input["status"] as RightsStatus,
      technicalRestrictions: restrictions,
      sourceChecksum: checksum,
      reviewedAt,
      reviewedBy,
      validUntil,
      evidenceLocations: locations,
    });
  } catch {
    return undefined;
  }
}

function completeAndCompatible(
  record: RightsRecord,
  now: number,
  policy: RightsUsePolicy,
): boolean {
  return (
    catalogTimestamp(now) &&
    typeof policy.commercial === "boolean" &&
    [...TEXT_FIELDS, ...URL_FIELDS].every((field) => record[field] !== null) &&
    PERMISSION_FIELDS.every((field) => record[field] !== null) &&
    record.redistributionAllowed === true &&
    record.modificationAllowed === true &&
    (!policy.commercial || record.commercialUseAllowed === true) &&
    // Share-alike delivery needs an explicit derivative-licensing policy before support.
    record.shareAlikeRequired === false &&
    record.technicalRestrictions === "NONE" &&
    record.reviewedBy !== null &&
    record.reviewedAt !== null &&
    record.reviewedAt <= now &&
    (record.validUntil === null || record.validUntil > now) &&
    record.evidenceLocations.length > 0
  );
}

export function approveRights(
  value: unknown,
  now: number,
  policy: RightsUsePolicy,
):
  | Readonly<{ status: "approved"; record: RightsRecord }>
  | Readonly<{ status: "rejected"; code: "INVALID_INPUT" | "RIGHTS_NOT_APPROVED" }> {
  const record = normalizeRightsRecord(value);
  if (!record || !catalogTimestamp(now)) {
    return { status: "rejected", code: "INVALID_INPUT" };
  }
  if (
    !["DRAFT", "NEEDS_CLARIFICATION"].includes(record.status) ||
    !completeAndCompatible(record, now, policy)
  ) {
    return { status: "rejected", code: "RIGHTS_NOT_APPROVED" };
  }
  return { status: "approved", record: Object.freeze({ ...record, status: "APPROVED" }) };
}

export function currentApprovedRights(
  value: unknown,
  now: number,
  policy: RightsUsePolicy,
): RightsRecord | undefined {
  const record = normalizeRightsRecord(value);
  return record?.status === "APPROVED" && completeAndCompatible(record, now, policy)
    ? record
    : undefined;
}

export function deriveAttribution(value: unknown, now: number, policy: RightsUsePolicy) {
  const record = currentApprovedRights(value, now, policy);
  if (!record) {
    return undefined;
  }
  return Object.freeze({
    workTitle: record.workTitle as string,
    creator: record.creator as string,
    copyrightHolder: record.copyrightHolder as string,
    sourceUrl: record.canonicalSourceUrl as string,
    licenseName: record.licenseName as string,
    licenseVersion: record.licenseVersion as string,
    licenseUrl: record.licenseUrl as string,
    attributionText: record.attributionText as string,
    modificationNotice: record.modificationNotice as string,
  });
}
