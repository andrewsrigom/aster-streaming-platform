import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace";
import type { ExportAttemptObserver } from "./health-tracking-exporter.js";

export class HealthTrackingSpanExporter implements SpanExporter {
  private readonly healthTimeoutMs: number;

  constructor(
    private readonly delegate: SpanExporter,
    timeoutMs: number,
    private readonly observer: ExportAttemptObserver,
  ) {
    this.healthTimeoutMs = Math.max(1, timeoutMs - Math.min(10, Math.floor(timeoutMs / 5)));
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      this.observer.failure(spans.length);
      resultCallback({ code: ExportResultCode.FAILED });
    }, this.healthTimeoutMs);
    timeout.unref();

    const complete = (result: ExportResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (result.code === ExportResultCode.SUCCESS) {
        this.observer.success();
      } else {
        this.observer.failure(spans.length);
      }
      resultCallback({ code: result.code });
    };

    try {
      this.delegate.export(spans, complete);
    } catch {
      complete({ code: ExportResultCode.FAILED });
    }
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
