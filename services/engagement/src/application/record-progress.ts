import {
  advanceProgress,
  normalizeProgressInput,
  normalizeProgressState,
  progressIdentifier,
  progressRequestPayload,
  type ProgressInput,
  type ProgressState,
} from "../domain/progress.js";
import { createProgressEvent, validProgressEventContext } from "../domain/progress-event.js";
import type {
  ProgressKey,
  ProgressPorts,
  ProgressReceipt,
  ProgressRequest,
  ProgressResult,
} from "./progress-ports.js";
import { createIdempotencyAdmissionQueue } from "./idempotency-admission.js";

const validProgressTimestamp = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 253_402_300_799;
const dependencySnapshotIsFresh = (checkedAt: number, expiresAt: number, now: number) =>
  validProgressTimestamp(checkedAt) &&
  validProgressTimestamp(expiresAt) &&
  validProgressTimestamp(now) &&
  checkedAt <= now &&
  now - checkedAt <= 2 &&
  expiresAt > now;

function awaitDependencyOrAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("Progress cancelled."));
    };
    signal.addEventListener("abort", cancel, { once: true });
    void Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(
        (value) => {
          signal.removeEventListener("abort", cancel);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", cancel);
          reject(error instanceof Error ? error : new Error("Progress dependency unavailable."));
        },
      );
    if (signal.aborted) {
      cancel();
    }
  });
}

function replayProgressReceipt(
  receipt: ProgressReceipt | null,
  progressKey: ProgressKey,
  input: ProgressInput,
  requestDigest: string,
  now: number,
): ProgressResult<ProgressState> | null {
  if (!receipt) {
    return null;
  }
  if (!validProgressTimestamp(receipt.expiresAt)) {
    return { status: "unavailable" };
  }
  if (receipt.expiresAt <= now) {
    return null;
  }
  if (
    receipt.accountId !== progressKey.accountId ||
    receipt.profileId !== progressKey.profileId ||
    !progressIdentifier(receipt.titleId) ||
    receipt.idempotencyKey !== input.idempotencyKey
  ) {
    return { status: "unavailable" };
  }
  if (receipt.requestDigest !== requestDigest) {
    return { status: "conflict" };
  }
  const saved = normalizeProgressState(receipt.result);
  if (
    !saved ||
    receipt.titleId !== progressKey.titleId ||
    saved.accountId !== progressKey.accountId ||
    saved.profileId !== progressKey.profileId ||
    saved.titleId !== progressKey.titleId ||
    saved.sequence !== input.sequence ||
    saved.playbackSessionId !== input.playbackSessionId ||
    saved.occurredAt !== input.occurredAt ||
    saved.durationMs !== input.durationMs ||
    saved.positionMs !== Math.max(0, Math.min(input.positionMs, input.durationMs)) ||
    saved.updatedAt > now
  ) {
    return { status: "unavailable" };
  }
  return { status: "completed", value: saved };
}

export function createProgressRecorder(ports: ProgressPorts) {
  const idempotencyAdmissions = createIdempotencyAdmissionQueue();
  const limits = ports.limits;
  if (
    !Number.isSafeInteger(limits.receiptSeconds) ||
    limits.receiptSeconds < 60 ||
    limits.receiptSeconds > 86400 ||
    [limits.maximumReceipts, limits.maximumOutbox].some(
      (value) => !Number.isSafeInteger(value) || value < 1 || value > 10000,
    )
  ) {
    throw new Error("Invalid progress limits.");
  }
  return Object.freeze({
    async record(value: unknown, request: ProgressRequest): Promise<ProgressResult<ProgressState>> {
      const input = normalizeProgressInput(value);
      if (!input) {
        return { status: "invalid_input" };
      }
      const eventContext = {
        correlationId: request.correlationId,
        causationId: input.idempotencyKey,
        ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
      };
      if (!validProgressEventContext(eventContext)) {
        return { status: "invalid_input" };
      }
      if (
        typeof request.credential !== "string" ||
        request.credential.length === 0 ||
        request.credential.length > 4096
      ) {
        return { status: "unauthenticated" };
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2500)]);
      const ownerRequest = {
        signal,
        correlationId: request.correlationId,
        ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
      };
      let progressWriteStarted = false;
      let releaseIdempotencyAdmission: (() => void) | undefined;
      try {
        const credential = request.credential;
        const profileAuthorization = await awaitDependencyOrAbort(
          () => ports.identity.authorizeProfile(credential, input.profileId, ownerRequest),
          signal,
        );
        signal.throwIfAborted();
        if (profileAuthorization.status !== "completed") {
          return { status: profileAuthorization.status };
        }

        const profileAuthorizationIsCurrent = () =>
          dependencySnapshotIsFresh(
            profileAuthorization.value.checkedAt,
            profileAuthorization.value.expiresAt,
            ports.now(),
          );
        if (
          !progressIdentifier(profileAuthorization.value.accountId) ||
          profileAuthorization.value.profileId !== input.profileId ||
          !profileAuthorizationIsCurrent()
        ) {
          return { status: "unavailable" };
        }

        const progressKey = {
          accountId: profileAuthorization.value.accountId,
          profileId: input.profileId,
          titleId: input.titleId,
        };
        const requestDigest = ports.digest(progressRequestPayload(input));
        if (!/^[a-f0-9]{64}$/u.test(requestDigest)) {
          return { status: "unavailable" };
        }

        const idempotencyAdmissionKey = ports.digest(
          `record_progress\0${profileAuthorization.value.accountId}\0${input.profileId}\0${input.idempotencyKey}`,
        );
        const idempotencyAdmission = await idempotencyAdmissions.acquire(
          idempotencyAdmissionKey,
          signal,
        );
        if (idempotencyAdmission.status === "cancelled") {
          return { status: "cancelled" };
        }
        if (idempotencyAdmission.status === "capacity") {
          return { status: "backpressure" };
        }
        releaseIdempotencyAdmission = idempotencyAdmission.release;

        const receiptLookup = await awaitDependencyOrAbort(
          () => ports.receipts.read(progressKey, input.idempotencyKey, signal),
          signal,
        );
        signal.throwIfAborted();
        if (!profileAuthorizationIsCurrent()) {
          return { status: "unavailable" };
        }
        if (receiptLookup.status !== "completed") {
          return { status: receiptLookup.status };
        }

        const replayedProgress = replayProgressReceipt(
          receiptLookup.value,
          progressKey,
          input,
          requestDigest,
          ports.now(),
        );
        if (replayedProgress) {
          return replayedProgress;
        }

        const operationAdmission = await ports.limiter?.admit(
          "record_progress",
          profileAuthorization.value.accountId,
          ports.digest(`${idempotencyAdmissionKey}\0${requestDigest}`),
          signal,
        );
        signal.throwIfAborted();
        if (operationAdmission?.status === "rejected") {
          return { status: "limit_exceeded", retryAfterMs: operationAdmission.retryAfterMs };
        }
        if (
          operationAdmission?.status === "cancelled" ||
          operationAdmission?.status === "unavailable"
        ) {
          return { status: operationAdmission.status };
        }

        const playbackInspection = await awaitDependencyOrAbort(
          () => ports.playback.inspect(input.playbackSessionId, input.titleId, ownerRequest),
          signal,
        );
        signal.throwIfAborted();
        if (playbackInspection.status !== "completed") {
          return { status: playbackInspection.status };
        }

        const playbackContextIsCurrent = () =>
          profileAuthorizationIsCurrent() &&
          dependencySnapshotIsFresh(
            playbackInspection.value.checkedAt,
            playbackInspection.value.expiresAt,
            ports.now(),
          ) &&
          validProgressTimestamp(playbackInspection.value.createdAt) &&
          playbackInspection.value.createdAt <= ports.now() &&
          playbackInspection.value.expiresAt > playbackInspection.value.createdAt &&
          playbackInspection.value.sessionId === input.playbackSessionId &&
          playbackInspection.value.titleId === input.titleId;
        if (!playbackContextIsCurrent()) {
          return { status: "not_playable" };
        }

        progressWriteStarted = true;
        const transactionResult = await awaitDependencyOrAbort(
          () =>
            ports.transactions.run(async (tx) => {
              signal.throwIfAborted();
              const lockedProgress = await tx.lock(progressKey);
              if (!profileAuthorizationIsCurrent() || lockedProgress.deleted) {
                return { status: "not_found" };
              }

              const writeTime = ports.now();
              if (writeTime > 253_402_300_799 - limits.receiptSeconds) {
                return { status: "unavailable" };
              }

              await tx.pruneReceipts(progressKey, writeTime, 64);
              const lockedReceiptReplay = replayProgressReceipt(
                await tx.findReceipt(progressKey, input.idempotencyKey),
                progressKey,
                input,
                requestDigest,
                writeTime,
              );
              if (lockedReceiptReplay) {
                return profileAuthorizationIsCurrent()
                  ? lockedReceiptReplay
                  : { status: "not_found" };
              }
              if (!playbackContextIsCurrent()) {
                return { status: "not_playable" };
              }

              const progressChange = advanceProgress(lockedProgress.current, input, {
                accountId: progressKey.accountId,
                aggregateId: lockedProgress.current?.id ?? ports.nextId(),
                now: writeTime,
                policy: ports.policy,
              });
              if (progressChange.status !== "accepted") {
                return {
                  status:
                    progressChange.status === "invalid_state"
                      ? "unavailable"
                      : progressChange.status,
                };
              }

              const retainedCounts = await tx.retainedCounts(progressKey);
              if (
                [retainedCounts.receipts, retainedCounts.outbox].some(
                  (count) => !Number.isSafeInteger(count) || count < 0,
                )
              ) {
                return { status: "unavailable" };
              }
              if (
                retainedCounts.receipts >= limits.maximumReceipts ||
                retainedCounts.outbox >= limits.maximumOutbox
              ) {
                return { status: "backpressure" };
              }

              const progressEvent = createProgressEvent(
                ports.nextId(),
                progressChange.value,
                eventContext,
              );
              await tx.save(progressChange.value, {
                checkedAt: Math.min(
                  profileAuthorization.value.checkedAt,
                  playbackInspection.value.checkedAt,
                ),
                expiresAt: Math.min(
                  profileAuthorization.value.expiresAt,
                  playbackInspection.value.expiresAt,
                ),
              });
              await tx.writeReceipt({
                ...progressKey,
                idempotencyKey: input.idempotencyKey,
                requestDigest,
                result: progressChange.value,
                expiresAt: writeTime + limits.receiptSeconds,
              });
              await tx.appendOutbox(progressEvent);
              signal.throwIfAborted();
              return playbackContextIsCurrent()
                ? { status: "completed", value: progressChange.value }
                : { status: "not_playable" };
            }, signal),
          signal,
        );
        signal.throwIfAborted();
        return transactionResult;
      } catch {
        if (progressWriteStarted) {
          return { status: "indeterminate" };
        }
        if (request.signal.aborted) {
          return { status: "cancelled" };
        }
        return { status: "unavailable" };
      } finally {
        releaseIdempotencyAdmission?.();
      }
    },
  });
}
