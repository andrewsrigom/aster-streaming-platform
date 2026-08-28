import { createHash } from "node:crypto";
import type { TitleMetadata } from "../src/domain/metadata.js";
import type { RightsRecord } from "../src/domain/rights.js";
import type { ValidatedPublicationReference } from "../src/domain/title.js";
import type {
  CatalogCommandAudit,
  CatalogCommandRequest,
  CatalogCommandReceipt,
  CatalogPublicationEvent,
  CatalogWorkflowTransaction,
  CatalogWorkflowUnitOfWork,
} from "../src/application/operator-ports.js";
import type {
  CatalogRightsRevision,
  RightsProvenance,
  StoredCatalogTitle,
} from "../src/application/rights-ports.js";
import { createCatalogCommands } from "../src/application/commands.js";
import { createLocalCatalogOperator } from "../src/infrastructure/identity/local-operator.js";
import { catalogTestId as id, catalogTestTime as now, rightsFixture } from "./rights-fixture.js";

export const hash = (text: string): string => createHash("sha256").update(text).digest("hex");
export const metadataFixture = (): TitleMetadata => ({
  defaultLocale: "en",
  releaseYear: null,
  runtimeSeconds: null,
  languages: [],
  accessibility: [],
  editorialLabels: [],
  localizations: [{ locale: "en", title: "Synthetic title", synopsis: "Generated test content." }],
  genres: ["animation"],
  credits: [{ name: "Synthetic creator", role: "director" }],
  artwork: null,
});
export function rightsFacts(patch: Partial<RightsRecord> = {}): Record<string, unknown> {
  const record = rightsFixture({
    creator: "Synthetic creator",
    copyrightHolder: "Synthetic owner",
    canonicalSourceUrl: "https://example.invalid/work",
    assetSourceUrl: "https://example.invalid/source.mp4",
    licenseName: "Synthetic test permission",
    licenseVersion: "1.0",
    licenseUrl: "https://example.invalid/license",
    attributionText: "Synthetic creator — test only",
    modificationNotice: "Generated fixture",
    thirdPartyMaterialNotes: "None",
    trademarkNotes: "No marks",
    redistributionAllowed: true,
    commercialUseAllowed: true,
    modificationAllowed: true,
    shareAlikeRequired: false,
    technicalRestrictions: "NONE",
    sourceChecksum: "a".repeat(64),
    evidenceLocations: ["evidence/phase-03/synthetic-review.txt"],
    ...patch,
  });
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => !["id", "titleId", "revision", "status", "reviewedAt", "reviewedBy"].includes(key),
    ),
  );
}
export const publicationFixture = (
  titleId = id(1),
  revision = 2,
): ValidatedPublicationReference => ({
  id: id(200),
  titleId,
  rightsRevision: revision,
  sourceChecksum: "a".repeat(64),
  manifestUrl: "https://example.invalid/media/master.m3u8",
  validationReportId: id(201),
  validatedAt: now,
});
interface State {
  titles: Map<string, StoredCatalogTitle>;
  rights: CatalogRightsRevision[];
  metadata: Map<string, TitleMetadata>;
  publications: Map<string, ValidatedPublicationReference>;
  receipts: CatalogCommandReceipt[];
  audits: CatalogCommandAudit[];
  events: CatalogPublicationEvent[];
  activations: CatalogPublicationEvent[];
}
export function workflowFixture(actorId = id(3)) {
  let state: State = {
    titles: new Map(),
    rights: [],
    metadata: new Map(),
    publications: new Map(),
    receipts: [],
    audits: [],
    events: [],
    activations: [],
  };
  let time = now;
  let sequence = 1000;
  let runs = 0;
  let beforeFinish = (): void => undefined;
  const counts = { receipts: 0, outbox: 0 };
  const operator = createLocalCatalogOperator(
    { environment: "local", operatorEnabled: true, actorId },
    time,
  );
  const transactions: CatalogWorkflowUnitOfWork = {
    async run(work, signal) {
      runs++;
      const draft = structuredClone(state);
      const tx: CatalogWorkflowTransaction = {
        createDraft(titleId) {
          if (draft.titles.has(titleId)) {
            return Promise.resolve(false);
          }
          draft.titles.set(titleId, {
            id: titleId,
            version: 1,
            state: "DRAFT",
            rightsRevision: null,
            publicationId: null,
            latestRightsRevision: 0,
          });
          return Promise.resolve(true);
        },
        lockTitle: (titleId) => Promise.resolve(draft.titles.get(titleId)),
        appendRights(value, version, provenance) {
          const record = value as RightsRecord;
          const title = draft.titles.get(record.titleId);
          if (
            !title ||
            title.version !== version ||
            title.latestRightsRevision + 1 !== record.revision
          ) {
            return Promise.resolve(false);
          }
          draft.titles.set(title.id, {
            ...title,
            version: version + 1,
            latestRightsRevision: record.revision,
          });
          draft.rights.push({
            record,
            titleVersion: version + 1,
            ...(provenance as RightsProvenance),
          });
          return Promise.resolve(true);
        },
        findRights: (titleId, revision) =>
          Promise.resolve(
            draft.rights.findLast(
              (entry) =>
                entry.record.titleId === titleId &&
                (revision === null || entry.record.revision === revision),
            ),
          ),
        listRights: (titleId, before, first) =>
          Promise.resolve(
            draft.rights
              .filter(
                (entry) =>
                  entry.record.titleId === titleId &&
                  (before === null || entry.record.revision < before),
              )
              .toReversed()
              .slice(0, first),
          ),
        findMetadata: (titleId) => Promise.resolve(draft.metadata.get(titleId)),
        saveTitle(title, version, metadata) {
          const stored = draft.titles.get(title.id);
          if (!stored || stored.version !== version) {
            return Promise.resolve(false);
          }
          draft.titles.set(title.id, { ...stored, ...title });
          if (metadata) {
            draft.metadata.set(title.id, metadata);
          }
          return Promise.resolve(true);
        },
        findPublication: (publicationId) => Promise.resolve(draft.publications.get(publicationId)),
        wasPublicationActive: (titleId, publicationId, beforeVersion) =>
          Promise.resolve(
            draft.activations.some(
              (event) =>
                event.aggregate.id === titleId &&
                event.payload.publicationId === publicationId &&
                event.aggregate.version < beforeVersion,
            ),
          ),
        pruneReceipts(titleId, currentTime) {
          draft.receipts = draft.receipts.filter(
            (receipt) => receipt.titleId !== titleId || receipt.expiresAt > currentTime,
          );
          return Promise.resolve();
        },
        findReceipt: (titleId, mutationId) =>
          Promise.resolve(
            draft.receipts.find(
              (receipt) => receipt.titleId === titleId && receipt.mutationId === mutationId,
            ),
          ),
        pendingCounts: (titleId) =>
          Promise.resolve({
            receipts:
              counts.receipts +
              draft.receipts.filter((receipt) => receipt.titleId === titleId).length,
            outbox:
              counts.outbox + draft.events.filter((event) => event.aggregate.id === titleId).length,
          }),
        writeReceipt(receipt) {
          draft.receipts.push(receipt);
          beforeFinish();
          return Promise.resolve();
        },
        appendCommandAudit(audit) {
          draft.audits.push(audit);
          return Promise.resolve();
        },
        appendPublicationEvent(event) {
          draft.events.push(event);
          if (event.eventType === "catalog.title-published") {
            draft.activations.push(event);
          }
          return Promise.resolve();
        },
      };
      try {
        const outcome = await work(tx);
        if (signal.aborted) {
          return { status: "cancelled" };
        }
        if (outcome.status === "completed") {
          state = draft;
        }
        return outcome;
      } catch {
        return { status: "unavailable" };
      }
    },
  };
  const commands = createCatalogCommands({
    authority: operator.authority,
    transactions,
    policy: { commercial: true },
    now: () => time,
    nextId: () => id(sequence++),
    digest: hash,
  });
  const controller: AbortController = new AbortController();
  const request: CatalogCommandRequest = {
    credential: operator.credential,
    correlationId: id(4),
    signal: controller.signal,
  };
  return {
    commands,
    transactions,
    request,
    operator,
    counts,
    controller,
    state: () => state,
    runs: () => runs,
    setTime: (value: number) => {
      time = value;
    },
    beforeFinish: (hook: () => void) => {
      beforeFinish = hook;
    },
  };
}
