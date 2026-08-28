import {
  ACQUISITION_LEASE_SECONDS,
  MAX_ACQUISITION_ATTEMPTS,
  acquisitionFailure,
  normalizeAcquisitionAttempt,
  normalizeOriginal,
  retryableAcquisition,
  type AcquiredOriginal,
  type AcquisitionAttempt,
} from "../domain/media-acquisition.js";
import { mediaRequestEligible, type CatalogMediaRequest } from "../domain/media-request.js";
import { catalogIdentifier, catalogTimestamp } from "../domain/values.js";
import type {
  AcquisitionApproval,
  AcquisitionPorts,
  AcquisitionTransaction,
} from "./acquisition-ports.js";
import type { CatalogCommandRequest } from "./operator-ports.js";
import type { CatalogStoreResult } from "./rights-ports.js";

export function createCatalogAcquisitions(ports: AcquisitionPorts) {
  async function authorized<T>(
    request: CatalogCommandRequest,
    work: (tx: AcquisitionTransaction, actorId: string) => Promise<CatalogStoreResult<T>>,
  ): Promise<CatalogStoreResult<T>> {
    if (request.signal.aborted) {
      return { status: "cancelled" };
    }
    const actor = ports.authority.authorize(request.credential, ports.now());
    if (!actor) {
      return { status: "unauthorized" };
    }
    if (!catalogTimestamp(ports.now()) || !catalogIdentifier(request.correlationId)) {
      return { status: "invalid_input" };
    }
    return ports.transactions.run(async (tx) => {
      // All acquisition mutations take this slot before a title lock; never hold it during I/O.
      if (!(await tx.lockAcquisitionSlot())) {
        return { status: "backpressure" };
      }
      const result = await work(tx, actor.id);
      if (request.signal.aborted) {
        return { status: "cancelled" };
      }
      if (ports.authority.authorize(request.credential, ports.now())?.id !== actor.id) {
        return { status: "unauthorized" };
      }
      return result;
    }, request.signal);
  }
  async function rightsGuard(tx: AcquisitionTransaction, media: CatalogMediaRequest) {
    const title = await tx.lockTitle(media.input.titleId);
    const rights = title && (await tx.findRights(title.id, null));
    const eligible = () =>
      !!title &&
      mediaRequestEligible(
        media.input,
        title,
        title.latestRightsRevision,
        rights?.record,
        ports.now(),
        ports.policy,
      );
    return {
      eligible,
      reuseApproved:
        rights !== undefined &&
        rights.record.sourceChecksum !== null &&
        rights.record.sourceChecksum === media.input.source.sha256,
    };
  }
  async function existing<T>(
    id: unknown,
    request: CatalogCommandRequest,
    work: (
      tx: AcquisitionTransaction,
      attempt: AcquisitionAttempt,
      media: CatalogMediaRequest,
    ) => Promise<CatalogStoreResult<T>>,
  ): Promise<CatalogStoreResult<T>> {
    if (!catalogIdentifier(id)) {
      return { status: "invalid_input" };
    }
    return authorized(request, async (tx, actorId) => {
      const attempt = await tx.findAcquisition(id);
      if (!attempt) {
        return { status: "not_found" };
      }
      const media = await tx.findMediaRequest(attempt.requestId);
      if (!media || attempt.actorId !== actorId || media.actorId !== actorId) {
        return { status: "unauthorized" };
      }
      return work(tx, attempt, media);
    });
  }
  return Object.freeze({
    original(
      id: unknown,
      request: CatalogCommandRequest,
    ): Promise<
      CatalogStoreResult<Readonly<{ media: CatalogMediaRequest; original: AcquiredOriginal }>>
    > {
      return existing(id, request, async (tx, attempt, media) => {
        const { eligible } = await rightsGuard(tx, media);
        if (!eligible()) {
          return { status: "rights_not_approved" };
        }
        if (attempt.status !== "SUCCEEDED" || !attempt.original) {
          return { status: "invalid_transition" };
        }
        return { status: "completed", value: { media, original: attempt.original } };
      });
    },
    claim(
      id: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<AcquisitionAttempt>> {
      if (!catalogIdentifier(id)) {
        return Promise.resolve({ status: "invalid_input" });
      }
      return authorized(request, async (tx, actorId) => {
        const media = await tx.findMediaRequest(id);
        if (!media) {
          return { status: "not_found" };
        }
        if (media.actorId !== actorId) {
          return { status: "unauthorized" };
        }
        const { eligible } = await rightsGuard(tx, media);
        if (!eligible()) {
          return { status: "rights_not_approved" };
        }
        const running = await tx.runningAcquisition();
        if (running && running.expiresAt > ports.now()) {
          return { status: "backpressure" };
        }
        if (running) {
          await tx.finishAcquisition({
            ...running,
            status: "FAILED",
            failure: "LEASE_EXPIRED",
            finishedAt: ports.now(),
          });
        }
        const history = await tx.listAcquisitions(id);
        const last = history.at(-1);
        if (last?.status === "SUCCEEDED") {
          return eligible()
            ? { status: "completed", value: last }
            : { status: "rights_not_approved" };
        }
        if (
          history.length >= MAX_ACQUISITION_ATTEMPTS ||
          (last && !retryableAcquisition(last.failure))
        ) {
          // Commit retirement of this exhausted lease even though no new attempt is admitted.
          if (last?.id === running?.id && last?.status === "FAILED") {
            return { status: "completed", value: last };
          }
          return { status: "invalid_transition" };
        }
        const startedAt = ports.now();
        const attempt = normalizeAcquisitionAttempt({
          id: ports.nextId(),
          requestId: id,
          actorId,
          correlationId: request.correlationId,
          number: history.length + 1,
          startedAt,
          expiresAt: startedAt + ACQUISITION_LEASE_SECONDS,
          finishedAt: null,
          status: "RUNNING",
          failure: null,
          original: null,
        });
        if (!attempt) {
          return { status: "invalid_input" };
        }
        await tx.insertAcquisition(attempt);
        return eligible()
          ? { status: "completed", value: attempt }
          : { status: "rights_not_approved" };
      });
    },
    check(
      id: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<AcquisitionApproval>> {
      return existing(id, request, async (tx, attempt, media) => {
        const { eligible, reuseApproved } = await rightsGuard(tx, media);
        if (attempt.status !== "RUNNING" || ports.now() >= attempt.expiresAt) {
          return { status: "conflict" };
        }
        return eligible()
          ? { status: "completed", value: { media, reuseApproved } }
          : { status: "rights_not_approved" };
      });
    },
    complete(
      id: unknown,
      value: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<AcquisitionAttempt>> {
      const original = normalizeOriginal(value);
      if (!original) {
        return Promise.resolve({ status: "invalid_input" });
      }
      return existing(id, request, async (tx, attempt, media) => {
        const { eligible } = await rightsGuard(tx, media);
        if (!eligible()) {
          return { status: "rights_not_approved" };
        }
        if (
          original.bytes !== media.input.source.bytes ||
          (media.input.source.sha256 !== null && original.sha256 !== media.input.source.sha256)
        ) {
          return { status: "invalid_input" };
        }
        if (attempt.status === "SUCCEEDED") {
          return JSON.stringify(original) === JSON.stringify(attempt.original)
            ? { status: "completed", value: attempt }
            : { status: "conflict" };
        }
        if (attempt.status !== "RUNNING" || ports.now() >= attempt.expiresAt) {
          return { status: "conflict" };
        }
        const finished = {
          ...attempt,
          status: "SUCCEEDED" as const,
          original,
          finishedAt: ports.now(),
        };
        await tx.finishAcquisition(finished);
        return eligible() && ports.now() < attempt.expiresAt
          ? { status: "completed", value: finished }
          : { status: "conflict" };
      });
    },
    fail(
      id: unknown,
      failure: unknown,
      request: CatalogCommandRequest,
    ): Promise<CatalogStoreResult<AcquisitionAttempt>> {
      if (!acquisitionFailure(failure) || failure === "LEASE_EXPIRED") {
        return Promise.resolve({ status: "invalid_input" });
      }
      return existing(id, request, async (tx, attempt, media) => {
        await tx.lockTitle(media.input.titleId);
        if (attempt.status !== "RUNNING" || ports.now() >= attempt.expiresAt) {
          return { status: "conflict" };
        }
        const finished = {
          ...attempt,
          status: "FAILED" as const,
          failure,
          finishedAt: ports.now(),
        };
        // Recording a failure is permitted after a rights dispute; success never is.
        await tx.finishAcquisition(finished);
        return { status: "completed", value: finished };
      });
    },
  });
}
