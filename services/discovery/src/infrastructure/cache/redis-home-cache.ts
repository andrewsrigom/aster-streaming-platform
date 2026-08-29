import type { AsterRedisAdapter, AsterRedisReadResult } from "@aster/redis";
import type {
  DiscoveryHomeCacheResult,
  DiscoveryHomeCacheStore,
} from "../../application/home-cache-ports.js";

function bypass<T>(): DiscoveryHomeCacheResult<T> {
  return { status: "bypass" };
}

function readResult(result: AsterRedisReadResult): DiscoveryHomeCacheResult<string | null> {
  if (result.status === "rejected" && result.reason === "value_too_large") {
    return { status: "malformed" };
  }
  return result.status === "completed"
    ? { status: "completed", value: result.value }
    : result.status === "aborted"
      ? { status: "cancelled" }
      : bypass();
}

function booleanResult(
  result:
    | Awaited<ReturnType<AsterRedisAdapter["write"]>>
    | Awaited<ReturnType<AsterRedisAdapter["delete"]>>,
): DiscoveryHomeCacheResult<boolean> {
  if (result.status === "completed") {
    return {
      status: "completed",
      value: "stored" in result ? result.stored : result.deleted,
    };
  }
  return result.status === "aborted" ? { status: "cancelled" } : bypass();
}

export function createRedisDiscoveryHomeCache(redis: AsterRedisAdapter): DiscoveryHomeCacheStore {
  const store: DiscoveryHomeCacheStore = {
    async read(key, signal) {
      return readResult(await redis.read(key, signal));
    },
    async write(key, value, ttlMs, mode, signal) {
      return booleanResult(await redis.write(key, value, ttlMs, mode, signal));
    },
    async delete(key, signal) {
      return booleanResult(await redis.delete(key, signal));
    },
    async compareAndDelete(key, expected, signal) {
      return booleanResult(await redis.compareAndDelete(key, expected, signal));
    },
  };
  return Object.freeze(store);
}
