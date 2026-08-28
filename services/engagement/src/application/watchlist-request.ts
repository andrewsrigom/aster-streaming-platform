import { progressIdentifier, progressRecord } from "../domain/progress.js";
import { progressTimestamp } from "../domain/progress-page.js";
import type { ProgressRequest } from "./progress-ports.js";
import type {
  CatalogVisibility,
  WatchlistPorts,
  WatchlistResult,
  WatchlistOwner,
} from "./watchlist-ports.js";

export function freshWatchlistAuthority(
  checkedAt: number,
  expiresAt: number,
  now: number,
): boolean {
  return (
    progressTimestamp(checkedAt) &&
    progressTimestamp(expiresAt) &&
    progressTimestamp(now) &&
    checkedAt <= now &&
    now - checkedAt <= 2 &&
    expiresAt > now
  );
}

export function watchlistGuarded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(new Error("Watchlist request cancelled."));
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
          reject(error instanceof Error ? error : new Error("Watchlist dependency unavailable."));
        },
      );
    if (signal.aborted) {
      cancel();
    }
  });
}

export async function authorizeWatchlist(
  ports: Pick<WatchlistPorts, "identity" | "now">,
  profileId: string,
  request: ProgressRequest,
): Promise<WatchlistResult<WatchlistOwner & Readonly<{ checkedAt: number; expiresAt: number }>>> {
  const credential = request.credential;
  if (typeof credential !== "string" || credential.length === 0 || credential.length > 4096) {
    return { status: "unauthenticated" };
  }
  const result = await watchlistGuarded(
    () =>
      ports.identity.authorizeProfile(credential, profileId, {
        signal: request.signal,
        correlationId: request.correlationId,
        ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
      }),
    request.signal,
  );
  request.signal.throwIfAborted();
  if (result.status !== "completed") {
    return {
      status:
        result.status === "not_found" || result.status === "unauthenticated"
          ? result.status
          : "unavailable",
    };
  }
  if (
    !progressIdentifier(result.value.accountId) ||
    result.value.profileId !== profileId ||
    !freshWatchlistAuthority(result.value.checkedAt, result.value.expiresAt, ports.now())
  ) {
    return { status: "unavailable" };
  }
  return { status: "completed", value: Object.freeze({ ...result.value }) };
}

export async function readWatchlistVisibility(
  ports: Pick<WatchlistPorts, "catalog" | "now">,
  ids: readonly string[],
  request: ProgressRequest,
): Promise<WatchlistResult<readonly CatalogVisibility[]>> {
  const response = await watchlistGuarded(
    () =>
      ports.catalog.visibility(ids, {
        signal: request.signal,
        correlationId: request.correlationId,
        ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
      }),
    request.signal,
  );
  request.signal.throwIfAborted();
  if (response.status !== "completed") {
    return { status: "unavailable" };
  }
  const snapshot = progressRecord(response.value, ["checkedAt", "expiresAt", "titles"]);
  if (
    !snapshot ||
    !progressTimestamp(snapshot["checkedAt"]) ||
    !progressTimestamp(snapshot["expiresAt"]) ||
    snapshot["expiresAt"] > snapshot["checkedAt"] + 2 ||
    !freshWatchlistAuthority(snapshot["checkedAt"], snapshot["expiresAt"], ports.now()) ||
    !Array.isArray(snapshot["titles"]) ||
    snapshot["titles"].length !== ids.length
  ) {
    return { status: "unavailable" };
  }
  const result: CatalogVisibility[] = [];
  for (const [index, raw] of snapshot["titles"].entries()) {
    const row = progressRecord(raw, ["titleId", "visible"]);
    if (
      !row ||
      !progressIdentifier(row["titleId"]) ||
      row["titleId"] !== ids[index] ||
      typeof row["visible"] !== "boolean"
    ) {
      return { status: "unavailable" };
    }
    result.push(
      Object.freeze({
        titleId: row["titleId"],
        visible: row["visible"],
        checkedAt: snapshot["checkedAt"],
        expiresAt: snapshot["expiresAt"],
      }),
    );
  }
  return { status: "completed", value: Object.freeze(result) };
}
