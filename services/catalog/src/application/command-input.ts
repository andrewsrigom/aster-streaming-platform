import { normalizeTitleMetadata, type TitleMetadata } from "../domain/metadata.js";
import { draftRightsFromFacts, type RightsRecord } from "../domain/rights.js";
import { catalogIdentifier, catalogRecord, catalogText, catalogVersion } from "../domain/values.js";
import type { CatalogCommandKind } from "./operator-ports.js";

interface CommandBase {
  readonly titleId: string;
  readonly mutationId: string;
  readonly expectedVersion: number;
}
export type CatalogCommand = CommandBase &
  (
    | Readonly<{ kind: "create" | "edit"; metadata: TitleMetadata; rights: RightsRecord }>
    | Readonly<{ kind: "review"; decision: "approve" | "clarify" | "reject"; reason: string }>
    | Readonly<{ kind: "media-ready"; publicationId: string }>
    | Readonly<{ kind: "publish" | "reopen" }>
    | Readonly<{ kind: "retire" | "dispute" | "expire"; reason: string }>
  );
const fields: Readonly<Record<CatalogCommandKind, readonly string[]>> = {
  create: ["metadata", "rights"],
  edit: ["metadata", "rights"],
  review: ["decision", "reason"],
  "media-ready": ["publicationId"],
  publish: [],
  reopen: [],
  retire: ["reason"],
  dispute: ["reason"],
  expire: ["reason"],
};
function editableMetadata(value: unknown, titleId: string): TitleMetadata | undefined {
  const input = catalogRecord(value, [
    "defaultLocale",
    "localizations",
    "genres",
    "credits",
    "artwork",
  ]);
  if (!input) {
    return undefined;
  }
  if (input["artwork"] !== null) {
    const artwork = catalogRecord(input["artwork"], ["url", "altText", "rights"]);
    const rights = artwork ? draftRightsFromFacts(artwork["rights"], titleId) : undefined;
    if (!artwork || !rights) {
      return undefined;
    }
    input["artwork"] = { url: artwork["url"], altText: artwork["altText"], rights };
  }
  return normalizeTitleMetadata(input);
}
export function normalizeCatalogCommand(
  kind: CatalogCommandKind,
  value: unknown,
): CatalogCommand | undefined {
  if (!Object.hasOwn(fields, kind)) {
    return undefined;
  }
  const input = catalogRecord(value, ["titleId", "mutationId", "expectedVersion", ...fields[kind]]);
  if (
    !input ||
    !catalogIdentifier(input["titleId"]) ||
    !catalogIdentifier(input["mutationId"]) ||
    (kind === "create" ? input["expectedVersion"] !== 0 : !catalogVersion(input["expectedVersion"]))
  ) {
    return undefined;
  }
  const base = {
    titleId: input["titleId"],
    mutationId: input["mutationId"],
    expectedVersion: input["expectedVersion"] as number,
  };
  if (kind === "create" || kind === "edit") {
    const metadata = editableMetadata(input["metadata"], base.titleId);
    const rights = draftRightsFromFacts(input["rights"], base.titleId);
    return metadata && rights ? Object.freeze({ ...base, kind, metadata, rights }) : undefined;
  }
  if (kind === "review") {
    const decision = input["decision"];
    if (
      !["approve", "clarify", "reject"].includes(decision as string) ||
      !catalogText(input["reason"], 512)
    ) {
      return undefined;
    }
    return Object.freeze({
      ...base,
      kind,
      decision: decision as "approve" | "clarify" | "reject",
      reason: input["reason"],
    });
  }
  if (kind === "media-ready") {
    return catalogIdentifier(input["publicationId"])
      ? Object.freeze({ ...base, kind, publicationId: input["publicationId"] })
      : undefined;
  }
  if (kind === "publish" || kind === "reopen") {
    return Object.freeze({ ...base, kind });
  }
  return catalogText(input["reason"], 512)
    ? Object.freeze({ ...base, kind, reason: input["reason"] })
    : undefined;
}
