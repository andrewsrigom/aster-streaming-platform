import { artworkPublishable, type TitleMetadata } from "../domain/metadata.js";
import { approveRights, currentApprovedRights, type RightsRecord } from "../domain/rights.js";
import {
  transitionTitle,
  replaceTitlePublication,
  isPublicTitle,
  type CatalogTitleLifecycle,
  type TitleState,
  type ValidatedPublicationReference,
} from "../domain/title.js";
import {
  catalogChecksum,
  catalogIdentifier,
  catalogRecord,
  catalogTimestamp,
  catalogTraceparent,
} from "../domain/values.js";
import { normalizeCatalogCommand, type CatalogCommand } from "./command-input.js";
import type {
  CatalogCommandKind,
  CatalogCommandRequest,
  CatalogCommandResult,
  CatalogOperator,
  CatalogOperatorPorts,
  CatalogWorkflowTransaction,
} from "./operator-ports.js";
import type { CatalogStoreResult, StoredCatalogTitle } from "./rights-ports.js";

type Change = Readonly<{
  title: CatalogTitleLifecycle;
  rights?: RightsRecord;
  metadata?: TitleMetadata;
}>;
type Outcome = CatalogStoreResult<CatalogCommandResult>;
const retirement = (kind: CatalogCommandKind): boolean =>
  ["retire", "dispute", "expire"].includes(kind);
const publishing = (kind: CatalogCommandKind): boolean =>
  ["publish", "replace", "rollback"].includes(kind);
const eventTrace = (ports: CatalogOperatorPorts): Readonly<{ traceparent?: string }> => {
  try {
    const traceparent = ports.traceContext?.()?.traceparent;
    return Object.freeze(catalogTraceparent(traceparent) ? { traceparent } : {});
  } catch {
    return Object.freeze({});
  }
};
const lifecycle = (title: StoredCatalogTitle): CatalogTitleLifecycle => ({
  id: title.id,
  version: title.version,
  state: title.state,
  rightsRevision: title.rightsRevision,
  publicationId: title.publicationId,
});

function transition(
  title: CatalogTitleLifecycle,
  target: TitleState,
  rights: RightsRecord | undefined,
  publication: ValidatedPublicationReference | undefined,
  now: number,
  ports: CatalogOperatorPorts,
): CatalogStoreResult<Change> {
  const result = transitionTitle(title, target, { rights, publication, now, policy: ports.policy });
  if (result.status === "completed") {
    return { status: "completed", value: { title: result.title } };
  }
  const codes = {
    INVALID_INPUT: "invalid_input",
    INVALID_TRANSITION: "invalid_transition",
    RIGHTS_NOT_APPROVED: "rights_not_approved",
    MEDIA_NOT_READY: "media_not_ready",
  } as const;
  return { status: codes[result.code] };
}

function reviewedMetadata(
  metadata: TitleMetadata,
  decision: "approve" | "clarify" | "reject",
  actor: CatalogOperator,
  now: number,
  ports: CatalogOperatorPorts,
): TitleMetadata | undefined {
  if (metadata.artwork === null) {
    return metadata;
  }
  const reviewed = {
    ...metadata.artwork.rights,
    id: ports.nextId(),
    reviewedBy: actor.id,
    reviewedAt: now,
  };
  const approved = decision === "approve" ? approveRights(reviewed, now, ports.policy) : undefined;
  if (decision === "approve" && approved?.status !== "approved") {
    return undefined;
  }
  const rights: RightsRecord =
    approved?.status === "approved"
      ? approved.record
      : {
          ...reviewed,
          status: decision === "clarify" ? "NEEDS_CLARIFICATION" : "REJECTED",
        };
  return { ...metadata, artwork: { ...metadata.artwork, rights } };
}

async function planChange(
  command: CatalogCommand,
  stored: StoredCatalogTitle,
  tx: CatalogWorkflowTransaction,
  actor: CatalogOperator,
  now: number,
  ports: CatalogOperatorPorts,
): Promise<CatalogStoreResult<Change>> {
  const title = lifecycle(stored);
  if (title.version === 2_147_483_647) {
    return { status: "invalid_input" };
  }
  if (command.kind === "create" || command.kind === "edit") {
    if (title.state !== "DRAFT") {
      return { status: "invalid_transition" };
    }
    const rights = {
      ...command.rights,
      id: ports.nextId(),
      revision: stored.latestRightsRevision + 1,
    };
    const metadata =
      command.metadata.artwork === null
        ? command.metadata
        : {
            ...command.metadata,
            artwork: {
              ...command.metadata.artwork,
              rights: {
                ...command.metadata.artwork.rights,
                id: ports.nextId(),
                revision: rights.revision,
              },
            },
          };
    return {
      status: "completed",
      value: { title: { ...title, version: title.version + 1 }, rights, metadata },
    };
  }
  if (command.kind === "reopen" || command.kind === "retire") {
    return transition(
      title,
      command.kind === "reopen" ? "DRAFT" : "RETIRED",
      undefined,
      undefined,
      now,
      ports,
    );
  }
  const latest = (await tx.findRights(title.id, null))?.record;
  if (!latest || latest.revision !== stored.latestRightsRevision) {
    return { status: "rights_not_approved" };
  }
  if (command.kind === "dispute" || command.kind === "expire") {
    if (command.kind === "expire" && (latest.validUntil === null || latest.validUntil > now)) {
      return { status: "invalid_transition" };
    }
    const result = transition(title, "RETIRED", undefined, undefined, now, ports);
    if (result.status !== "completed") {
      return result;
    }
    return {
      status: "completed",
      value: {
        ...result.value,
        rights: {
          ...latest,
          id: ports.nextId(),
          revision: latest.revision + 1,
          status: command.kind === "dispute" ? "DISPUTED" : "EXPIRED",
          reviewedAt: now,
          reviewedBy: actor.id,
        },
      },
    };
  }
  const metadata = await tx.findMetadata(title.id);
  if (!metadata) {
    return { status: "invalid_input" };
  }
  if (command.kind === "review") {
    if (title.state !== "DRAFT" || !["DRAFT", "NEEDS_CLARIFICATION"].includes(latest.status)) {
      return { status: "invalid_transition" };
    }
    const candidate = {
      ...latest,
      id: ports.nextId(),
      revision: latest.revision + 1,
      reviewedBy: actor.id,
      reviewedAt: now,
    };
    const updatedMetadata = reviewedMetadata(metadata, command.decision, actor, now, ports);
    if (!updatedMetadata) {
      return { status: "rights_not_approved" };
    }
    if (command.decision !== "approve") {
      return {
        status: "completed",
        value: {
          title: { ...title, version: title.version + 1 },
          metadata: updatedMetadata,
          rights: {
            ...candidate,
            status: command.decision === "clarify" ? "NEEDS_CLARIFICATION" : "REJECTED",
          },
        },
      };
    }
    const approved = approveRights(candidate, now, ports.policy);
    if (
      approved.status !== "approved" ||
      !artworkPublishable(updatedMetadata, title.id, now, ports.policy)
    ) {
      return { status: "rights_not_approved" };
    }
    const result = transition(title, "RIGHTS_REVIEWED", approved.record, undefined, now, ports);
    return result.status === "completed"
      ? {
          status: "completed",
          value: { ...result.value, rights: approved.record, metadata: updatedMetadata },
        }
      : result;
  }
  if (
    !currentApprovedRights(latest, now, ports.policy) ||
    !artworkPublishable(metadata, title.id, now, ports.policy)
  ) {
    return { status: "rights_not_approved" };
  }
  const publicationId = "publicationId" in command ? command.publicationId : title.publicationId;
  const publication = publicationId === null ? undefined : await tx.findPublication(publicationId);
  if (command.kind === "replace" || command.kind === "rollback") {
    const currentPublication =
      title.publicationId === null ? undefined : await tx.findPublication(title.publicationId);
    const result = replaceTitlePublication(title, {
      rights: latest,
      currentPublication,
      publication,
      now,
      policy: ports.policy,
    });
    if (result.status === "rejected") {
      const codes = {
        INVALID_INPUT: "invalid_input",
        INVALID_TRANSITION: "invalid_transition",
        RIGHTS_NOT_APPROVED: "rights_not_approved",
        MEDIA_NOT_READY: "media_not_ready",
      } as const;
      return { status: codes[result.code] };
    }
    if (
      command.kind === "rollback" &&
      !(await tx.wasPublicationActive(title.id, command.publicationId, title.version))
    ) {
      return { status: "media_not_ready" };
    }
    return { status: "completed", value: { title: result.title } };
  }
  return transition(
    title,
    command.kind === "media-ready" ? "MEDIA_READY" : "PUBLISHED",
    latest,
    publication,
    now,
    ports,
  );
}

export function createCatalogCommands(ports: CatalogOperatorPorts) {
  async function execute(
    tx: CatalogWorkflowTransaction,
    command: CatalogCommand,
    digest: string,
    actor: CatalogOperator,
    request: CatalogCommandRequest,
    legacyDigest: string | undefined,
  ): Promise<Outcome> {
    const created = command.kind === "create" ? await tx.createDraft(command.titleId) : false;
    const title = await tx.lockTitle(command.titleId);
    if (!title) {
      return { status: "not_found" };
    }
    const now = ports.now();
    if (!catalogTimestamp(now) || now > 253_402_214_399) {
      return { status: "invalid_input" };
    }
    if (ports.authority.authorize(request.credential, now)?.id !== actor.id) {
      return { status: "unauthorized" };
    }
    await tx.pruneReceipts(title.id, now);
    const receipt = await tx.findReceipt(title.id, command.mutationId);
    if (receipt) {
      return receipt.actorId === actor.id &&
        (receipt.digest === digest || receipt.digest === legacyDigest) &&
        receipt.expiresAt > now
        ? { status: "completed", value: receipt.result }
        : { status: "conflict" };
    }
    if (
      (command.kind === "create" && !created) ||
      (command.kind !== "create" && title.version !== command.expectedVersion)
    ) {
      return { status: "conflict" };
    }
    const pending = await tx.pendingCounts(title.id);
    // Both resources reserve the final slot; a full replay cache must not prevent takedown.
    if (
      pending.receipts >= (retirement(command.kind) ? 64 : 63) ||
      pending.outbox >= (retirement(command.kind) ? 128 : 127)
    ) {
      return { status: "backpressure" };
    }
    const change = await planChange(command, title, tx, actor, now, ports);
    if (change.status !== "completed") {
      return change;
    }
    const next = change.value;
    if (
      next.rights &&
      !(await tx.appendRights(next.rights, title.version, {
        actorId: actor.id,
        recordedAt: now,
        correlationId: request.correlationId,
      }))
    ) {
      return { status: "conflict" };
    }
    if (
      !(await tx.saveTitle(
        next.title,
        next.rights ? title.version + 1 : title.version,
        next.metadata,
      ))
    ) {
      return { status: "conflict" };
    }
    const value = Object.freeze({
      titleId: title.id,
      version: next.title.version,
      state: next.title.state,
      rightsRevision: next.title.rightsRevision,
      publicationId: next.title.publicationId,
    });
    await tx.appendCommandAudit({
      id: ports.nextId(),
      kind: command.kind,
      actorId: actor.id,
      titleId: title.id,
      version: next.title.version,
      occurredAt: now,
      correlationId: request.correlationId,
      mutationId: command.mutationId,
      reason: "reason" in command ? command.reason : null,
      metadata: next.metadata ?? null,
    });
    if (publishing(command.kind) || retirement(command.kind)) {
      await tx.appendPublicationEvent({
        eventId: ports.nextId(),
        eventType: publishing(command.kind) ? "catalog.title-published" : "catalog.title-retired",
        schemaVersion: 1,
        occurredAt: new Date(now * 1000).toISOString(),
        producer: "catalog",
        aggregate: { type: "Title", id: title.id, version: next.title.version },
        correlationId: request.correlationId,
        causationId: command.mutationId,
        trace: eventTrace(ports),
        payload: {
          titleId: title.id,
          publicationId: next.title.publicationId,
          rightsRevision: next.rights?.revision ?? next.title.rightsRevision,
        },
      });
    }
    await tx.writeReceipt({
      titleId: title.id,
      mutationId: command.mutationId,
      actorId: actor.id,
      digest,
      expiresAt: now + 86400,
      result: value,
    });
    if (publishing(command.kind)) {
      const rights = (await tx.findRights(title.id, null))?.record;
      const metadata = await tx.findMetadata(title.id);
      const publication =
        next.title.publicationId === null
          ? undefined
          : await tx.findPublication(next.title.publicationId);
      const checkedAt = ports.now();
      if (
        !metadata ||
        !artworkPublishable(metadata, title.id, checkedAt, ports.policy) ||
        !isPublicTitle(next.title, rights, publication, checkedAt, ports.policy)
      ) {
        return { status: "rights_not_approved" };
      }
    }
    return { status: "completed", value };
  }
  return Object.freeze({
    async inspect(
      input: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<StoredCatalogTitle>> {
      if (request.signal.aborted) {
        return { status: "cancelled" };
      }
      const actor = ports.authority.authorize(request.credential, ports.now());
      if (!actor) {
        return { status: "unauthorized" };
      }
      const value = catalogRecord(input, ["titleId"]);
      if (
        !value ||
        !catalogIdentifier(value["titleId"]) ||
        !catalogIdentifier(request.correlationId)
      ) {
        return { status: "invalid_input" };
      }
      const titleId = value["titleId"];
      return ports.transactions.run(async (tx) => {
        const title = await tx.lockTitle(titleId);
        if (ports.authority.authorize(request.credential, ports.now())?.id !== actor.id) {
          return { status: "unauthorized" };
        }
        return title ? { status: "completed", value: title } : { status: "not_found" };
      }, request.signal);
    },
    async execute(
      kind: CatalogCommandKind,
      input: unknown,
      request: CatalogCommandRequest,
    ): Promise<Outcome> {
      if (request.signal.aborted) {
        return { status: "cancelled" };
      }
      const actor = ports.authority.authorize(request.credential, ports.now());
      if (!actor) {
        return { status: "unauthorized" };
      }
      const command = normalizeCatalogCommand(kind, input);
      if (!command || !catalogIdentifier(request.correlationId)) {
        return { status: "invalid_input" };
      }
      const digest = ports.digest(JSON.stringify(command));
      let legacyDigest: string | undefined;
      if (
        (command.kind === "create" || command.kind === "edit") &&
        command.metadata.releaseYear === null &&
        command.metadata.runtimeSeconds === null &&
        command.metadata.languages.length === 0 &&
        command.metadata.accessibility.length === 0 &&
        command.metadata.editorialLabels.length === 0
      ) {
        // Preserve the 24-hour replay window across the additive metadata rollout.
        const metadata = Object.fromEntries(
          Object.entries(command.metadata).filter(([key]) =>
            ["defaultLocale", "localizations", "genres", "credits", "artwork"].includes(key),
          ),
        );
        legacyDigest = ports.digest(JSON.stringify({ ...command, metadata }));
      }
      if (
        !catalogChecksum(digest) ||
        (legacyDigest !== undefined && !catalogChecksum(legacyDigest))
      ) {
        return { status: "invalid_input" };
      }
      return ports.transactions.run(async (tx) => {
        const result = await execute(tx, command, digest, actor, request, legacyDigest);
        if (request.signal.aborted) {
          return { status: "cancelled" };
        }
        if (ports.authority.authorize(request.credential, ports.now())?.id !== actor.id) {
          return { status: "unauthorized" };
        }
        return result;
      }, request.signal);
    },
  });
}
