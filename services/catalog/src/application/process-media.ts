import type { AcquiredOriginal } from "../domain/media-acquisition.js";
import {
  MAX_PROCESSING_ATTEMPTS,
  PROCESSING_LEASE_SECONDS,
  normalizeProcessingAttempt,
  normalizeProcessingCandidate,
  processingFailure,
  processingKeyInput,
  retryableProcessing,
  type ProcessingAttempt,
} from "../domain/media-processing.js";
import {
  MEDIA_RECIPE_VERSION,
  mediaRequestEligible,
  type CatalogMediaRequest,
} from "../domain/media-request.js";
import { catalogIdentifier, catalogTimestamp } from "../domain/values.js";
import type { CatalogCommandRequest } from "./operator-ports.js";
import type { ProcessingPorts, ProcessingTransaction } from "./processing-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

type Source = Readonly<{ media: CatalogMediaRequest; original: AcquiredOriginal }>;
export function createCatalogProcessing(ports: ProcessingPorts) {
  const recipeVersion = ports.recipeVersion ?? MEDIA_RECIPE_VERSION;
  async function authorized<T>(
    id: unknown,
    request: CatalogCommandRequest,
    work: (
      tx: ProcessingTransaction,
      actorId: string,
      id: string,
    ) => Promise<CatalogStoreResult<T>>,
  ): Promise<CatalogStoreResult<T>> {
    if (request.signal.aborted) {
      return { status: "cancelled" };
    }
    const actor = ports.authority.authorize(request.credential, ports.now());
    if (!actor) {
      return { status: "unauthorized" };
    }
    if (
      !catalogIdentifier(id) ||
      !catalogIdentifier(request.correlationId) ||
      !catalogTimestamp(ports.now())
    ) {
      return { status: "invalid_input" };
    }
    return ports.transactions.run(async (tx) => {
      if (!(await tx.lockProcessingSlot())) {
        return { status: "backpressure" };
      }
      const result = await work(tx, actor.id, id);
      if (request.signal.aborted) {
        return { status: "cancelled" };
      }
      if (ports.authority.authorize(request.credential, ports.now())?.id !== actor.id) {
        return { status: "unauthorized" };
      }
      return result;
    }, request.signal);
  }
  async function source(
    tx: ProcessingTransaction,
    acquisitionId: string,
    actorId: string,
  ): Promise<CatalogStoreResult<Source>> {
    const acquisition = await tx.findAcquisition(acquisitionId);
    if (!acquisition) {
      return { status: "not_found" };
    }
    const media = await tx.findMediaRequest(acquisition.requestId);
    if (!media || acquisition.actorId !== actorId || media.actorId !== actorId) {
      return { status: "unauthorized" };
    }
    if (acquisition.status !== "SUCCEEDED" || !acquisition.original) {
      return { status: "invalid_transition" };
    }
    return { status: "completed", value: { media, original: acquisition.original } };
  }
  async function guard(tx: ProcessingTransaction, current: Source) {
    const title = await tx.lockTitle(current.media.input.titleId);
    const rights = title && (await tx.findRights(title.id, null));
    return () =>
      !!title &&
      mediaRequestEligible(
        current.media.input,
        title,
        title.latestRightsRevision,
        rights?.record,
        ports.now(),
        ports.policy,
      );
  }
  async function existing<T>(
    id: unknown,
    request: CatalogCommandRequest,
    work: (
      tx: ProcessingTransaction,
      attempt: ProcessingAttempt,
      current: Source,
    ) => Promise<CatalogStoreResult<T>>,
  ): Promise<CatalogStoreResult<T>> {
    return authorized(id, request, async (tx, actorId, key) => {
      const attempt = await tx.findProcessing(key);
      if (!attempt) {
        return { status: "not_found" };
      }
      if (attempt.actorId !== actorId) {
        return { status: "unauthorized" };
      }
      const current = await source(tx, attempt.acquisitionId, actorId);
      if (current.status !== "completed") {
        return current;
      }
      if (
        current.value.media.input.requestId !== attempt.requestId ||
        current.value.original.sha256 !== attempt.sourceChecksum ||
        attempt.recipeVersion !== recipeVersion ||
        ports.digest(processingKeyInput(attempt.sourceChecksum, recipeVersion)) !==
          attempt.processingKey
      ) {
        return { status: "conflict" };
      }
      return work(tx, attempt, current.value);
    });
  }
  return Object.freeze({
    claim(
      id: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<ProcessingAttempt>> {
      return authorized(id, request, async (tx, actorId, acquisitionId) => {
        const current = await source(tx, acquisitionId, actorId);
        if (current.status !== "completed") {
          return current;
        }
        const eligible = await guard(tx, current.value);
        if (!eligible()) {
          return { status: "rights_not_approved" };
        }
        const processingKey = ports.digest(
          processingKeyInput(current.value.original.sha256, recipeVersion),
        );
        let history = await tx.listProcessing(processingKey);
        let last = history.at(-1);
        // A completed key needs no execution slot, but never inherits old source rights.
        if (last?.status === "SUCCEEDED") {
          return eligible()
            ? { status: "completed", value: last }
            : { status: "rights_not_approved" };
        }
        const running = await tx.runningProcessing();
        if (running && running.expiresAt > ports.now()) {
          return { status: "backpressure" };
        }
        if (running) {
          await tx.finishProcessing({
            ...running,
            status: "FAILED",
            failure: "LEASE_EXPIRED",
            finishedAt: ports.now(),
          });
          history = await tx.listProcessing(processingKey);
          last = history.at(-1);
        }
        if (
          history.length >= MAX_PROCESSING_ATTEMPTS ||
          (last && !retryableProcessing(last.failure))
        ) {
          // Commit retirement of the last exhausted lease instead of leaving it RUNNING.
          return last && last.id === running?.id
            ? { status: "completed", value: last }
            : { status: "invalid_transition" };
        }
        const startedAt = ports.now();
        const attempt = normalizeProcessingAttempt({
          id: ports.nextId(),
          acquisitionId,
          requestId: current.value.media.input.requestId,
          actorId,
          correlationId: request.correlationId,
          processingKey,
          sourceChecksum: current.value.original.sha256,
          recipeVersion,
          number: history.length + 1,
          requestedAt: current.value.media.requestedAt,
          startedAt,
          expiresAt: startedAt + PROCESSING_LEASE_SECONDS,
          finishedAt: null,
          status: "RUNNING",
          failure: null,
          candidate: null,
        });
        if (!attempt) {
          return { status: "invalid_input" };
        }
        await tx.insertProcessing(attempt);
        return eligible()
          ? { status: "completed", value: attempt }
          : { status: "rights_not_approved" };
      });
    },
    check(id: unknown, request: CatalogCommandRequest): Promise<CatalogStoreResult<Source>> {
      return existing(id, request, async (tx, attempt, current) => {
        const eligible = await guard(tx, current);
        if (attempt.status !== "RUNNING" || ports.now() >= attempt.expiresAt) {
          return { status: "conflict" };
        }
        return eligible()
          ? { status: "completed", value: current }
          : { status: "rights_not_approved" };
      });
    },
    complete(
      id: unknown,
      value: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<ProcessingAttempt>> {
      return existing(id, request, async (tx, attempt, current) => {
        const candidate = normalizeProcessingCandidate(value, attempt.processingKey);
        if (!candidate) {
          return { status: "invalid_input" };
        }
        const eligible = await guard(tx, current);
        if (!eligible()) {
          return { status: "rights_not_approved" };
        }
        if (attempt.status === "SUCCEEDED") {
          return JSON.stringify(candidate) === JSON.stringify(attempt.candidate)
            ? { status: "completed", value: attempt }
            : { status: "conflict" };
        }
        if (attempt.status !== "RUNNING" || ports.now() >= attempt.expiresAt) {
          return { status: "conflict" };
        }
        const finished: ProcessingAttempt = {
          ...attempt,
          status: "SUCCEEDED",
          candidate,
          finishedAt: ports.now(),
        };
        await tx.finishProcessing(finished);
        return eligible() && ports.now() < attempt.expiresAt
          ? { status: "completed", value: finished }
          : { status: "conflict" };
      });
    },
    fail(
      id: unknown,
      failure: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<ProcessingAttempt>> {
      if (!processingFailure(failure) || failure === "LEASE_EXPIRED") {
        return Promise.resolve({ status: "invalid_input" });
      }
      return existing(id, request, async (tx, attempt, current) => {
        await tx.lockTitle(current.media.input.titleId);
        if (attempt.status !== "RUNNING" || ports.now() >= attempt.expiresAt) {
          return { status: "conflict" };
        }
        const finished: ProcessingAttempt = {
          ...attempt,
          status: "FAILED",
          failure,
          finishedAt: ports.now(),
        };
        await tx.finishProcessing(finished);
        return { status: "completed", value: finished };
      });
    },
  });
}
