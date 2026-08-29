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

const timestamp = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 253_402_300_799;
const fresh = (checkedAt: number, expiresAt: number, now: number) =>
  timestamp(checkedAt) &&
  timestamp(expiresAt) &&
  timestamp(now) &&
  checkedAt <= now &&
  now - checkedAt <= 2 &&
  expiresAt > now;

function guarded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
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

function replay(
  receipt: ProgressReceipt | null,
  key: ProgressKey,
  input: ProgressInput,
  digest: string,
  now: number,
): ProgressResult<ProgressState> | null {
  if (!receipt) {
    return null;
  }
  if (!timestamp(receipt.expiresAt)) {
    return { status: "unavailable" };
  }
  if (receipt.expiresAt <= now) {
    return null;
  }
  if (
    receipt.accountId !== key.accountId ||
    receipt.profileId !== key.profileId ||
    !progressIdentifier(receipt.titleId) ||
    receipt.idempotencyKey !== input.idempotencyKey
  ) {
    return { status: "unavailable" };
  }
  if (receipt.requestDigest !== digest) {
    return { status: "conflict" };
  }
  const saved = normalizeProgressState(receipt.result);
  if (
    !saved ||
    receipt.titleId !== key.titleId ||
    saved.accountId !== key.accountId ||
    saved.profileId !== key.profileId ||
    saved.titleId !== key.titleId ||
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
      let writing = false;
      let releaseIdempotency: (() => void) | undefined;
      try {
        const credential = request.credential;
        const owner = await guarded(
          () => ports.identity.authorizeProfile(credential, input.profileId, ownerRequest),
          signal,
        );
        signal.throwIfAborted();
        if (owner.status !== "completed") {
          return { status: owner.status };
        }
        const authorized = () => fresh(owner.value.checkedAt, owner.value.expiresAt, ports.now());
        if (
          !progressIdentifier(owner.value.accountId) ||
          owner.value.profileId !== input.profileId ||
          !authorized()
        ) {
          return { status: "unavailable" };
        }
        const key = {
          accountId: owner.value.accountId,
          profileId: input.profileId,
          titleId: input.titleId,
        };
        const digest = ports.digest(progressRequestPayload(input));
        if (!/^[a-f0-9]{64}$/u.test(digest)) {
          return { status: "unavailable" };
        }
        const admissionKey = ports.digest(
          `record_progress\0${owner.value.accountId}\0${input.profileId}\0${input.idempotencyKey}`,
        );
        const ordering = await idempotencyAdmissions.acquire(admissionKey, signal);
        if (ordering.status === "cancelled") {
          return { status: "cancelled" };
        }
        if (ordering.status === "capacity") {
          return { status: "backpressure" };
        }
        releaseIdempotency = ordering.release;
        const existing = await guarded(
          () => ports.receipts.read(key, input.idempotencyKey, signal),
          signal,
        );
        signal.throwIfAborted();
        if (!authorized()) {
          return { status: "unavailable" };
        }
        if (existing.status !== "completed") {
          return { status: existing.status };
        }
        const accepted = replay(existing.value, key, input, digest, ports.now());
        if (accepted) {
          return accepted;
        }
        const admission = await ports.limiter?.admit(
          "record_progress",
          owner.value.accountId,
          admissionKey,
          signal,
        );
        signal.throwIfAborted();
        if (admission?.status === "rejected") {
          return { status: "limit_exceeded", retryAfterMs: admission.retryAfterMs };
        }
        if (admission?.status === "cancelled" || admission?.status === "unavailable") {
          return { status: admission.status };
        }
        const playback = await guarded(
          () => ports.playback.inspect(input.playbackSessionId, input.titleId, ownerRequest),
          signal,
        );
        signal.throwIfAborted();
        if (playback.status !== "completed") {
          return { status: playback.status };
        }
        const validContext = () =>
          authorized() &&
          fresh(playback.value.checkedAt, playback.value.expiresAt, ports.now()) &&
          timestamp(playback.value.createdAt) &&
          playback.value.createdAt <= ports.now() &&
          playback.value.expiresAt > playback.value.createdAt &&
          playback.value.sessionId === input.playbackSessionId &&
          playback.value.titleId === input.titleId;
        if (!validContext()) {
          return { status: "not_playable" };
        }
        writing = true;
        const result = await guarded(
          () =>
            ports.transactions.run(async (tx) => {
              signal.throwIfAborted();
              const locked = await tx.lock(key);
              if (!authorized() || locked.deleted) {
                return { status: "not_found" };
              }
              const timestamp = ports.now();
              if (timestamp > 253_402_300_799 - limits.receiptSeconds) {
                return { status: "unavailable" };
              }
              await tx.pruneReceipts(key, timestamp, 64);
              const repeated = replay(
                await tx.findReceipt(key, input.idempotencyKey),
                key,
                input,
                digest,
                timestamp,
              );
              if (repeated) {
                return authorized() ? repeated : { status: "not_found" };
              }
              if (!validContext()) {
                return { status: "not_playable" };
              }
              const changed = advanceProgress(locked.current, input, {
                accountId: key.accountId,
                aggregateId: locked.current?.id ?? ports.nextId(),
                now: timestamp,
                policy: ports.policy,
              });
              if (changed.status !== "accepted") {
                return {
                  status: changed.status === "invalid_state" ? "unavailable" : changed.status,
                };
              }
              const counts = await tx.retainedCounts(key);
              if (
                [counts.receipts, counts.outbox].some(
                  (count) => !Number.isSafeInteger(count) || count < 0,
                )
              ) {
                return { status: "unavailable" };
              }
              if (
                counts.receipts >= limits.maximumReceipts ||
                counts.outbox >= limits.maximumOutbox
              ) {
                return { status: "backpressure" };
              }
              const event = createProgressEvent(ports.nextId(), changed.value, eventContext);
              await tx.save(changed.value, {
                checkedAt: Math.min(owner.value.checkedAt, playback.value.checkedAt),
                expiresAt: Math.min(owner.value.expiresAt, playback.value.expiresAt),
              });
              await tx.writeReceipt({
                ...key,
                idempotencyKey: input.idempotencyKey,
                requestDigest: digest,
                result: changed.value,
                expiresAt: timestamp + limits.receiptSeconds,
              });
              await tx.appendOutbox(event);
              signal.throwIfAborted();
              return validContext()
                ? { status: "completed", value: changed.value }
                : { status: "not_playable" };
            }, signal),
          signal,
        );
        signal.throwIfAborted();
        return result;
      } catch {
        return {
          status: writing ? "indeterminate" : request.signal.aborted ? "cancelled" : "unavailable",
        };
      } finally {
        releaseIdempotency?.();
      }
    },
  });
}
