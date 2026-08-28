import { validProgressEventContext } from "../domain/progress-event.js";
import {
  followsWatchlistCursor,
  normalizeWatchlistEntry,
  normalizeWatchlistPageInput,
  watchlistCursor,
  type WatchlistEntry,
} from "../domain/watchlist.js";
import type { ProgressRequest } from "./progress-ports.js";
import type { WatchlistPorts, WatchlistResult } from "./watchlist-ports.js";
import {
  authorizeWatchlist,
  freshWatchlistAuthority,
  readWatchlistVisibility,
  watchlistGuarded,
} from "./watchlist-request.js";

export interface WatchlistConnection {
  readonly edges: readonly Readonly<{ cursor: string; node: WatchlistEntry }>[];
  readonly pageInfo: Readonly<{ endCursor: string | null; hasNextPage: boolean }>;
}

export function createWatchlistQueries(
  ports: Pick<WatchlistPorts, "identity" | "catalog" | "store" | "now">,
) {
  return Object.freeze({
    async page(
      value: unknown,
      request: ProgressRequest,
    ): Promise<WatchlistResult<WatchlistConnection>> {
      const input = normalizeWatchlistPageInput(value);
      if (
        !input ||
        !validProgressEventContext({
          correlationId: request.correlationId,
          causationId: request.correlationId,
          ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
        })
      ) {
        return { status: "invalid_input" };
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2500)]);
      const scoped = { ...request, signal };
      try {
        const owner = await authorizeWatchlist(ports, input.profileId, scoped);
        if (owner.status !== "completed") {
          return owner;
        }
        if (input.after && input.after.addedAt > ports.now()) {
          return { status: "invalid_input" };
        }
        const authorized = () =>
          freshWatchlistAuthority(owner.value.checkedAt, owner.value.expiresAt, ports.now());
        const result = await watchlistGuarded(
          () => ports.store.candidates(owner.value, input, signal),
          signal,
        );
        signal.throwIfAborted();
        if (!authorized()) {
          return { status: "unavailable" };
        }
        if (result.status !== "completed") {
          return { status: result.status === "not_found" ? "not_found" : "unavailable" };
        }
        if (!Array.isArray(result.value) || result.value.length > 256) {
          return { status: "unavailable" };
        }
        const ids = new Set<string>();
        const titles = new Set<string>();
        let previous = input.after;
        const candidates = Array.from(result.value, (raw) => {
          const row = normalizeWatchlistEntry(raw);
          if (
            !row ||
            row.accountId !== owner.value.accountId ||
            row.profileId !== input.profileId ||
            row.addedAt > ports.now() ||
            ids.has(row.id) ||
            titles.has(row.titleId) ||
            (previous && !followsWatchlistCursor(row, previous))
          ) {
            throw new Error("Invalid watchlist candidates.");
          }
          ids.add(row.id);
          titles.add(row.titleId);
          previous = row;
          return row;
        });
        const visible: WatchlistEntry[] = [];
        let visibilityExpiry = Infinity;
        for (
          let offset = 0;
          offset < candidates.length && visible.length <= input.first;
          offset += 20
        ) {
          const batch = candidates.slice(offset, offset + 20);
          const visibility = await readWatchlistVisibility(
            ports,
            batch.map((row) => row.titleId),
            scoped,
          );
          if (visibility.status !== "completed") {
            return { status: "unavailable" };
          }
          for (const [index, row] of visibility.value.entries()) {
            visibilityExpiry = Math.min(visibilityExpiry, row.expiresAt);
            const entry = batch[index];
            if (row.visible && entry) {
              visible.push(entry);
            }
          }
          if (!authorized() || ports.now() >= visibilityExpiry) {
            return { status: "unavailable" };
          }
        }
        signal.throwIfAborted();
        if (!authorized() || ports.now() >= visibilityExpiry) {
          return { status: "unavailable" };
        }
        const edges = Object.freeze(
          visible.slice(0, input.first).map((node) =>
            Object.freeze({
              cursor: watchlistCursor(input.profileId, node),
              node,
            }),
          ),
        );
        return {
          status: "completed",
          value: Object.freeze({
            edges,
            pageInfo: Object.freeze({
              endCursor: edges.at(-1)?.cursor ?? null,
              hasNextPage: visible.length > input.first,
            }),
          }),
        };
      } catch {
        return { status: request.signal.aborted ? "cancelled" : "unavailable" };
      }
    },
  });
}
