import DataLoader from "dataloader";
import type {
  createEngagementFieldQueries,
  EngagementFieldSnapshot,
} from "../application/read-engagement-fields.js";
import type { CatalogVisibility } from "../application/watchlist-ports.js";
import type { ProgressRequest } from "../application/progress-ports.js";
import {
  engagementPairKey,
  normalizeEngagementPair,
  type EngagementPair,
} from "../domain/engagement-fields.js";
import { EngagementGraphqlError } from "./engagement-error.js";

export function createEngagementFieldLoaders(
  queries: ReturnType<typeof createEngagementFieldQueries>,
  request: ProgressRequest,
) {
  const reader = queries.scope(request);
  const pairs = new Set<string>();
  const profiles = new Set<string>();
  const fields = new DataLoader<EngagementPair, EngagementFieldSnapshot, string>(
    async (keys: readonly EngagementPair[]) =>
      (await reader.read(keys)).map((result) =>
        result.status === "completed"
          ? result.value
          : new EngagementGraphqlError(result.status.toUpperCase()),
      ),
    { maxBatchSize: 20, cacheKeyFn: engagementPairKey },
  );
  const visibility = new DataLoader<string, CatalogVisibility>(
    async (ids: readonly string[]) => {
      const result = await reader.visibility(ids);
      return result.status === "completed"
        ? [...result.value]
        : ids.map(() => new EngagementGraphqlError(result.status.toUpperCase()));
    },
    { maxBatchSize: 20 },
  );
  const assertFresh = (value: Readonly<{ checkedAt: number; expiresAt: number }>) => {
    if (!reader.fresh(value)) {
      throw new EngagementGraphqlError(request.signal.aborted ? "CANCELLED" : "UNAVAILABLE");
    }
  };
  const load = async (value: EngagementPair) => {
    const key = normalizeEngagementPair(value);
    if (!key) {
      throw new EngagementGraphqlError("INVALID_INPUT");
    }
    if (request.signal.aborted) {
      throw new EngagementGraphqlError("CANCELLED");
    }
    const canonical = engagementPairKey(key);
    if (
      (!pairs.has(canonical) && pairs.size >= 20) ||
      (!profiles.has(key.profileId) && profiles.size >= 5)
    ) {
      throw new EngagementGraphqlError("LIMIT_EXCEEDED");
    }
    // Admission precedes DataLoader.load, which enqueues a key before updating its cache.
    pairs.add(canonical);
    profiles.add(key.profileId);
    const snapshot = await fields.load(key);
    assertFresh(snapshot.authority);
    return snapshot;
  };
  return Object.freeze({
    async progress(key: EngagementPair) {
      return (await load(key)).progress;
    },
    async inWatchlist(key: EngagementPair) {
      const snapshot = await load(key);
      if (!snapshot.inWatchlist) {
        return false;
      }
      const current = await visibility.load(key.titleId);
      assertFresh(snapshot.authority);
      assertFresh(current);
      return current.visible;
    },
  });
}
