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
  "identity",
  "catalog",
  "playback",
  "media_worker",
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
  "process",
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
  "profile_mutation",
  "profile_selection",
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

export const ASTER_CIRCUIT_BREAKER_OPERATIONS = Object.freeze([
  "playback_publication",
  "discovery_snapshot",
  "discovery_export",
] as const);

export const ASTER_CIRCUIT_BREAKER_STATES = Object.freeze(["closed", "open", "half_open"] as const);

export const ASTER_CIRCUIT_BREAKER_EVENTS = Object.freeze([
  "success",
  "failure",
  "ignored",
  "ignored_stale",
  "opened",
  "rejected_open",
  "half_opened",
  "rejected_half_open",
  "closed",
  "reopened",
] as const);

export const ASTER_POSTGRES_POOL_ROLES = Object.freeze([
  "primary",
  "projection",
  "relay",
  "consumer",
  "operator",
] as const);

export const ASTER_POSTGRES_POOL_STATES = Object.freeze(["open", "closing", "closed"] as const);

export const ASTER_EVENT_OWNERS = Object.freeze(["identity", "catalog", "engagement"] as const);
export const ASTER_EVENT_STAGES = Object.freeze(["publish", "consume"] as const);

export const ASTER_PRODUCT_OPERATIONS = Object.freeze([
  "playback_session",
  "progress_write",
  "media_processing",
  "media_publication",
] as const);

export const ASTER_PRODUCT_OUTCOMES = Object.freeze([
  "completed",
  "stale",
  "conflict",
  "not_playable",
  "rejected",
  "cancelled",
  "unavailable",
  "indeterminate",
  "failed",
] as const);

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
export type AsterCircuitBreakerOperation = (typeof ASTER_CIRCUIT_BREAKER_OPERATIONS)[number];
export type AsterCircuitBreakerState = (typeof ASTER_CIRCUIT_BREAKER_STATES)[number];
export type AsterCircuitBreakerEvent = (typeof ASTER_CIRCUIT_BREAKER_EVENTS)[number];
export type AsterPostgresPoolRole = (typeof ASTER_POSTGRES_POOL_ROLES)[number];
export type AsterPostgresPoolState = (typeof ASTER_POSTGRES_POOL_STATES)[number];
export type AsterEventOwner = (typeof ASTER_EVENT_OWNERS)[number];
export type AsterEventStage = (typeof ASTER_EVENT_STAGES)[number];
export type AsterProductOperation = (typeof ASTER_PRODUCT_OPERATIONS)[number];
export type AsterProductOutcome = (typeof ASTER_PRODUCT_OUTCOMES)[number];

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
  readonly maxActiveSpans?: number;
  readonly cardinalityLimit?: number;
}

export interface AsterTraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: 0 | 1;
  readonly traceparent: string;
}

export interface AsterHttpObservationInput {
  readonly method: AsterHttpMethod;
  readonly route: AsterHttpRoute;
  readonly traceparent?: string;
}

export interface AsterHttpCompletion {
  readonly outcome: AsterObservationOutcome;
  readonly statusCode: number;
}

export interface AsterDependencyObservationInput {
  readonly dependency: AsterDependency;
  readonly operation: AsterDependencyOperation;
  readonly linkedTraceparent?: string;
}

export interface AsterEventProductionObservationInput {
  readonly owner: "catalog";
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
  readonly run?: <T>(operation: () => T) => T;
  readonly traceContext?: () => AsterTraceContext;
}

export interface AsterDependencyObservation {
  complete(completion: AsterDependencyCompletion): AsterObservationCompletionResult;
  readonly run?: <T>(operation: () => T) => T;
  readonly traceContext?: () => AsterTraceContext;
}

export type AsterEventProductionObservation = AsterDependencyObservation;

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

export type AsterStartEventProductionObservationResult =
  | Readonly<{ status: "started"; observation: AsterEventProductionObservation }>
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

export interface AsterCircuitBreakerMetricInput {
  readonly dependency: "catalog";
  readonly operation: AsterCircuitBreakerOperation;
  readonly state: AsterCircuitBreakerState;
  readonly event: AsterCircuitBreakerEvent;
}

export interface AsterPostgresPoolMetricInput {
  readonly pool: AsterPostgresPoolRole;
  readonly state: AsterPostgresPoolState;
  readonly maximum: number;
  readonly total: number;
  readonly idle: number;
  readonly reserved: number;
  readonly waiting: number;
}

export interface AsterEventDeliveryMetricInput {
  readonly owner: AsterEventOwner;
  readonly stage: AsterEventStage;
  readonly outcome: AsterObservationOutcome;
  readonly ageMs?: number;
}

export interface AsterProductMetricInput {
  readonly operation: AsterProductOperation;
  readonly outcome: AsterProductOutcome;
  readonly durationMs: number;
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

export interface AsterCollectedTrace {
  readonly name: "aster.dependency.operation" | "aster.event.produce" | "aster.http.server";
  readonly kind: "client" | "consumer" | "producer" | "server";
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly links?: readonly Readonly<{ traceId: string; spanId: string }>[];
  readonly traceFlags: 0 | 1;
  readonly status: "error" | "ok" | "unset";
  readonly attributes: Readonly<Record<string, string>>;
}

export type AsterTraceCollectionResult =
  | Readonly<{
      status: "collected";
      traces: readonly AsterCollectedTrace[];
      droppedSpans: number;
    }>
  | Readonly<{ status: "unavailable"; reason: "telemetry_closed" }>
  | Readonly<{ status: "failed" }>;

export type AsterMetricCollectionResult =
  | Readonly<{ status: "collected"; metrics: readonly AsterCollectedMetric[] }>
  | Readonly<{ status: "unavailable"; reason: "remote_export" | "telemetry_closed" }>
  | Readonly<{ status: "failed" }>;

export interface AsterTelemetry {
  startHttpRequest(input: AsterHttpObservationInput): AsterStartHttpObservationResult;
  startDependencyOperation(
    input: AsterDependencyObservationInput,
  ): AsterStartDependencyObservationResult;
  startEventProduction(
    input: AsterEventProductionObservationInput,
  ): AsterStartEventProductionObservationResult;
  recordDiscoveryRail?(input: AsterDiscoveryRailMetricInput): AsterRecordMetricResult;
  recordDiscoverySearchSample?(input: AsterDiscoverySearchSampleInput): AsterRecordMetricResult;
  recordCacheOperation?(input: AsterCacheMetricInput): AsterRecordMetricResult;
  recordOperationLimit?(input: AsterOperationLimitMetricInput): AsterRecordMetricResult;
  recordCircuitBreaker?(input: AsterCircuitBreakerMetricInput): AsterRecordMetricResult;
  recordPostgresPool?(input: AsterPostgresPoolMetricInput): AsterRecordMetricResult;
  recordEventDelivery?(input: AsterEventDeliveryMetricInput): AsterRecordMetricResult;
  recordProductOperation?(input: AsterProductMetricInput): AsterRecordMetricResult;
  collect(): Promise<AsterMetricCollectionResult>;
  activeTraceContext(): AsterTraceContext | undefined;
  collectTraces(): Promise<AsterTraceCollectionResult>;
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
