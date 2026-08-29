import { progressTimestamp } from "../domain/progress-page.js";
import { validProgressEventContext } from "../domain/progress-event.js";
import {
  advanceWatchlist,
  createWatchlistEvent,
  normalizeWatchlistChange,
  normalizeWatchlistInput,
  watchlistRequestPayload,
  type WatchlistChange,
  type WatchlistInput,
} from "../domain/watchlist.js";
import type { ProgressRequest } from "./progress-ports.js";
import type {
  WatchlistOwner,
  WatchlistPorts,
  WatchlistReceipt,
  WatchlistResult,
} from "./watchlist-ports.js";
import {
  authorizeWatchlist,
  freshWatchlistAuthority,
  readWatchlistVisibility,
  watchlistGuarded,
} from "./watchlist-request.js";

function replay(
  receipt: WatchlistReceipt | null,
  owner: WatchlistOwner,
  input: WatchlistInput,
  digest: string,
  now: number,
): WatchlistResult<WatchlistChange> | null {
  if (!receipt) {
    return null;
  }
  if (!progressTimestamp(receipt.expiresAt)) {
    return { status: "unavailable" };
  }
  if (receipt.expiresAt <= now) {
    return null;
  }
  if (
    receipt.accountId !== owner.accountId ||
    receipt.profileId !== owner.profileId ||
    receipt.idempotencyKey !== input.idempotencyKey
  ) {
    return { status: "unavailable" };
  }
  if (receipt.requestDigest !== digest) {
    return { status: "conflict" };
  }
  const result = normalizeWatchlistChange(receipt.result);
  if (
    !result ||
    result.accountId !== owner.accountId ||
    result.profileId !== owner.profileId ||
    result.titleId !== input.titleId ||
    result.present !== input.present ||
    result.updatedAt > now
  ) {
    return { status: "unavailable" };
  }
  return { status: "completed", value: result };
}

export function createWatchlistWriter(ports: WatchlistPorts) {
  return Object.freeze({
    async set(value: unknown, request: ProgressRequest): Promise<WatchlistResult<WatchlistChange>> {
      const input = normalizeWatchlistInput(value);
      const context = {
        correlationId: request.correlationId,
        causationId: input?.idempotencyKey ?? "",
        ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
      };
      if (!input || !validProgressEventContext(context)) {
        return { status: "invalid_input" };
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2500)]);
      const scoped = { ...request, signal };
      let writing = false;
      try {
        const owner = await authorizeWatchlist(ports, input.profileId, scoped);
        if (owner.status !== "completed") {
          return owner;
        }
        const authorized = () =>
          freshWatchlistAuthority(owner.value.checkedAt, owner.value.expiresAt, ports.now());
        const digest = ports.digest(watchlistRequestPayload(input));
        if (!/^[a-f0-9]{64}$/u.test(digest)) {
          return { status: "unavailable" };
        }
        const found = await watchlistGuarded(
          () => ports.store.receipt(owner.value, input.idempotencyKey, signal),
          signal,
        );
        signal.throwIfAborted();
        if (!authorized()) {
          return { status: "unavailable" };
        }
        if (found.status !== "completed") {
          return found;
        }
        const existing = replay(found.value, owner.value, input, digest, ports.now());
        if (existing) {
          return existing;
        }
        const admission = await ports.limiter?.admit(
          "set_watchlist",
          owner.value.accountId,
          signal,
        );
        signal.throwIfAborted();
        if (admission?.status === "rejected") {
          return { status: "limit_exceeded", retryAfterMs: admission.retryAfterMs };
        }
        if (admission?.status === "cancelled" || admission?.status === "unavailable") {
          return { status: admission.status };
        }
        let checkedAt = owner.value.checkedAt;
        let expiresAt = owner.value.expiresAt;
        if (input.present) {
          const catalog = await readWatchlistVisibility(ports, [input.titleId], scoped);
          if (catalog.status !== "completed") {
            return catalog;
          }
          const visible = catalog.value[0];
          if (!visible?.visible) {
            return { status: "not_visible" };
          }
          checkedAt = Math.min(checkedAt, visible.checkedAt);
          expiresAt = Math.min(expiresAt, visible.expiresAt);
        }
        const currentAuthority = () =>
          authorized() && freshWatchlistAuthority(checkedAt, expiresAt, ports.now());
        if (!currentAuthority()) {
          return { status: "unavailable" };
        }
        writing = true;
        const result = await watchlistGuarded(
          () =>
            ports.store.run(async (tx) => {
              signal.throwIfAborted();
              const locked = await tx.lock(owner.value);
              if (locked.deleted || !authorized()) {
                return { status: "not_found" };
              }
              const now = ports.now();
              if (!progressTimestamp(now) || now > 253_402_297_199) {
                return { status: "unavailable" };
              }
              await tx.pruneReceipts(owner.value, now);
              const duplicate = replay(
                await tx.receipt(owner.value, input.idempotencyKey),
                owner.value,
                input,
                digest,
                now,
              );
              if (duplicate) {
                return authorized() ? duplicate : { status: "not_found" };
              }
              if (!currentAuthority()) {
                return { status: "unavailable" };
              }
              const change = advanceWatchlist(locked.current, input, {
                accountId: owner.value.accountId,
                aggregateId: locked.current?.id ?? ports.nextId(),
                now,
              });
              if (!change) {
                return { status: "unavailable" };
              }
              const counts = await tx.counts(owner.value);
              if ([counts.receipts, counts.outbox].some((n) => !Number.isSafeInteger(n) || n < 0)) {
                return { status: "unavailable" };
              }
              if (counts.receipts >= 1024 || counts.outbox >= 1024) {
                return { status: "backpressure" };
              }
              const event = createWatchlistEvent(ports.nextId(), change, context);
              await tx.save(change, { checkedAt, expiresAt }, ports.nextId());
              await tx.writeReceipt({
                accountId: owner.value.accountId,
                profileId: input.profileId,
                idempotencyKey: input.idempotencyKey,
                requestDigest: digest,
                result: change,
                expiresAt: now + 3600,
              });
              await tx.appendOutbox(event);
              signal.throwIfAborted();
              return currentAuthority()
                ? { status: "completed", value: change }
                : { status: "unavailable" };
            }, signal),
          signal,
        );
        signal.throwIfAborted();
        return result;
      } catch {
        return {
          status: writing ? "indeterminate" : request.signal.aborted ? "cancelled" : "unavailable",
        };
      }
    },
  });
}
