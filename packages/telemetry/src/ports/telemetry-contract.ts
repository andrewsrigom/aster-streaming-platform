export const ASTER_TELEMETRY_ENVIRONMENTS = Object.freeze([
  "local",
  "test",
  "development",
  "staging",
  "production",
] as const);

export const ASTER_HTTP_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const);

export const ASTER_HTTP_ROUTES = Object.freeze([
  "/graphql",
  "/health/live",
  "/health/ready",
] as const);

export const ASTER_DEPENDENCIES = Object.freeze([
  "postgresql",
  "redis",
  "broker",
  "object_storage",
  "telemetry",
] as const);

export const ASTER_DEPENDENCY_OPERATIONS = Object.freeze([
  "connect",
  "probe",
  "query",
  "command",
  "publish",
  "consume",
  "read",
  "write",
  "delete",
  "export",
  "flush",
] as const);

export const ASTER_OBSERVATION_OUTCOMES = Object.freeze([
  "success",
  "timeout",
  "cancelled",
  "unavailable",
  "rejected",
  "error",
] as const);

export const ASTER_DISCOVERY_RAIL_KINDS = Object.freeze([
  "featured",
  "recently_added",
  "trending",
  "genre",
] as const);

export const ASTER_DISCOVERY_RAIL_OUTCOMES = Object.freeze([
  "completed",
  "empty",
  "fallback",
  "stale",
  "unavailable",
  "cancelled",
  "indeterminate",
] as const);

export const ASTER_CACHE_FAMILIES = Object.freeze([
  "catalog_public_title",
  "discovery_rail",
] as const);

export const ASTER_CACHE_OUTCOMES = Object.freeze([
  "hit",
  "stale_hit",
  "negative_hit",
  "miss",
  "malformed",
  "bypass",
  "source_load",
  "refresh_failed",
  "fence_changed",
  "coalesced",
  "lease_acquired",
  "lease_contended",
  "lease_lost",
] as const);

export const ASTER_CACHE_WAITER_BUCKETS = Object.freeze([
  "one",
  "two_to_four",
  "five_plus",
] as const);

export const ASTER_OPERATION_LIMITERS = Object.freeze(["rate", "concurrency"] as const);

export const ASTER_LIMITED_OPERATIONS = Object.freeze([
  "record_progress",
  "set_watchlist",
  "search_titles",
] as const);

export const ASTER_OPERATION_LIMIT_OUTCOMES = Object.freeze([
  "allowed",
  "rejected",
  "local_fallback",
  "recovered",
  "queued",
  "cancelled",
  "closed",
] as const);

export const ASTER_OPERATION_LIMIT_QUEUE_BUCKETS = Object.freeze(["none", "one"] as const);

export type AsterTelemetryEnvironment = (typeof ASTER_TELEMETRY_ENVIRONMENTS)[number];
export type AsterHttpMethod = (typeof ASTER_HTTP_METHODS)[number];
export type AsterHttpRoute = (typeof ASTER_HTTP_ROUTES)[number];
export type AsterDependency = (typeof ASTER_DEPENDENCIES)[number];
export type AsterDependencyOperation = (typeof ASTER_DEPENDENCY_OPERATIONS)[number];
export type AsterObservationOutcome = (typeof ASTER_OBSERVATION_OUTCOMES)[number];
export type AsterDiscoveryRailKind = (typeof ASTER_DISCOVERY_RAIL_KINDS)[number];
export type AsterDiscoveryRailOutcome = (typeof ASTER_DISCOVERY_RAIL_OUTCOMES)[number];
export type AsterCacheFamily = (typeof ASTER_CACHE_FAMILIES)[number];
export type AsterCacheOutcome = (typeof ASTER_CACHE_OUTCOMES)[number];
export type AsterCacheWaiterBucket = (typeof ASTER_CACHE_WAITER_BUCKETS)[number];
export type AsterOperationLimiter = (typeof ASTER_OPERATION_LIMITERS)[number];
export type AsterLimitedOperation = (typeof ASTER_LIMITED_OPERATIONS)[number];
export type AsterOperationLimitOutcome = (typeof ASTER_OPERATION_LIMIT_OUTCOMES)[number];
export type AsterOperationLimitQueueBucket = (typeof ASTER_OPERATION_LIMIT_QUEUE_BUCKETS)[number];

export type AsterTelemetryExportOptions =
  | Readonly<{ mode: "none" }>
  | Readonly<{
      mode: "otlp-http";
      endpoint: string;
      intervalMs: number;
      timeoutMs: number;
    }>;

export interface AsterTelemetryOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: AsterTelemetryEnvironment;
  readonly export?: AsterTelemetryExportOptions;
  readonly monitoringPrecisionMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly maxActiveObservations?: number;
  readonly cardinalityLimit?: number;
}

export interface AsterHttpObservationInput {
  readonly method: AsterHttpMethod;
  readonly route: AsterHttpRoute;
}

export interface AsterHttpCompletion {
  readonly outcome: AsterObservationOutcome;
  readonly statusCode: number;
}

export interface AsterDependencyObservationInput {
  readonly dependency: AsterDependency;
  readonly operation: AsterDependencyOperation;
}

export interface AsterDependencyCompletion {
  readonly outcome: AsterObservationOutcome;
}

export type AsterObservationCompletionResult =
  | Readonly<{ status: "completed" }>
  | Readonly<{ status: "already_completed" }>
  | Readonly<{ status: "rejected"; reason: "invalid_completion" | "telemetry_closed" }>;

export interface AsterHttpObservation {
  complete(completion: AsterHttpCompletion): AsterObservationCompletionResult;
}

export interface AsterDependencyObservation {
  complete(completion: AsterDependencyCompletion): AsterObservationCompletionResult;
}

export type AsterStartHttpObservationResult =
  | Readonly<{ status: "started"; observation: AsterHttpObservation }>
  | Readonly<{
      status: "rejected";
      reason: "invalid_dimension" | "capacity_exceeded" | "telemetry_closed";
    }>;

export type AsterStartDependencyObservationResult =
  | Readonly<{ status: "started"; observation: AsterDependencyObservation }>
  | Readonly<{
      status: "rejected";
      reason: "invalid_dimension" | "capacity_exceeded" | "telemetry_closed";
    }>;

export type AsterTelemetryOperationResult = Readonly<{
  status: "completed" | "already_completed" | "timed_out" | "aborted" | "failed";
}>;

export interface AsterTelemetryExportHealth {
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly droppedObservations: number;
  readonly lastResult: "never" | "success" | "failure";
}

export interface AsterDiscoveryRailMetricInput {
  readonly kind: AsterDiscoveryRailKind;
  readonly outcome: AsterDiscoveryRailOutcome;
  readonly durationMs: number;
  readonly freshnessSeconds?: number;
}

export interface AsterDiscoverySearchSampleInput {
  readonly resultCount: number;
  readonly topRank: number | null;
}

export interface AsterCacheMetricInput {
  readonly cache: AsterCacheFamily;
  readonly outcome: AsterCacheOutcome;
  readonly durationMs: number;
  readonly payloadBytes?: number;
  readonly waiterBucket?: AsterCacheWaiterBucket;
}

export interface AsterOperationLimitMetricInput {
  readonly limiter: AsterOperationLimiter;
  readonly operation: AsterLimitedOperation;
  readonly outcome: AsterOperationLimitOutcome;
  readonly durationMs: number;
  readonly queueBucket?: AsterOperationLimitQueueBucket;
}

export type AsterRecordMetricResult =
  | Readonly<{ status: "recorded" }>
  | Readonly<{ status: "rejected"; reason: "invalid_dimension" | "telemetry_closed" }>;

export type AsterMetricAttributeValue = string | number | boolean;

export interface AsterCollectedMetricPoint {
  readonly attributes: Readonly<Record<string, AsterMetricAttributeValue>>;
  readonly value:
    | number
    | Readonly<{
        count: number;
        sum: number;
        min?: number;
        max?: number;
        boundaries: readonly number[];
        bucketCounts: readonly number[];
      }>;
}

export interface AsterCollectedMetric {
  readonly name: string;
  readonly description: string;
  readonly unit: string;
  readonly points: readonly AsterCollectedMetricPoint[];
}

export type AsterMetricCollectionResult =
  | Readonly<{ status: "collected"; metrics: readonly AsterCollectedMetric[] }>
  | Readonly<{ status: "unavailable"; reason: "remote_export" | "telemetry_closed" }>
  | Readonly<{ status: "failed" }>;

export interface AsterTelemetry {
  startHttpRequest(input: AsterHttpObservationInput): AsterStartHttpObservationResult;
  startDependencyOperation(
    input: AsterDependencyObservationInput,
  ): AsterStartDependencyObservationResult;
  recordDiscoveryRail?(input: AsterDiscoveryRailMetricInput): AsterRecordMetricResult;
  recordDiscoverySearchSample?(input: AsterDiscoverySearchSampleInput): AsterRecordMetricResult;
  recordCacheOperation?(input: AsterCacheMetricInput): AsterRecordMetricResult;
  recordOperationLimit?(input: AsterOperationLimitMetricInput): AsterRecordMetricResult;
  collect(): Promise<AsterMetricCollectionResult>;
  exportHealth(): AsterTelemetryExportHealth;
  forceFlush(signal?: AbortSignal): Promise<AsterTelemetryOperationResult>;
  shutdown(signal?: AbortSignal): Promise<AsterTelemetryOperationResult>;
  lifecycleHooks(): Readonly<{
    flushTelemetry(signal: AbortSignal): Promise<void>;
  }>;
}

export class AsterTelemetryConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("Invalid Aster telemetry configuration.");
    this.name = "AsterTelemetryConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}
