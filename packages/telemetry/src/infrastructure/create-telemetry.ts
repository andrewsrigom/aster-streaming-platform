import type { Attributes, BatchObservableCallback, Observable } from "@opentelemetry/api";
import { availableParallelism } from "node:os";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationType,
  DataPointType,
  MeterProvider,
  PeriodicExportingMetricReader,
  createAllowListAttributesProcessor,
  type MetricData,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import type {
  AsterCacheMetricInput,
  AsterCircuitBreakerMetricInput,
  AsterCollectedMetric,
  AsterCollectedMetricPoint,
  AsterDependencyCompletion,
  AsterDependencyObservationInput,
  AsterDiscoveryRailMetricInput,
  AsterDiscoverySearchSampleInput,
  AsterHttpCompletion,
  AsterHttpObservationInput,
  AsterMetricAttributeValue,
  AsterMetricCollectionResult,
  AsterOperationLimitMetricInput,
  AsterObservationCompletionResult,
  AsterRecordMetricResult,
  AsterStartDependencyObservationResult,
  AsterStartHttpObservationResult,
  AsterTelemetry,
  AsterTelemetryExportHealth,
  AsterTelemetryOperationResult,
  AsterTelemetryOptions,
  AsterTraceCollectionResult,
  AsterTraceContext,
} from "../ports/telemetry-contract.js";
import {
  ASTER_CACHE_FAMILIES,
  ASTER_CACHE_OUTCOMES,
  ASTER_CACHE_WAITER_BUCKETS,
  ASTER_CIRCUIT_BREAKER_EVENTS,
  ASTER_CIRCUIT_BREAKER_OPERATIONS,
  ASTER_CIRCUIT_BREAKER_STATES,
  ASTER_DISCOVERY_RAIL_KINDS,
  ASTER_DISCOVERY_RAIL_OUTCOMES,
  ASTER_LIMITED_OPERATIONS,
  ASTER_OPERATION_LIMITERS,
  ASTER_OPERATION_LIMIT_OUTCOMES,
  ASTER_OPERATION_LIMIT_QUEUE_BUCKETS,
} from "../ports/telemetry-contract.js";
import { elapsedSeconds } from "./duration.js";
import { HealthTrackingExporter, type ExportAttemptObserver } from "./health-tracking-exporter.js";
import { ManualMetricReader } from "./manual-metric-reader.js";
import { AsterTraceManager } from "./trace-manager.js";
import {
  ASTER_METRIC_CATALOG,
  CACHE_PAYLOAD_BUCKETS_BYTES,
  DEPENDENCY_DURATION_BUCKETS_SECONDS,
  DISCOVERY_FRESHNESS_BUCKETS_SECONDS,
  HTTP_DURATION_BUCKETS_SECONDS,
} from "./metric-catalog.js";
import {
  parseDependencyCompletion,
  parseDependencyObservationInput,
  parseHttpCompletion,
  parseHttpObservationInput,
  validateTelemetryOptions,
  type ValidatedTelemetryOptions,
} from "./validation.js";

const METER_NAME = "@aster/telemetry";
const METER_VERSION = "0.0.0";

type DropReason =
  | "invalid_dimension"
  | "capacity_exceeded"
  | "invalid_completion"
  | "invalid_duration"
  | "collector_failure"
  | "export_failure";

interface RuntimeClock {
  nowNanoseconds(): bigint;
  cpuUsage(): NodeJS.CpuUsage;
  uptimeSeconds(): number;
  rssBytes(): number;
  availableParallelism(): number;
}

const SYSTEM_CLOCK: RuntimeClock = Object.freeze({
  nowNanoseconds: () => process.hrtime.bigint(),
  cpuUsage: () => process.cpuUsage(),
  uptimeSeconds: () => process.uptime(),
  rssBytes: () => process.memoryUsage.rss(),
  availableParallelism: () => Math.max(1, availableParallelism()),
});

function systemClock(): RuntimeClock {
  return SYSTEM_CLOCK;
}

function statusClass(statusCode: number): "1xx" | "2xx" | "3xx" | "4xx" | "5xx" {
  return `${Math.trunc(statusCode / 100)}xx` as "1xx" | "2xx" | "3xx" | "4xx" | "5xx";
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    return undefined;
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function parseDiscoveryRail(input: unknown): AsterDiscoveryRailMetricInput | undefined {
  const keys = ["kind", "outcome", "durationMs"];
  const withFreshness = exactRecord(input, [...keys, "freshnessSeconds"]);
  const value = withFreshness ?? exactRecord(input, keys);
  if (
    !value ||
    !ASTER_DISCOVERY_RAIL_KINDS.includes(value["kind"] as never) ||
    !ASTER_DISCOVERY_RAIL_OUTCOMES.includes(value["outcome"] as never) ||
    !finite(value["durationMs"], 0, 60_000) ||
    (Object.hasOwn(value, "freshnessSeconds") && !finite(value["freshnessSeconds"], 0, 300))
  ) {
    return undefined;
  }
  return Object.freeze({
    kind: value["kind"] as AsterDiscoveryRailMetricInput["kind"],
    outcome: value["outcome"] as AsterDiscoveryRailMetricInput["outcome"],
    durationMs: value["durationMs"],
    ...(Object.hasOwn(value, "freshnessSeconds")
      ? { freshnessSeconds: value["freshnessSeconds"] as number }
      : {}),
  });
}

function parseDiscoverySearchSample(input: unknown): AsterDiscoverySearchSampleInput | undefined {
  const value = exactRecord(input, ["resultCount", "topRank"]);
  if (
    !value ||
    !Number.isSafeInteger(value["resultCount"]) ||
    !finite(value["resultCount"], 0, 20) ||
    !(
      (value["resultCount"] === 0 && value["topRank"] === null) ||
      (value["resultCount"] > 0 &&
        Number.isSafeInteger(value["topRank"]) &&
        finite(value["topRank"], 0, 1_000_000))
    )
  ) {
    return undefined;
  }
  return Object.freeze({
    resultCount: value["resultCount"],
    topRank: value["topRank"],
  });
}

function parseCacheMetric(input: unknown): AsterCacheMetricInput | undefined {
  const required = ["cache", "outcome", "durationMs"];
  const value =
    exactRecord(input, required) ??
    exactRecord(input, [...required, "payloadBytes"]) ??
    exactRecord(input, [...required, "waiterBucket"]) ??
    exactRecord(input, [...required, "payloadBytes", "waiterBucket"]);
  if (
    !value ||
    !ASTER_CACHE_FAMILIES.includes(value["cache"] as never) ||
    !ASTER_CACHE_OUTCOMES.includes(value["outcome"] as never) ||
    !finite(value["durationMs"], 0, 60_000) ||
    (Object.hasOwn(value, "payloadBytes") &&
      (!Number.isSafeInteger(value["payloadBytes"]) ||
        !finite(value["payloadBytes"], 0, 16_384))) ||
    (Object.hasOwn(value, "waiterBucket") &&
      (!ASTER_CACHE_WAITER_BUCKETS.includes(value["waiterBucket"] as never) ||
        value["outcome"] !== "coalesced"))
  ) {
    return undefined;
  }
  return Object.freeze({
    cache: value["cache"] as AsterCacheMetricInput["cache"],
    outcome: value["outcome"] as AsterCacheMetricInput["outcome"],
    durationMs: value["durationMs"],
    ...(Object.hasOwn(value, "payloadBytes")
      ? { payloadBytes: value["payloadBytes"] as number }
      : {}),
    ...(Object.hasOwn(value, "waiterBucket")
      ? {
          waiterBucket: value["waiterBucket"] as Exclude<
            AsterCacheMetricInput["waiterBucket"],
            undefined
          >,
        }
      : {}),
  });
}

function parseOperationLimitMetric(input: unknown): AsterOperationLimitMetricInput | undefined {
  const required = ["limiter", "operation", "outcome", "durationMs"];
  const value = exactRecord(input, required) ?? exactRecord(input, [...required, "queueBucket"]);
  if (
    !value ||
    !ASTER_OPERATION_LIMITERS.includes(value["limiter"] as never) ||
    !ASTER_LIMITED_OPERATIONS.includes(value["operation"] as never) ||
    !ASTER_OPERATION_LIMIT_OUTCOMES.includes(value["outcome"] as never) ||
    !finite(value["durationMs"], 0, 60_000) ||
    (Object.hasOwn(value, "queueBucket") &&
      !ASTER_OPERATION_LIMIT_QUEUE_BUCKETS.includes(value["queueBucket"] as never)) ||
    (value["limiter"] === "rate" && Object.hasOwn(value, "queueBucket")) ||
    (value["limiter"] === "concurrency" && value["operation"] !== "search_titles") ||
    (value["limiter"] === "rate" && value["operation"] === "search_titles")
  ) {
    return undefined;
  }
  return Object.freeze({
    limiter: value["limiter"] as AsterOperationLimitMetricInput["limiter"],
    operation: value["operation"] as AsterOperationLimitMetricInput["operation"],
    outcome: value["outcome"] as AsterOperationLimitMetricInput["outcome"],
    durationMs: value["durationMs"],
    ...(Object.hasOwn(value, "queueBucket")
      ? {
          queueBucket: value["queueBucket"] as Exclude<
            AsterOperationLimitMetricInput["queueBucket"],
            undefined
          >,
        }
      : {}),
  });
}

function parseCircuitBreakerMetric(input: unknown): AsterCircuitBreakerMetricInput | undefined {
  const value = exactRecord(input, ["dependency", "operation", "state", "event"]);
  if (
    !value ||
    value["dependency"] !== "catalog" ||
    !ASTER_CIRCUIT_BREAKER_OPERATIONS.includes(value["operation"] as never) ||
    !ASTER_CIRCUIT_BREAKER_STATES.includes(value["state"] as never) ||
    !ASTER_CIRCUIT_BREAKER_EVENTS.includes(value["event"] as never)
  ) {
    return undefined;
  }
  return Object.freeze({
    dependency: "catalog",
    operation: value["operation"] as AsterCircuitBreakerMetricInput["operation"],
    state: value["state"] as AsterCircuitBreakerMetricInput["state"],
    event: value["event"] as AsterCircuitBreakerMetricInput["event"],
  });
}

function frozenHealth(
  attempts: number,
  successes: number,
  failures: number,
  droppedObservations: number,
  lastResult: AsterTelemetryExportHealth["lastResult"],
): AsterTelemetryExportHealth {
  return Object.freeze({ attempts, successes, failures, droppedObservations, lastResult });
}

function safeAttributes(
  attributes: Attributes,
): Readonly<Record<string, AsterMetricAttributeValue>> {
  const result: Record<string, AsterMetricAttributeValue> = Object.create(null) as Record<
    string,
    AsterMetricAttributeValue
  >;
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return Object.freeze(result);
}

function mapMetricPoint(metric: MetricData): readonly AsterCollectedMetricPoint[] {
  if (metric.dataPointType === DataPointType.EXPONENTIAL_HISTOGRAM) {
    return Object.freeze([]);
  }
  if (metric.dataPointType === DataPointType.HISTOGRAM) {
    return Object.freeze(
      metric.dataPoints.map((point) => {
        const value = point.value;
        return Object.freeze({
          attributes: safeAttributes(point.attributes),
          value: Object.freeze({
            count: value.count,
            sum: value.sum ?? 0,
            ...(value.min === undefined ? {} : { min: value.min }),
            ...(value.max === undefined ? {} : { max: value.max }),
            boundaries: Object.freeze([...value.buckets.boundaries]),
            bucketCounts: Object.freeze([...value.buckets.counts]),
          }),
        });
      }),
    );
  }
  return Object.freeze(
    metric.dataPoints.map((point) => {
      return Object.freeze({
        attributes: safeAttributes(point.attributes),
        value: point.value,
      });
    }),
  );
}

function mapMetrics(resourceMetrics: ResourceMetrics): readonly AsterCollectedMetric[] {
  const metrics: AsterCollectedMetric[] = [];
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      metrics.push(
        Object.freeze({
          name: metric.descriptor.name,
          description: metric.descriptor.description,
          unit: metric.descriptor.unit,
          points: mapMetricPoint(metric),
        }),
      );
    }
  }
  return Object.freeze(metrics);
}

function boundedOperation(
  operation: Promise<void>,
  timeoutMs: number,
): Promise<AsterTelemetryOperationResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: AsterTelemetryOperationResult["status"]): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(Object.freeze({ status }));
    };
    const timeout = setTimeout(() => {
      finish("timed_out");
    }, timeoutMs);
    timeout.unref();
    operation.then(
      () => {
        finish("completed");
      },
      () => {
        finish("failed");
      },
    );
  });
}

function joinOperation(
  operation: Promise<AsterTelemetryOperationResult>,
  signal?: AbortSignal,
): Promise<AsterTelemetryOperationResult> {
  if (signal === undefined) {
    return operation;
  }
  if (signal.aborted) {
    return Promise.resolve(Object.freeze({ status: "aborted" }));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: AsterTelemetryOperationResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish(Object.freeze({ status: "aborted" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(finish, () => {
      finish(Object.freeze({ status: "failed" }));
    });
  });
}

async function settleTelemetryOperations(operations: readonly Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Telemetry operation failed.");
  }
}

class AsterTelemetryImplementation implements AsterTelemetry, ExportAttemptObserver {
  private readonly provider: MeterProvider;
  private readonly traces: AsterTraceManager;
  private readonly runtimeInstrumentation: RuntimeNodeInstrumentation;
  private readonly manualReader: ManualMetricReader | undefined;
  private readonly shutdownTimeoutMs: number;
  private readonly maxActiveObservations: number;
  private readonly clock: RuntimeClock;
  private readonly httpDuration;
  private readonly httpActive;
  private readonly dependencyDuration;
  private readonly dependencyActive;
  private readonly dependencyOutcomes;
  private readonly dropped;
  private readonly exportAttempts;
  private readonly discoveryRailDuration;
  private readonly discoveryRailOutcomes;
  private readonly discoveryRailFreshness;
  private readonly discoverySearchQualitySamples;
  private readonly cacheDuration;
  private readonly cacheOutcomes;
  private readonly cachePayloadBytes;
  private readonly operationLimitDuration;
  private readonly operationLimitOutcomes;
  private readonly circuitBreakerEvents;
  private readonly runtimeCallback: BatchObservableCallback;
  private readonly runtimeObservables: Observable[];
  private activeObservations = 0;
  private closed = false;
  private flushOperation: Promise<AsterTelemetryOperationResult> | undefined;
  private shutdownOperation: Promise<AsterTelemetryOperationResult> | undefined;
  private shutdownResult: AsterTelemetryOperationResult | undefined;
  private exportAttemptCount = 0;
  private exportSuccessCount = 0;
  private exportFailureCount = 0;
  private droppedObservationCount = 0;
  private lastExportResult: AsterTelemetryExportHealth["lastResult"] = "never";

  constructor(options: ValidatedTelemetryOptions) {
    this.shutdownTimeoutMs = options.shutdownTimeoutMs;
    this.maxActiveObservations = options.maxActiveObservations;
    this.clock = systemClock();
    this.traces = new AsterTraceManager(options, this);

    const resource = resourceFromAttributes({
      "service.name": options.serviceName,
      "service.version": options.serviceVersion,
      "deployment.environment.name": options.environment,
    });

    let readers;
    if (options.export.mode === "none") {
      this.manualReader = new ManualMetricReader(options.cardinalityLimit);
      readers = [this.manualReader];
    } else {
      const delegate = new OTLPMetricExporter({
        url: options.export.endpoint,
        timeoutMillis: options.export.timeoutMs,
        concurrencyLimit: 1,
      });
      const exporter = new HealthTrackingExporter(delegate, options.export.timeoutMs, this);
      readers = [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: options.export.intervalMs,
          exportTimeoutMillis: options.export.timeoutMs,
          cardinalityLimits: { default: options.cardinalityLimit },
          maxExportBatchSize: options.cardinalityLimit,
        }),
      ];
    }

    this.provider = new MeterProvider({
      resource,
      readers,
      views: [
        {
          instrumentName: ASTER_METRIC_CATALOG.httpDuration.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: { boundaries: [...HTTP_DURATION_BUCKETS_SECONDS], recordMinMax: true },
          },
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "http.request.method",
              "http.route",
              "http.response.status_class",
              "aster.outcome",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.dependencyDuration.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: { boundaries: [...DEPENDENCY_DURATION_BUCKETS_SECONDS], recordMinMax: true },
          },
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "aster.dependency",
              "aster.operation",
              "aster.outcome",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.discoveryRailDuration.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: { boundaries: [...HTTP_DURATION_BUCKETS_SECONDS], recordMinMax: true },
          },
          attributesProcessors: [
            createAllowListAttributesProcessor(["aster.discovery.rail", "aster.outcome"]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.discoveryRailFreshness.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: {
              boundaries: [...DISCOVERY_FRESHNESS_BUCKETS_SECONDS],
              recordMinMax: true,
            },
          },
          attributesProcessors: [createAllowListAttributesProcessor(["aster.discovery.rail"])],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.discoveryRailOutcomes.name,
          attributesProcessors: [
            createAllowListAttributesProcessor(["aster.discovery.rail", "aster.outcome"]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.discoverySearchQualitySamples.name,
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "aster.discovery.result_bucket",
              "aster.discovery.top_rank_bucket",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.cacheDuration.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: { boundaries: [...DEPENDENCY_DURATION_BUCKETS_SECONDS], recordMinMax: true },
          },
          attributesProcessors: [
            createAllowListAttributesProcessor(["aster.cache", "aster.outcome"]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.cacheOutcomes.name,
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "aster.cache",
              "aster.outcome",
              "aster.cache.waiters",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.cachePayloadBytes.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: { boundaries: [...CACHE_PAYLOAD_BUCKETS_BYTES], recordMinMax: true },
          },
          attributesProcessors: [
            createAllowListAttributesProcessor(["aster.cache", "aster.outcome"]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.operationLimitDuration.name,
          aggregation: {
            type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
            options: { boundaries: [...DEPENDENCY_DURATION_BUCKETS_SECONDS], recordMinMax: true },
          },
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "aster.limiter",
              "aster.operation",
              "aster.outcome",
              "aster.limit.queue",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.operationLimitOutcomes.name,
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "aster.limiter",
              "aster.operation",
              "aster.outcome",
              "aster.limit.queue",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
        {
          instrumentName: ASTER_METRIC_CATALOG.circuitBreakerEvents.name,
          attributesProcessors: [
            createAllowListAttributesProcessor([
              "aster.dependency",
              "aster.circuit_breaker.operation",
              "aster.circuit_breaker.state",
              "aster.circuit_breaker.event",
            ]),
          ],
          aggregationCardinalityLimit: options.cardinalityLimit,
        },
      ],
    });

    const meter = this.provider.getMeter(METER_NAME, METER_VERSION);
    this.httpDuration = meter.createHistogram(
      ASTER_METRIC_CATALOG.httpDuration.name,
      ASTER_METRIC_CATALOG.httpDuration,
    );
    this.httpActive = meter.createUpDownCounter(
      ASTER_METRIC_CATALOG.httpActive.name,
      ASTER_METRIC_CATALOG.httpActive,
    );
    this.dependencyDuration = meter.createHistogram(
      ASTER_METRIC_CATALOG.dependencyDuration.name,
      ASTER_METRIC_CATALOG.dependencyDuration,
    );
    this.dependencyActive = meter.createUpDownCounter(
      ASTER_METRIC_CATALOG.dependencyActive.name,
      ASTER_METRIC_CATALOG.dependencyActive,
    );
    this.dependencyOutcomes = meter.createCounter(
      ASTER_METRIC_CATALOG.dependencyOutcomes.name,
      ASTER_METRIC_CATALOG.dependencyOutcomes,
    );
    this.dropped = meter.createCounter(
      ASTER_METRIC_CATALOG.droppedObservations.name,
      ASTER_METRIC_CATALOG.droppedObservations,
    );
    this.exportAttempts = meter.createCounter(
      ASTER_METRIC_CATALOG.exportAttempts.name,
      ASTER_METRIC_CATALOG.exportAttempts,
    );
    this.discoveryRailDuration = meter.createHistogram(
      ASTER_METRIC_CATALOG.discoveryRailDuration.name,
      ASTER_METRIC_CATALOG.discoveryRailDuration,
    );
    this.discoveryRailOutcomes = meter.createCounter(
      ASTER_METRIC_CATALOG.discoveryRailOutcomes.name,
      ASTER_METRIC_CATALOG.discoveryRailOutcomes,
    );
    this.discoveryRailFreshness = meter.createHistogram(
      ASTER_METRIC_CATALOG.discoveryRailFreshness.name,
      ASTER_METRIC_CATALOG.discoveryRailFreshness,
    );
    this.discoverySearchQualitySamples = meter.createCounter(
      ASTER_METRIC_CATALOG.discoverySearchQualitySamples.name,
      ASTER_METRIC_CATALOG.discoverySearchQualitySamples,
    );
    this.cacheDuration = meter.createHistogram(
      ASTER_METRIC_CATALOG.cacheDuration.name,
      ASTER_METRIC_CATALOG.cacheDuration,
    );
    this.cacheOutcomes = meter.createCounter(
      ASTER_METRIC_CATALOG.cacheOutcomes.name,
      ASTER_METRIC_CATALOG.cacheOutcomes,
    );
    this.cachePayloadBytes = meter.createHistogram(
      ASTER_METRIC_CATALOG.cachePayloadBytes.name,
      ASTER_METRIC_CATALOG.cachePayloadBytes,
    );
    this.operationLimitDuration = meter.createHistogram(
      ASTER_METRIC_CATALOG.operationLimitDuration.name,
      ASTER_METRIC_CATALOG.operationLimitDuration,
    );
    this.operationLimitOutcomes = meter.createCounter(
      ASTER_METRIC_CATALOG.operationLimitOutcomes.name,
      ASTER_METRIC_CATALOG.operationLimitOutcomes,
    );
    this.circuitBreakerEvents = meter.createCounter(
      ASTER_METRIC_CATALOG.circuitBreakerEvents.name,
      ASTER_METRIC_CATALOG.circuitBreakerEvents,
    );

    const processCpuTime = meter.createObservableCounter(
      ASTER_METRIC_CATALOG.processCpuTime.name,
      ASTER_METRIC_CATALOG.processCpuTime,
    );
    const processCpuUtilization = meter.createObservableGauge(
      ASTER_METRIC_CATALOG.processCpuUtilization.name,
      ASTER_METRIC_CATALOG.processCpuUtilization,
    );
    const processMemoryUsage = meter.createObservableUpDownCounter(
      ASTER_METRIC_CATALOG.processMemoryUsage.name,
      ASTER_METRIC_CATALOG.processMemoryUsage,
    );
    const processUptime = meter.createObservableGauge(
      ASTER_METRIC_CATALOG.processUptime.name,
      ASTER_METRIC_CATALOG.processUptime,
    );
    this.runtimeObservables = [
      processCpuTime,
      processCpuUtilization,
      processMemoryUsage,
      processUptime,
    ];

    let priorCpu = this.clock.cpuUsage();
    let priorTime = this.clock.nowNanoseconds();
    this.runtimeCallback = (observableResult) => {
      try {
        const currentCpu = this.clock.cpuUsage();
        const currentTime = this.clock.nowNanoseconds();
        const elapsed = elapsedSeconds(priorTime, currentTime);
        const cpuCount = this.clock.availableParallelism();
        const userSeconds = currentCpu.user / 1_000_000;
        const systemSeconds = currentCpu.system / 1_000_000;
        observableResult.observe(processCpuTime, userSeconds, { "cpu.mode": "user" });
        observableResult.observe(processCpuTime, systemSeconds, { "cpu.mode": "system" });
        if (
          elapsed !== undefined &&
          elapsed > 0 &&
          Number.isSafeInteger(cpuCount) &&
          cpuCount > 0
        ) {
          const denominator = elapsed * cpuCount * 1_000_000;
          const userUtilization = Math.min(
            1,
            Math.max(0, (currentCpu.user - priorCpu.user) / denominator),
          );
          const systemUtilization = Math.min(
            1,
            Math.max(0, (currentCpu.system - priorCpu.system) / denominator),
          );
          observableResult.observe(processCpuUtilization, userUtilization, { "cpu.mode": "user" });
          observableResult.observe(processCpuUtilization, systemUtilization, {
            "cpu.mode": "system",
          });
        }
        observableResult.observe(processMemoryUsage, this.clock.rssBytes());
        observableResult.observe(processUptime, this.clock.uptimeSeconds());
        priorCpu = currentCpu;
        priorTime = currentTime;
      } catch {
        this.recordDrop("collector_failure");
      }
    };
    meter.addBatchObservableCallback(this.runtimeCallback, this.runtimeObservables);

    this.runtimeInstrumentation = new RuntimeNodeInstrumentation({
      enabled: false,
      monitoringPrecision: options.monitoringPrecisionMs,
      captureUncaughtException: false,
    });
    this.runtimeInstrumentation.setMeterProvider(this.provider);
    this.runtimeInstrumentation.enable();
  }

  startHttpRequest(input: AsterHttpObservationInput): AsterStartHttpObservationResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const parsedInput = parseHttpObservationInput(input);
    if (parsedInput === undefined) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    if (!this.acquireObservation()) {
      return Object.freeze({ status: "rejected", reason: "capacity_exceeded" });
    }

    const startedAt = this.clock.nowNanoseconds();
    const activeAttributes = Object.freeze({
      "http.request.method": parsedInput.method,
      "http.route": parsedInput.route,
    });
    this.httpActive.add(1, activeAttributes);
    const traceLease = this.traces.startHttp(parsedInput);
    let completed = false;
    return Object.freeze({
      status: "started",
      observation: Object.freeze({
        complete: (completion: AsterHttpCompletion): AsterObservationCompletionResult => {
          if (completed) {
            return Object.freeze({ status: "already_completed" });
          }
          if (this.closed) {
            return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
          }
          const parsedCompletion = parseHttpCompletion(completion);
          if (parsedCompletion === undefined) {
            this.recordDrop("invalid_completion");
            return Object.freeze({ status: "rejected", reason: "invalid_completion" });
          }
          const duration = elapsedSeconds(startedAt, this.clock.nowNanoseconds());
          if (duration === undefined) {
            this.recordDrop("invalid_duration");
            return Object.freeze({ status: "rejected", reason: "invalid_completion" });
          }
          completed = true;
          this.releaseObservation();
          this.httpActive.add(-1, activeAttributes);
          this.httpDuration.record(duration, {
            ...activeAttributes,
            "http.response.status_class": statusClass(parsedCompletion.statusCode),
            "aster.outcome": parsedCompletion.outcome,
          });
          traceLease?.complete(parsedCompletion.outcome);
          return Object.freeze({ status: "completed" });
        },
        ...(traceLease ? { run: traceLease.run, traceContext: traceLease.context } : {}),
      }),
    });
  }

  startDependencyOperation(
    input: AsterDependencyObservationInput,
  ): AsterStartDependencyObservationResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const parsedInput = parseDependencyObservationInput(input);
    if (parsedInput === undefined) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    if (!this.acquireObservation()) {
      return Object.freeze({ status: "rejected", reason: "capacity_exceeded" });
    }

    const startedAt = this.clock.nowNanoseconds();
    const activeAttributes = Object.freeze({
      "aster.dependency": parsedInput.dependency,
      "aster.operation": parsedInput.operation,
    });
    this.dependencyActive.add(1, activeAttributes);
    const traceLease = this.traces.startDependency(parsedInput);
    let completed = false;
    return Object.freeze({
      status: "started",
      observation: Object.freeze({
        complete: (completion: AsterDependencyCompletion): AsterObservationCompletionResult => {
          if (completed) {
            return Object.freeze({ status: "already_completed" });
          }
          if (this.closed) {
            return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
          }
          const parsedCompletion = parseDependencyCompletion(completion);
          if (parsedCompletion === undefined) {
            this.recordDrop("invalid_completion");
            return Object.freeze({ status: "rejected", reason: "invalid_completion" });
          }
          const duration = elapsedSeconds(startedAt, this.clock.nowNanoseconds());
          if (duration === undefined) {
            this.recordDrop("invalid_duration");
            return Object.freeze({ status: "rejected", reason: "invalid_completion" });
          }
          completed = true;
          this.releaseObservation();
          this.dependencyActive.add(-1, activeAttributes);
          const completedAttributes = {
            ...activeAttributes,
            "aster.outcome": parsedCompletion.outcome,
          };
          this.dependencyDuration.record(duration, completedAttributes);
          this.dependencyOutcomes.add(1, completedAttributes);
          traceLease?.complete(parsedCompletion.outcome);
          return Object.freeze({ status: "completed" });
        },
        ...(traceLease ? { run: traceLease.run, traceContext: traceLease.context } : {}),
      }),
    });
  }

  recordDiscoveryRail(input: AsterDiscoveryRailMetricInput): AsterRecordMetricResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const value = parseDiscoveryRail(input);
    if (!value) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    const attributes = {
      "aster.discovery.rail": value.kind,
      "aster.outcome": value.outcome,
    };
    this.discoveryRailDuration.record(value.durationMs / 1_000, attributes);
    this.discoveryRailOutcomes.add(1, attributes);
    if (value.freshnessSeconds !== undefined) {
      this.discoveryRailFreshness.record(value.freshnessSeconds, {
        "aster.discovery.rail": value.kind,
      });
    }
    return Object.freeze({ status: "recorded" });
  }

  recordDiscoverySearchSample(input: AsterDiscoverySearchSampleInput): AsterRecordMetricResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const value = parseDiscoverySearchSample(input);
    if (!value) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    const resultBucket =
      value.resultCount === 0 ? "zero" : value.resultCount <= 5 ? "one_to_five" : "six_to_twenty";
    const rankBucket =
      value.topRank === null
        ? "none"
        : value.topRank < 100_000
          ? "low"
          : value.topRank < 500_000
            ? "medium"
            : "high";
    this.discoverySearchQualitySamples.add(1, {
      "aster.discovery.result_bucket": resultBucket,
      "aster.discovery.top_rank_bucket": rankBucket,
    });
    return Object.freeze({ status: "recorded" });
  }

  recordCacheOperation(input: AsterCacheMetricInput): AsterRecordMetricResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const value = parseCacheMetric(input);
    if (!value) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    const attributes = {
      "aster.cache": value.cache,
      "aster.outcome": value.outcome,
      ...(value.waiterBucket === undefined ? {} : { "aster.cache.waiters": value.waiterBucket }),
    };
    this.cacheDuration.record(value.durationMs / 1_000, attributes);
    this.cacheOutcomes.add(1, attributes);
    if (value.payloadBytes !== undefined) {
      this.cachePayloadBytes.record(value.payloadBytes, attributes);
    }
    return Object.freeze({ status: "recorded" });
  }

  recordOperationLimit(input: AsterOperationLimitMetricInput): AsterRecordMetricResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const value = parseOperationLimitMetric(input);
    if (!value) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    const attributes = {
      "aster.limiter": value.limiter,
      "aster.operation": value.operation,
      "aster.outcome": value.outcome,
      ...(value.queueBucket === undefined ? {} : { "aster.limit.queue": value.queueBucket }),
    };
    this.operationLimitDuration.record(value.durationMs / 1_000, attributes);
    this.operationLimitOutcomes.add(1, attributes);
    return Object.freeze({ status: "recorded" });
  }

  recordCircuitBreaker(input: AsterCircuitBreakerMetricInput): AsterRecordMetricResult {
    if (this.closed) {
      return Object.freeze({ status: "rejected", reason: "telemetry_closed" });
    }
    const value = parseCircuitBreakerMetric(input);
    if (!value) {
      this.recordDrop("invalid_dimension");
      return Object.freeze({ status: "rejected", reason: "invalid_dimension" });
    }
    this.circuitBreakerEvents.add(1, {
      "aster.dependency": value.dependency,
      "aster.circuit_breaker.operation": value.operation,
      "aster.circuit_breaker.state": value.state,
      "aster.circuit_breaker.event": value.event,
    });
    return Object.freeze({ status: "recorded" });
  }

  async collect(): Promise<AsterMetricCollectionResult> {
    if (this.closed) {
      return Object.freeze({ status: "unavailable", reason: "telemetry_closed" });
    }
    if (this.manualReader === undefined) {
      return Object.freeze({ status: "unavailable", reason: "remote_export" });
    }
    try {
      const result = await this.manualReader.read();
      if (result.errors.length > 0) {
        this.recordDrop("collector_failure");
        return Object.freeze({ status: "failed" });
      }
      return Object.freeze({ status: "collected", metrics: mapMetrics(result.resourceMetrics) });
    } catch {
      this.recordDrop("collector_failure");
      return Object.freeze({ status: "failed" });
    }
  }

  activeTraceContext(): AsterTraceContext | undefined {
    return this.traces.activeContext();
  }

  collectTraces(): Promise<AsterTraceCollectionResult> {
    return this.traces.collect();
  }

  exportHealth(): AsterTelemetryExportHealth {
    return frozenHealth(
      this.exportAttemptCount,
      this.exportSuccessCount,
      this.exportFailureCount,
      this.droppedObservationCount,
      this.lastExportResult,
    );
  }

  async forceFlush(signal?: AbortSignal): Promise<AsterTelemetryOperationResult> {
    if (this.closed) {
      return Object.freeze({ status: "already_completed" });
    }
    if (signal?.aborted === true) {
      return Object.freeze({ status: "aborted" });
    }
    if (this.flushOperation !== undefined) {
      return joinOperation(this.flushOperation, signal);
    }
    const failuresBeforeFlush = this.exportFailureCount;
    const currentOperation = boundedOperation(
      settleTelemetryOperations([
        this.provider.forceFlush({ timeoutMillis: this.shutdownTimeoutMs }),
        this.traces.forceFlush(),
      ]),
      this.shutdownTimeoutMs,
    ).then((result): AsterTelemetryOperationResult => {
      if (result.status === "completed" && this.exportFailureCount > failuresBeforeFlush) {
        return Object.freeze({ status: "failed" });
      }
      return result;
    });
    this.flushOperation = currentOperation;
    void currentOperation.then(() => {
      if (this.flushOperation === currentOperation) {
        this.flushOperation = undefined;
      }
    });
    return joinOperation(currentOperation, signal);
  }

  async shutdown(signal?: AbortSignal): Promise<AsterTelemetryOperationResult> {
    if (this.shutdownResult !== undefined) {
      if (this.shutdownResult.status !== "completed") {
        return this.shutdownResult;
      }
      return Object.freeze({ status: "already_completed" });
    }
    if (this.shutdownOperation !== undefined) {
      return joinOperation(this.shutdownOperation, signal);
    }

    this.closed = true;
    this.runtimeInstrumentation.disable();
    const currentOperation = boundedOperation(
      settleTelemetryOperations([
        this.provider.shutdown({ timeoutMillis: this.shutdownTimeoutMs }),
        this.traces.shutdown(),
      ]),
      this.shutdownTimeoutMs,
    );
    this.shutdownOperation = currentOperation.then((result) => {
      this.shutdownResult = result;
      return result;
    });
    return joinOperation(this.shutdownOperation, signal);
  }

  lifecycleHooks(): Readonly<{ flushTelemetry(signal: AbortSignal): Promise<void> }> {
    return Object.freeze({
      flushTelemetry: async (signal: AbortSignal): Promise<void> => {
        const result = await this.forceFlush(signal);
        if (result.status !== "completed" && result.status !== "already_completed") {
          throw new Error("Telemetry flush did not complete.");
        }
      },
    });
  }

  success(): void {
    this.exportAttemptCount += 1;
    this.exportSuccessCount += 1;
    this.lastExportResult = "success";
    this.exportAttempts.add(1, { "aster.export.result": "success" });
  }

  failure(droppedObservations: number): void {
    this.exportAttemptCount += 1;
    this.exportFailureCount += 1;
    this.lastExportResult = "failure";
    this.exportAttempts.add(1, { "aster.export.result": "failure" });
    this.droppedObservationCount += droppedObservations;
    this.dropped.add(droppedObservations, { "aster.drop.reason": "export_failure" });
  }

  private acquireObservation(): boolean {
    if (this.activeObservations >= this.maxActiveObservations) {
      this.recordDrop("capacity_exceeded");
      return false;
    }
    this.activeObservations += 1;
    return true;
  }

  private releaseObservation(): void {
    this.activeObservations = Math.max(0, this.activeObservations - 1);
  }

  private recordDrop(reason: DropReason): void {
    this.droppedObservationCount += 1;
    this.dropped.add(1, { "aster.drop.reason": reason });
  }
}

export function createTelemetry(options: AsterTelemetryOptions): AsterTelemetry {
  const validated = validateTelemetryOptions(options);
  return new AsterTelemetryImplementation(validated);
}
