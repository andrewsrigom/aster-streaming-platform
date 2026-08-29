import { performance } from "node:perf_hooks";
import type {
  AsterRedisAdapter,
  AsterRedisTokenBucketPolicy,
  AsterRedisTokenBucketResult,
} from "@aster/redis";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";
import type {
  EngagementLimitedOperation,
  EngagementOperationAdmission,
} from "../application/operation-limit-ports.js";
import { progressIdentifier } from "../domain/progress.js";

const MAXIMUM_PARTITIONS = 1_024;
const MILLI_TOKENS = 1_000;
const FALLBACK_RETRY_MS = 1_000;

const POLICIES = Object.freeze({
  record_progress: Object.freeze({ capacity: 12, refillPerSecond: 4, cost: 1, ttlMs: 30_000 }),
  set_watchlist: Object.freeze({ capacity: 4, refillPerSecond: 1, cost: 1, ttlMs: 30_000 }),
}) satisfies Readonly<Record<EngagementLimitedOperation, AsterRedisTokenBucketPolicy>>;

interface LocalBucket {
  readonly tokens: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
}

type LocalAdmission =
  | Readonly<{ status: "allowed" }>
  | Readonly<{ status: "rejected"; retryAfterMs: number }>
  | Readonly<{ status: "capacity" }>;

export interface EngagementOperationLimiterOptions {
  readonly environment: "local" | "test" | "development" | "staging" | "production";
  readonly redis?: Pick<AsterRedisAdapter, "consumeTokenBucket">;
  readonly digest: (value: string) => string;
  readonly monotonicNow?: () => number;
  readonly recordMetric?: (input: AsterOperationLimitMetricInput) => unknown;
}

function duration(startedAt: number, now: number): number {
  return Number.isFinite(now) && now >= startedAt ? now - startedAt : 0;
}

function cancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

function redisKey(
  environment: EngagementOperationLimiterOptions["environment"],
  operation: EngagementLimitedOperation,
  digest: string,
): string {
  return `aster:${environment}:engagement:rate:v1:${operation}:${digest}`;
}

export function createEngagementOperationLimiter(options: EngagementOperationLimiterOptions) {
  const now = options.monotonicNow ?? (() => performance.now());
  const partitions = new Map<string, LocalBucket>();
  let closed = false;

  const record = (
    operation: EngagementLimitedOperation,
    outcome: AsterOperationLimitMetricInput["outcome"],
    startedAt: number,
  ): void => {
    try {
      options.recordMetric?.({
        limiter: "rate",
        operation,
        outcome,
        durationMs: duration(startedAt, now()),
      });
    } catch {
      // Telemetry is never part of the admission decision.
    }
  };

  const localAdmission = (
    partition: string,
    policy: AsterRedisTokenBucketPolicy,
    timestamp: number,
  ): LocalAdmission => {
    for (const [key, bucket] of partitions) {
      if (timestamp >= bucket.expiresAt) {
        partitions.delete(key);
      }
    }
    const previous = partitions.get(partition);
    if (!previous && partitions.size >= MAXIMUM_PARTITIONS) {
      return { status: "capacity" };
    }
    if (previous) {
      partitions.delete(partition);
    }
    const reset = !previous || timestamp < previous.updatedAt || timestamp >= previous.expiresAt;
    const elapsed = reset ? 0 : timestamp - previous.updatedAt;
    const available = reset
      ? policy.capacity * MILLI_TOKENS
      : Math.min(
          policy.capacity * MILLI_TOKENS,
          previous.tokens + Math.floor(elapsed * policy.refillPerSecond),
        );
    const cost = policy.cost * MILLI_TOKENS;
    const allowed = available >= cost;
    const remaining = allowed ? available - cost : available;
    partitions.set(partition, {
      tokens: remaining,
      updatedAt: timestamp,
      expiresAt: timestamp + policy.ttlMs,
    });
    if (allowed) {
      return { status: "allowed" };
    }
    return {
      status: "rejected",
      retryAfterMs: Math.max(
        1,
        Math.min(policy.ttlMs, Math.ceil((cost - remaining) / policy.refillPerSecond)),
      ),
    };
  };

  const distributedAdmission = async (
    operation: EngagementLimitedOperation,
    key: string,
    signal: AbortSignal,
  ): Promise<AsterRedisTokenBucketResult | null> => {
    if (!options.redis) {
      return null;
    }
    try {
      return await options.redis.consumeTokenBucket(key, POLICIES[operation], signal);
    } catch {
      return { status: "unavailable" };
    }
  };

  return Object.freeze({
    async admit(
      operation: EngagementLimitedOperation,
      accountId: string,
      signal: AbortSignal,
    ): Promise<EngagementOperationAdmission> {
      const startedAt = now();
      if (closed) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      if (signal.aborted) {
        record(operation, "cancelled", startedAt);
        return { status: "cancelled" };
      }
      const digest = progressIdentifier(accountId) ? options.digest(accountId) : "";
      if (!/^[a-f0-9]{64}$/u.test(digest)) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      const timestamp = now();
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      const partition = `${operation}:${digest}`;
      const local = localAdmission(partition, POLICIES[operation], timestamp);
      if (local.status === "rejected") {
        record(operation, "rejected", startedAt);
        return local;
      }
      const distributed = await distributedAdmission(
        operation,
        redisKey(options.environment, operation, digest),
        signal,
      );
      if (cancelled(signal) || distributed?.status === "aborted") {
        record(operation, "cancelled", startedAt);
        return { status: "cancelled" };
      }
      if (distributed?.status === "completed") {
        record(
          operation,
          distributed.recovered ? "recovered" : distributed.allowed ? "allowed" : "rejected",
          startedAt,
        );
        return distributed.allowed
          ? { status: "allowed" }
          : { status: "rejected", retryAfterMs: distributed.retryAfterMs };
      }
      if (local.status === "capacity") {
        record(operation, "rejected", startedAt);
        return { status: "rejected", retryAfterMs: FALLBACK_RETRY_MS };
      }
      record(operation, "local_fallback", startedAt);
      return { status: "allowed" };
    },
    snapshot: () =>
      Object.freeze({ closed, partitions: partitions.size, maximumPartitions: MAXIMUM_PARTITIONS }),
    close(): void {
      closed = true;
      partitions.clear();
    },
  });
}
