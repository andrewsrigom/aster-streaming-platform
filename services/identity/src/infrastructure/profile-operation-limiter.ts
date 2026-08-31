import { performance } from "node:perf_hooks";
import type {
  AsterRedisAdapter,
  AsterRedisTokenBucketPolicy,
  AsterRedisTokenBucketResult,
} from "@aster/redis";
import type { AsterOperationLimitMetricInput } from "@aster/telemetry";

import type {
  IdentityLimitedProfileOperation,
  IdentityProfileOperationAdmission,
} from "../application/profile-operation-limit.js";
import { profileIdentifier } from "../domain/profile.js";

const MAXIMUM_PARTITIONS = 1_024;
const MAXIMUM_LOCAL_ADMISSIONS = 8_192;
const MILLI_TOKENS = 1_000;
const FALLBACK_RETRY_MS = 1_000;

const POLICIES = Object.freeze({
  profile_mutation: Object.freeze({ capacity: 8, refillPerSecond: 2, cost: 1, ttlMs: 30_000 }),
  profile_selection: Object.freeze({ capacity: 16, refillPerSecond: 4, cost: 1, ttlMs: 30_000 }),
}) satisfies Readonly<Record<IdentityLimitedProfileOperation, AsterRedisTokenBucketPolicy>>;

interface LocalBucket {
  readonly tokens: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
}

type LocalAdmission =
  | Readonly<{ status: "allowed" }>
  | Readonly<{ status: "rejected"; retryAfterMs: number }>
  | Readonly<{ status: "capacity" }>;

export interface IdentityProfileOperationLimiterOptions {
  readonly environment: "local" | "test" | "development" | "staging" | "production";
  readonly redis?: Pick<AsterRedisAdapter, "consumeTokenBucket"> &
    Partial<Pick<AsterRedisAdapter, "connect" | "snapshot">>;
  readonly digest: (value: string) => string;
  readonly monotonicNow?: () => number;
  readonly recordMetric?: (input: AsterOperationLimitMetricInput) => unknown;
}

function elapsed(startedAt: number, now: number): number {
  return Number.isFinite(now) && now >= startedAt ? now - startedAt : 0;
}

function cancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

function bucketKey(
  environment: IdentityProfileOperationLimiterOptions["environment"],
  operation: IdentityLimitedProfileOperation,
  accountDigest: string,
): string {
  return `aster:${environment}:identity:rate:v1:${operation}:${accountDigest}:bucket`;
}

function admissionKey(
  environment: IdentityProfileOperationLimiterOptions["environment"],
  operation: IdentityLimitedProfileOperation,
  accountDigest: string,
  admissionDigest: string,
): string {
  return `aster:${environment}:identity:rate:v1:${operation}:${accountDigest}:admission:${admissionDigest}`;
}

export function createIdentityProfileOperationLimiter(
  options: IdentityProfileOperationLimiterOptions,
) {
  const now = options.monotonicNow ?? (() => performance.now());
  const partitions = new Map<string, LocalBucket>();
  const localAdmissions = new Map<string, number>();
  let nextLocalAdmissionExpiry = Number.POSITIVE_INFINITY;
  let closed = false;

  const record = (
    operation: IdentityLimitedProfileOperation,
    outcome: AsterOperationLimitMetricInput["outcome"],
    startedAt: number,
  ): void => {
    try {
      options.recordMetric?.({
        limiter: "rate",
        operation,
        outcome,
        durationMs: elapsed(startedAt, now()),
      });
    } catch {
      // Telemetry cannot alter an admission decision.
    }
  };

  const pruneLocalAdmissions = (timestamp: number): void => {
    if (timestamp < nextLocalAdmissionExpiry) {
      return;
    }
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const [key, expiresAt] of localAdmissions) {
      if (timestamp >= expiresAt) {
        localAdmissions.delete(key);
      } else {
        nextExpiry = Math.min(nextExpiry, expiresAt);
      }
    }
    nextLocalAdmissionExpiry = nextExpiry;
  };

  const rememberLocalAdmission = (admission: string, expiresAt: number): void => {
    localAdmissions.set(admission, expiresAt);
    nextLocalAdmissionExpiry = Math.min(nextLocalAdmissionExpiry, expiresAt);
  };

  const localAdmission = (
    partition: string,
    admission: string,
    policy: AsterRedisTokenBucketPolicy,
    timestamp: number,
  ): LocalAdmission => {
    for (const [key, bucket] of partitions) {
      if (timestamp >= bucket.expiresAt) {
        partitions.delete(key);
      }
    }
    pruneLocalAdmissions(timestamp);
    if (localAdmissions.has(admission)) {
      return { status: "allowed" };
    }
    if (localAdmissions.size >= MAXIMUM_LOCAL_ADMISSIONS) {
      return { status: "capacity" };
    }
    const previous = partitions.get(partition);
    if (!previous && partitions.size >= MAXIMUM_PARTITIONS) {
      return { status: "capacity" };
    }
    if (previous) {
      partitions.delete(partition);
    }
    const reset = !previous || timestamp < previous.updatedAt || timestamp >= previous.expiresAt;
    const sincePrevious = reset ? 0 : timestamp - previous.updatedAt;
    const available = reset
      ? policy.capacity * MILLI_TOKENS
      : Math.min(
          policy.capacity * MILLI_TOKENS,
          previous.tokens + Math.floor(sincePrevious * policy.refillPerSecond),
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
      rememberLocalAdmission(admission, timestamp + policy.ttlMs);
    }
    return allowed
      ? { status: "allowed" }
      : {
          status: "rejected",
          retryAfterMs: Math.max(
            1,
            Math.min(policy.ttlMs, Math.ceil((cost - remaining) / policy.refillPerSecond)),
          ),
        };
  };

  const distributedAdmission = async (
    operation: IdentityLimitedProfileOperation,
    accountDigest: string,
    admissionDigest: string,
    signal: AbortSignal,
  ): Promise<AsterRedisTokenBucketResult | null> => {
    if (!options.redis) {
      return null;
    }
    try {
      if (options.redis.connect && options.redis.snapshot && !options.redis.snapshot().ready) {
        const connected = await options.redis.connect(signal);
        if (connected.status !== "completed") {
          return connected.status === "aborted" ? { status: "aborted" } : { status: "unavailable" };
        }
      }
      return await options.redis.consumeTokenBucket(
        bucketKey(options.environment, operation, accountDigest),
        admissionKey(options.environment, operation, accountDigest, admissionDigest),
        POLICIES[operation],
        signal,
      );
    } catch {
      return { status: "unavailable" };
    }
  };

  return Object.freeze({
    async admit(
      operation: IdentityLimitedProfileOperation,
      accountId: string,
      admissionId: string,
      signal: AbortSignal,
    ): Promise<IdentityProfileOperationAdmission> {
      const startedAt = now();
      if (closed) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      if (signal.aborted) {
        record(operation, "cancelled", startedAt);
        return { status: "cancelled" };
      }
      if (!Number.isFinite(startedAt) || startedAt < 0) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      const accountDigest = profileIdentifier(accountId) ? options.digest(accountId) : "";
      if (!/^[a-f0-9]{64}$/u.test(accountDigest) || !/^[a-f0-9]{64}$/u.test(admissionId)) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      const distributed = await distributedAdmission(operation, accountDigest, admissionId, signal);
      if (cancelled(signal) || distributed?.status === "aborted") {
        record(operation, "cancelled", startedAt);
        return { status: "cancelled" };
      }
      if (distributed?.status === "completed") {
        const timestamp = now();
        if (Number.isFinite(timestamp) && timestamp >= 0) {
          pruneLocalAdmissions(timestamp);
          const localAdmissionId = `${operation}:${accountDigest}:${admissionId}`;
          if (
            distributed.allowed &&
            (localAdmissions.has(localAdmissionId) ||
              localAdmissions.size < MAXIMUM_LOCAL_ADMISSIONS)
          ) {
            rememberLocalAdmission(localAdmissionId, timestamp + POLICIES[operation].ttlMs);
          }
        }
        record(
          operation,
          distributed.recovered ? "recovered" : distributed.allowed ? "allowed" : "rejected",
          startedAt,
        );
        return distributed.allowed
          ? { status: "allowed" }
          : { status: "rejected", retryAfterMs: distributed.retryAfterMs };
      }
      const timestamp = now();
      if (!Number.isFinite(timestamp) || timestamp < 0) {
        record(operation, "closed", startedAt);
        return { status: "unavailable" };
      }
      const local = localAdmission(
        `${operation}:${accountDigest}`,
        `${operation}:${accountDigest}:${admissionId}`,
        POLICIES[operation],
        timestamp,
      );
      if (local.status === "rejected") {
        record(operation, "rejected", startedAt);
        return local;
      }
      if (local.status === "capacity") {
        record(operation, "rejected", startedAt);
        return { status: "rejected", retryAfterMs: FALLBACK_RETRY_MS };
      }
      record(operation, "local_fallback", startedAt);
      return { status: "allowed" };
    },
    snapshot: () =>
      Object.freeze({
        closed,
        partitions: partitions.size,
        maximumPartitions: MAXIMUM_PARTITIONS,
        localAdmissions: localAdmissions.size,
        maximumLocalAdmissions: MAXIMUM_LOCAL_ADMISSIONS,
      }),
    close(): void {
      closed = true;
      partitions.clear();
      localAdmissions.clear();
      nextLocalAdmissionExpiry = Number.POSITIVE_INFINITY;
    },
  });
}
