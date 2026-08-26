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
  AsterCollectedMetric,
  AsterCollectedMetricPoint,
  AsterDependencyCompletion,
  AsterDependencyObservationInput,
  AsterHttpCompletion,
  AsterHttpObservationInput,
  AsterMetricAttributeValue,
  AsterMetricCollectionResult,
  AsterObservationCompletionResult,
  AsterStartDependencyObservationResult,
  AsterStartHttpObservationResult,
  AsterTelemetry,
  AsterTelemetryExportHealth,
  AsterTelemetryOperationResult,
  AsterTelemetryOptions,
} from "../ports/telemetry-contract.js";
import { elapsedSeconds } from "./duration.js";
import { HealthTrackingExporter, type ExportAttemptObserver } from "./health-tracking-exporter.js";
import { ManualMetricReader } from "./manual-metric-reader.js";
import {
  ASTER_METRIC_CATALOG,
  DEPENDENCY_DURATION_BUCKETS_SECONDS,
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

class AsterTelemetryImplementation implements AsterTelemetry, ExportAttemptObserver {
  private readonly provider: MeterProvider;
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
          return Object.freeze({ status: "completed" });
        },
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
          return Object.freeze({ status: "completed" });
        },
      }),
    });
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
      this.provider.forceFlush({ timeoutMillis: this.shutdownTimeoutMs }),
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
      this.provider.shutdown({ timeoutMillis: this.shutdownTimeoutMs }),
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
