import type {
  AsterRedisAdapter,
  AsterRedisDeleteResult,
  AsterRedisReadResult,
  AsterRedisWriteResult,
} from "@aster/redis";

import type {
  CatalogCacheResult,
  CatalogPublicCacheStore,
} from "../../application/public-ports.js";

function unavailable<T>(result: { readonly status: string }): CatalogCacheResult<T> {
  return result.status === "aborted" ? { status: "cancelled" } : { status: "bypass" };
}

function readResult(result: AsterRedisReadResult): CatalogCacheResult<string | null> {
  if (result.status === "rejected" && result.reason === "value_too_large") {
    return { status: "malformed" };
  }
  return result.status === "completed"
    ? { status: "completed", value: result.value }
    : unavailable(result);
}

function writeResult(result: AsterRedisWriteResult): CatalogCacheResult<boolean> {
  return result.status === "completed"
    ? { status: "completed", value: result.stored }
    : unavailable(result);
}

function deleteResult(result: AsterRedisDeleteResult): CatalogCacheResult<boolean> {
  return result.status === "completed"
    ? { status: "completed", value: result.deleted }
    : unavailable(result);
}

export function createRedisCatalogPublicCache(redis: AsterRedisAdapter): CatalogPublicCacheStore {
  const store: CatalogPublicCacheStore = {
    async read(key, signal) {
      return readResult(await redis.read(key, signal));
    },
    async write(key, value, ttlMs, mode, signal) {
      return writeResult(await redis.write(key, value, ttlMs, mode, signal));
    },
    async acquireLease(key, ownershipToken, ttlMs, signal) {
      return writeResult(await redis.acquireLease(key, ownershipToken, ttlMs, signal));
    },
    async delete(key, signal) {
      return deleteResult(await redis.delete(key, signal));
    },
    async compareAndDelete(key, expectedValue, signal) {
      return deleteResult(await redis.compareAndDelete(key, expectedValue, signal));
    },
  };
  return Object.freeze(store);
}
