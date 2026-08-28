import {
  normalizeProgressState,
  progressIdentifier,
  type ProgressState,
} from "../domain/progress.js";
import { validProgressEventContext } from "../domain/progress-event.js";
import {
  followsProgressCursor,
  normalizeProgressPageInput,
  progressCursor,
  progressTimestamp,
  type ProgressListKind,
  type ProgressPageInput,
} from "../domain/progress-page.js";
import type { ProgressPorts, ProgressRequest, ProgressCatalog } from "./progress-ports.js";

export type ProgressReadResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{
      status: "invalid_input" | "unauthenticated" | "not_found" | "unavailable" | "cancelled";
    }>;
export interface ProgressConnection {
  readonly edges: readonly Readonly<{ cursor: string; node: ProgressState }>[];
  readonly pageInfo: Readonly<{ endCursor: string | null; hasNextPage: boolean }>;
}
export interface ProgressReadStore {
  page(
    key: Readonly<{ accountId: string; input: ProgressPageInput; kind: ProgressListKind }>,
    signal: AbortSignal,
  ): Promise<ProgressReadResult<readonly ProgressState[]>>;
}

async function guarded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("Progress read cancelled."));
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
          reject(error instanceof Error ? error : new Error("Progress read unavailable."));
        },
      );
    if (signal.aborted) {
      cancel();
    }
  });
}

export function createProgressQueries(
  ports: Readonly<{
    identity: ProgressPorts["identity"];
    catalog?: ProgressCatalog;
    store: ProgressReadStore;
    now: () => number;
  }>,
) {
  return Object.freeze({
    async page(
      kind: ProgressListKind,
      value: unknown,
      request: ProgressRequest,
    ): Promise<ProgressReadResult<ProgressConnection>> {
      const input = normalizeProgressPageInput(value, kind);
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
      const credential = request.credential;
      if (typeof credential !== "string" || credential.length === 0 || credential.length > 4096) {
        return { status: "unauthenticated" };
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2500)]);
      try {
        const owner = await guarded(
          () =>
            ports.identity.authorizeProfile(credential, input.profileId, {
              signal,
              correlationId: request.correlationId,
              ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
            }),
          signal,
        );
        signal.throwIfAborted();
        if (owner.status !== "completed") {
          return {
            status:
              owner.status === "not_found" || owner.status === "unauthenticated"
                ? owner.status
                : "unavailable",
          };
        }
        const authorized = () => {
          const now = ports.now();
          return (
            progressTimestamp(now) &&
            progressTimestamp(owner.value.checkedAt) &&
            progressTimestamp(owner.value.expiresAt) &&
            owner.value.checkedAt <= now &&
            now - owner.value.checkedAt <= 2 &&
            owner.value.expiresAt > now
          );
        };
        if (
          !progressIdentifier(owner.value.accountId) ||
          owner.value.profileId !== input.profileId ||
          !authorized()
        ) {
          return { status: "unavailable" };
        }
        if (input.after && input.after.updatedAt > ports.now()) {
          return { status: "invalid_input" };
        }
        const result = await guarded(
          () =>
            ports.store.page(
              {
                accountId: owner.value.accountId,
                input,
                kind,
              },
              signal,
            ),
          signal,
        );
        signal.throwIfAborted();
        if (!authorized()) {
          return { status: "unavailable" };
        }
        if (result.status !== "completed") {
          return { status: result.status === "not_found" ? "not_found" : "unavailable" };
        }
        if (
          !Array.isArray(result.value) ||
          result.value.length > (kind === "continue" ? 256 : input.first + 1)
        ) {
          return { status: "unavailable" };
        }
        const ids = new Set<string>();
        const titles = new Set<string>();
        let previous = input.after;
        const rows = Array.from(result.value, (raw) => {
          const row = normalizeProgressState(raw);
          if (
            !row ||
            row.accountId !== owner.value.accountId ||
            row.profileId !== input.profileId ||
            row.updatedAt > ports.now() ||
            ids.has(row.id) ||
            titles.has(row.titleId) ||
            (kind === "continue" && row.status !== "IN_PROGRESS") ||
            (previous && !followsProgressCursor(row, previous))
          ) {
            throw new Error("Invalid progress page.");
          }
          ids.add(row.id);
          titles.add(row.titleId);
          previous = row;
          return row;
        });
        let selected = rows;
        let visibilityExpiry = Infinity;
        if (kind === "continue" && rows.length > 0) {
          const catalog = ports.catalog;
          if (!catalog) {
            return { status: "unavailable" };
          }
          selected = [];
          for (
            let offset = 0;
            offset < rows.length && selected.length <= input.first;
            offset += 20
          ) {
            const batch = rows.slice(offset, offset + 20);
            const visibility = await guarded(
              () =>
                catalog.visibility(
                  batch.map((row) => row.titleId),
                  {
                    signal,
                    correlationId: request.correlationId,
                    ...(request.traceparent === undefined
                      ? {}
                      : { traceparent: request.traceparent }),
                  },
                ),
              signal,
            );
            signal.throwIfAborted();
            if (visibility.status !== "completed") {
              return { status: "unavailable" };
            }
            const snapshot = visibility.value;
            const snapshotTitles = snapshot.titles;
            const now = ports.now();
            if (
              !progressTimestamp(snapshot.checkedAt) ||
              !progressTimestamp(snapshot.expiresAt) ||
              snapshot.checkedAt > now ||
              snapshot.expiresAt > snapshot.checkedAt + 2 ||
              snapshot.expiresAt <= now ||
              !Array.isArray(snapshot.titles) ||
              snapshot.titles.length !== batch.length
            ) {
              return { status: "unavailable" };
            }
            visibilityExpiry = Math.min(visibilityExpiry, snapshot.expiresAt);
            for (const [index, row] of batch.entries()) {
              const title = snapshotTitles[index];
              if (title?.titleId !== row.titleId || typeof title.visible !== "boolean") {
                return { status: "unavailable" };
              }
              if (title.visible) {
                selected.push(row);
              }
            }
            if (!authorized() || ports.now() >= visibilityExpiry) {
              return { status: "unavailable" };
            }
          }
        }
        if (!authorized() || ports.now() >= visibilityExpiry) {
          return { status: "unavailable" };
        }
        const edges = Object.freeze(
          selected.slice(0, input.first).map((node) =>
            Object.freeze({
              cursor: progressCursor(input.profileId, kind, node),
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
              hasNextPage: selected.length > input.first,
            }),
          }),
        };
      } catch {
        return { status: request.signal.aborted ? "cancelled" : "unavailable" };
      }
    },
  });
}
