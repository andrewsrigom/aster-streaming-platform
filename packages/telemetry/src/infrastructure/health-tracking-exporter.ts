import {
  AggregationTemporality,
  type AggregationOption,
  type InstrumentType,
  type PushMetricExporter,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import { ExportResultCode } from "@opentelemetry/core";

export type ExportResultCallback = Parameters<PushMetricExporter["export"]>[1];

export interface ExportAttemptObserver {
  success(): void;
  failure(droppedObservations: number): void;
}

function countDataPoints(resourceMetrics: ResourceMetrics): number {
  let count = 0;
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      count += metric.dataPoints.length;
    }
  }
  return count;
}

export class HealthTrackingExporter implements PushMetricExporter {
  private readonly healthTimeoutMs: number;

  constructor(
    private readonly delegate: PushMetricExporter,
    timeoutMs: number,
    private readonly observer: ExportAttemptObserver,
  ) {
    this.healthTimeoutMs = Math.max(1, timeoutMs - Math.min(10, Math.floor(timeoutMs / 5)));
  }

  export(metrics: ResourceMetrics, resultCallback: ExportResultCallback): void {
    const dropped = countDataPoints(metrics);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      this.observer.failure(dropped);
      resultCallback({ code: 1 });
    }, this.healthTimeoutMs);
    timeout.unref();

    const complete: ExportResultCallback = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (result.code === ExportResultCode.SUCCESS) {
        this.observer.success();
      } else {
        this.observer.failure(dropped);
      }
      resultCallback({ code: result.code });
    };

    try {
      this.delegate.export(metrics, complete);
    } catch {
      complete({ code: 1 });
    }
  }

  async forceFlush(): Promise<void> {
    await this.delegate.forceFlush();
  }

  selectAggregationTemporality(instrumentType: InstrumentType): AggregationTemporality {
    return (
      this.delegate.selectAggregationTemporality?.(instrumentType) ??
      AggregationTemporality.CUMULATIVE
    );
  }

  selectAggregation(instrumentType: InstrumentType): AggregationOption {
    return this.delegate.selectAggregation?.(instrumentType) ?? { type: 0 };
  }

  async shutdown(): Promise<void> {
    await this.delegate.shutdown();
  }
}
