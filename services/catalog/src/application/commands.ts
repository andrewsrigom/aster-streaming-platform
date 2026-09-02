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

type CatalogCommandChange = Readonly<{
  title: CatalogTitleLifecycle;
  rights?: RightsRecord;
  metadata?: TitleMetadata;
}>;
type CatalogCommandOutcome = CatalogStoreResult<CatalogCommandResult>;
type DraftContentCommand = CatalogCommand & { readonly kind: "create" | "edit" };
type RightsWithdrawalCommand = CatalogCommand & { readonly kind: "dispute" | "expire" };
type RightsReviewCommand = CatalogCommand & { readonly kind: "review" };
type PublicationCommand = CatalogCommand & {
  readonly kind: "media-ready" | "publish" | "replace" | "rollback";
};

const retiresTitle = (kind: CatalogCommandKind): boolean =>
  ["retire", "dispute", "expire"].includes(kind);
const activatesTitlePublication = (kind: CatalogCommandKind): boolean =>
  ["publish", "replace", "rollback"].includes(kind);
const changesDraftContent = (command: CatalogCommand): command is DraftContentCommand =>
  command.kind === "create" || command.kind === "edit";
const withdrawsRights = (command: CatalogCommand): command is RightsWithdrawalCommand =>
  command.kind === "dispute" || command.kind === "expire";
const reviewsRights = (command: CatalogCommand): command is RightsReviewCommand =>
  command.kind === "review";
const changesPublication = (command: CatalogCommand): command is PublicationCommand =>
  ["media-ready", "publish", "replace", "rollback"].includes(command.kind);
const publicationEventTrace = (ports: CatalogOperatorPorts): Readonly<{ traceparent?: string }> => {
  try {
    const traceparent = ports.traceContext?.()?.traceparent;
    return Object.freeze(catalogTraceparent(traceparent) ? { traceparent } : {});
  } catch {
    return Object.freeze({});
  }
};
const toTitleLifecycle = (title: StoredCatalogTitle): CatalogTitleLifecycle => ({
  id: title.id,
  version: title.version,
  state: title.state,
  rightsRevision: title.rightsRevision,
  publicationId: title.publicationId,
});

function applyTitleTransition(
  title: CatalogTitleLifecycle,
  target: TitleState,
  rights: RightsRecord | undefined,
  publication: ValidatedPublicationReference | undefined,
  now: number,
  ports: CatalogOperatorPorts,
): CatalogStoreResult<CatalogCommandChange> {
  const transitionResult = transitionTitle(title, target, {
    rights,
    publication,
    now,
    policy: ports.policy,
  });
  if (transitionResult.status === "completed") {
    return { status: "completed", value: { title: transitionResult.title } };
  }
  const codes = {
    INVALID_INPUT: "invalid_input",
    INVALID_TRANSITION: "invalid_transition",
    RIGHTS_NOT_APPROVED: "rights_not_approved",
    MEDIA_NOT_READY: "media_not_ready",
  } as const;
  return { status: codes[transitionResult.code] };
}

function applyArtworkRightsReview(
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

function prepareDraftContentChange(
  command: DraftContentCommand,
  storedTitle: StoredCatalogTitle,
  title: CatalogTitleLifecycle,
  ports: CatalogOperatorPorts,
): CatalogStoreResult<CatalogCommandChange> {
  if (title.state !== "DRAFT") {
    return { status: "invalid_transition" };
  }

  const rights = {
    ...command.rights,
    id: ports.nextId(),
    revision: storedTitle.latestRightsRevision + 1,
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

function prepareRightsWithdrawal(
  command: RightsWithdrawalCommand,
  title: CatalogTitleLifecycle,
  latestRights: RightsRecord,
  actor: CatalogOperator,
  now: number,
  ports: CatalogOperatorPorts,
): CatalogStoreResult<CatalogCommandChange> {
  if (
    command.kind === "expire" &&
    (latestRights.validUntil === null || latestRights.validUntil > now)
  ) {
    return { status: "invalid_transition" };
  }

  const titleRetirement = applyTitleTransition(title, "RETIRED", undefined, undefined, now, ports);
  if (titleRetirement.status !== "completed") {
    return titleRetirement;
  }

  return {
    status: "completed",
    value: {
      ...titleRetirement.value,
      rights: {
        ...latestRights,
        id: ports.nextId(),
        revision: latestRights.revision + 1,
        status: command.kind === "dispute" ? "DISPUTED" : "EXPIRED",
        reviewedAt: now,
        reviewedBy: actor.id,
      },
    },
  };
}

function prepareRightsReview(
  command: RightsReviewCommand,
  title: CatalogTitleLifecycle,
  latestRights: RightsRecord,
  metadata: TitleMetadata,
  actor: CatalogOperator,
  now: number,
  ports: CatalogOperatorPorts,
): CatalogStoreResult<CatalogCommandChange> {
  if (title.state !== "DRAFT" || !["DRAFT", "NEEDS_CLARIFICATION"].includes(latestRights.status)) {
    return { status: "invalid_transition" };
  }

  const reviewCandidate = {
    ...latestRights,
    id: ports.nextId(),
    revision: latestRights.revision + 1,
    reviewedBy: actor.id,
    reviewedAt: now,
  };
  const reviewedMetadata = applyArtworkRightsReview(metadata, command.decision, actor, now, ports);
  if (!reviewedMetadata) {
    return { status: "rights_not_approved" };
  }

  if (command.decision !== "approve") {
    return {
      status: "completed",
      value: {
        title: { ...title, version: title.version + 1 },
        metadata: reviewedMetadata,
        rights: {
          ...reviewCandidate,
          status: command.decision === "clarify" ? "NEEDS_CLARIFICATION" : "REJECTED",
        },
      },
    };
  }

  const approvedRights = approveRights(reviewCandidate, now, ports.policy);
  if (
    approvedRights.status !== "approved" ||
    !artworkPublishable(reviewedMetadata, title.id, now, ports.policy)
  ) {
    return { status: "rights_not_approved" };
  }

  const rightsReviewed = applyTitleTransition(
    title,
    "RIGHTS_REVIEWED",
    approvedRights.record,
    undefined,
    now,
    ports,
  );
  return rightsReviewed.status === "completed"
    ? {
        status: "completed",
        value: {
          ...rightsReviewed.value,
          rights: approvedRights.record,
          metadata: reviewedMetadata,
        },
      }
    : rightsReviewed;
}

async function preparePublicationChange(
  command: PublicationCommand,
  title: CatalogTitleLifecycle,
  latestRights: RightsRecord,
  metadata: TitleMetadata,
  tx: CatalogWorkflowTransaction,
  now: number,
  ports: CatalogOperatorPorts,
): Promise<CatalogStoreResult<CatalogCommandChange>> {
  if (
    !currentApprovedRights(latestRights, now, ports.policy) ||
    !artworkPublishable(metadata, title.id, now, ports.policy)
  ) {
    return { status: "rights_not_approved" };
  }

  const requestedPublicationId =
    "publicationId" in command ? command.publicationId : title.publicationId;
  const requestedPublication =
    requestedPublicationId === null ? undefined : await tx.findPublication(requestedPublicationId);

  if (command.kind === "replace" || command.kind === "rollback") {
    const activePublication =
      title.publicationId === null ? undefined : await tx.findPublication(title.publicationId);
    const replacement = replaceTitlePublication(title, {
      rights: latestRights,
      currentPublication: activePublication,
      publication: requestedPublication,
      now,
      policy: ports.policy,
    });
    if (replacement.status === "rejected") {
      const codes = {
        INVALID_INPUT: "invalid_input",
        INVALID_TRANSITION: "invalid_transition",
        RIGHTS_NOT_APPROVED: "rights_not_approved",
        MEDIA_NOT_READY: "media_not_ready",
      } as const;
      return { status: codes[replacement.code] };
    }
    if (
      command.kind === "rollback" &&
      !(await tx.wasPublicationActive(title.id, command.publicationId, title.version))
    ) {
      return { status: "media_not_ready" };
    }
    return { status: "completed", value: { title: replacement.title } };
  }

  return applyTitleTransition(
    title,
    command.kind === "media-ready" ? "MEDIA_READY" : "PUBLISHED",
    latestRights,
    requestedPublication,
    now,
    ports,
  );
}

async function decideCatalogCommandChange(
  command: CatalogCommand,
  storedTitle: StoredCatalogTitle,
  tx: CatalogWorkflowTransaction,
  actor: CatalogOperator,
  now: number,
  ports: CatalogOperatorPorts,
): Promise<CatalogStoreResult<CatalogCommandChange>> {
  const title = toTitleLifecycle(storedTitle);
  if (title.version === 2_147_483_647) {
    return { status: "invalid_input" };
  }

  if (changesDraftContent(command)) {
    return prepareDraftContentChange(command, storedTitle, title, ports);
  }

  if (command.kind === "reopen" || command.kind === "retire") {
    return applyTitleTransition(
      title,
      command.kind === "reopen" ? "DRAFT" : "RETIRED",
      undefined,
      undefined,
      now,
      ports,
    );
  }

  const latestRights = (await tx.findRights(title.id, null))?.record;
  if (!latestRights || latestRights.revision !== storedTitle.latestRightsRevision) {
    return { status: "rights_not_approved" };
  }

  if (withdrawsRights(command)) {
    return prepareRightsWithdrawal(command, title, latestRights, actor, now, ports);
  }

  const metadata = await tx.findMetadata(title.id);
  if (!metadata) {
    return { status: "invalid_input" };
  }

  if (reviewsRights(command)) {
    return prepareRightsReview(command, title, latestRights, metadata, actor, now, ports);
  }

  return changesPublication(command)
    ? preparePublicationChange(command, title, latestRights, metadata, tx, now, ports)
    : { status: "invalid_input" };
}

export function createCatalogCommands(ports: CatalogOperatorPorts) {
  async function executeCatalogCommandTransaction(
    tx: CatalogWorkflowTransaction,
    command: CatalogCommand,
    digest: string,
    actor: CatalogOperator,
    request: CatalogCommandRequest,
    legacyDigest: string | undefined,
  ): Promise<CatalogCommandOutcome> {
    const draftCreated = command.kind === "create" ? await tx.createDraft(command.titleId) : false;
    const lockedTitle = await tx.lockTitle(command.titleId);
    if (!lockedTitle) {
      return { status: "not_found" };
    }

    const now = ports.now();
    if (!catalogTimestamp(now) || now > 253_402_214_399) {
      return { status: "invalid_input" };
    }
    if (ports.authority.authorize(request.credential, now)?.id !== actor.id) {
      return { status: "unauthorized" };
    }

    await tx.pruneReceipts(lockedTitle.id, now);
    const existingReceipt = await tx.findReceipt(lockedTitle.id, command.mutationId);
    if (existingReceipt) {
      return existingReceipt.actorId === actor.id &&
        (existingReceipt.digest === digest || existingReceipt.digest === legacyDigest) &&
        existingReceipt.expiresAt > now
        ? { status: "completed", value: existingReceipt.result }
        : { status: "conflict" };
    }

    if (
      (command.kind === "create" && !draftCreated) ||
      (command.kind !== "create" && lockedTitle.version !== command.expectedVersion)
    ) {
      return { status: "conflict" };
    }

    const pendingWrites = await tx.pendingCounts(lockedTitle.id);
    // Both resources reserve the final slot; a full replay cache must not prevent takedown.
    if (
      pendingWrites.receipts >= (retiresTitle(command.kind) ? 64 : 63) ||
      pendingWrites.outbox >= (retiresTitle(command.kind) ? 128 : 127)
    ) {
      return { status: "backpressure" };
    }

    const commandChange = await decideCatalogCommandChange(
      command,
      lockedTitle,
      tx,
      actor,
      now,
      ports,
    );
    if (commandChange.status !== "completed") {
      return commandChange;
    }
    const nextState = commandChange.value;

    if (
      nextState.rights &&
      !(await tx.appendRights(nextState.rights, lockedTitle.version, {
        actorId: actor.id,
        recordedAt: now,
        correlationId: request.correlationId,
      }))
    ) {
      return { status: "conflict" };
    }
    if (
      !(await tx.saveTitle(
        nextState.title,
        nextState.rights ? lockedTitle.version + 1 : lockedTitle.version,
        nextState.metadata,
      ))
    ) {
      return { status: "conflict" };
    }

    const commandResult = Object.freeze({
      titleId: lockedTitle.id,
      version: nextState.title.version,
      state: nextState.title.state,
      rightsRevision: nextState.title.rightsRevision,
      publicationId: nextState.title.publicationId,
    });
    await tx.appendCommandAudit({
      id: ports.nextId(),
      kind: command.kind,
      actorId: actor.id,
      titleId: lockedTitle.id,
      version: nextState.title.version,
      occurredAt: now,
      correlationId: request.correlationId,
      mutationId: command.mutationId,
      reason: "reason" in command ? command.reason : null,
      metadata: nextState.metadata ?? null,
    });
    if (activatesTitlePublication(command.kind) || retiresTitle(command.kind)) {
      await tx.appendPublicationEvent({
        eventId: ports.nextId(),
        eventType: activatesTitlePublication(command.kind)
          ? "catalog.title-published"
          : "catalog.title-retired",
        schemaVersion: 1,
        occurredAt: new Date(now * 1000).toISOString(),
        producer: "catalog",
        aggregate: { type: "Title", id: lockedTitle.id, version: nextState.title.version },
        correlationId: request.correlationId,
        causationId: command.mutationId,
        trace: publicationEventTrace(ports),
        payload: {
          titleId: lockedTitle.id,
          publicationId: nextState.title.publicationId,
          rightsRevision: nextState.rights?.revision ?? nextState.title.rightsRevision,
        },
      });
    }
    await tx.writeReceipt({
      titleId: lockedTitle.id,
      mutationId: command.mutationId,
      actorId: actor.id,
      digest,
      expiresAt: now + 86400,
      result: commandResult,
    });

    if (activatesTitlePublication(command.kind)) {
      const latestRights = (await tx.findRights(lockedTitle.id, null))?.record;
      const storedMetadata = await tx.findMetadata(lockedTitle.id);
      const activePublication =
        nextState.title.publicationId === null
          ? undefined
          : await tx.findPublication(nextState.title.publicationId);
      const revalidatedAt = ports.now();
      if (
        !storedMetadata ||
        !artworkPublishable(storedMetadata, lockedTitle.id, revalidatedAt, ports.policy) ||
        !isPublicTitle(
          nextState.title,
          latestRights,
          activePublication,
          revalidatedAt,
          ports.policy,
        )
      ) {
        return { status: "rights_not_approved" };
      }
    }

    return { status: "completed", value: commandResult };
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
      const inputRecord = catalogRecord(input, ["titleId"]);
      if (
        !inputRecord ||
        !catalogIdentifier(inputRecord["titleId"]) ||
        !catalogIdentifier(request.correlationId)
      ) {
        return { status: "invalid_input" };
      }
      const titleId = inputRecord["titleId"];
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
    ): Promise<CatalogCommandOutcome> {
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
        const commandOutcome = await executeCatalogCommandTransaction(
          tx,
          command,
          digest,
          actor,
          request,
          legacyDigest,
        );
        if (request.signal.aborted) {
          return { status: "cancelled" };
        }
        if (ports.authority.authorize(request.credential, ports.now())?.id !== actor.id) {
          return { status: "unauthorized" };
        }
        return commandOutcome;
      }, request.signal);
    },
  });
}
