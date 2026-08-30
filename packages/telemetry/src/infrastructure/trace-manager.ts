import { AsyncLocalStorage } from "node:async_hooks";
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  trace,
  type Span,
  type SpanContext,
} from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";
import type {
  AsterCollectedTrace,
  AsterDependencyObservationInput,
  AsterEventProductionObservationInput,
  AsterHttpObservationInput,
  AsterObservationOutcome,
  AsterTraceCollectionResult,
  AsterTraceContext,
} from "../ports/telemetry-contract.js";
import type { ValidatedTelemetryOptions } from "./validation.js";
import type { ExportAttemptObserver } from "./health-tracking-exporter.js";
import { HealthTrackingSpanExporter } from "./health-tracking-span-exporter.js";

const TRACE_INSTRUMENTATION_NAME = "@aster/telemetry";
const TRACE_INSTRUMENTATION_VERSION = "0.0.0";

interface ActiveTrace {
  readonly span: Span;
  readonly context: AsterTraceContext;
  active: boolean;
}

export interface AsterTraceLease {
  complete(outcome: AsterObservationOutcome): void;
  readonly context: () => AsterTraceContext;
  readonly run: <T>(operation: () => T) => T;
}

class BoundedSpanExporter implements SpanExporter {
  private readonly finished: ReadableSpan[] = [];
  private stopped = false;
  private dropped = 0;

  constructor(private readonly capacity: number) {}

  export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
    if (this.stopped) {
      callback({ code: ExportResultCode.FAILED });
      return;
    }
    for (const span of spans) {
      if (this.finished.length === this.capacity) {
        this.finished.shift();
        this.dropped++;
      }
      this.finished.push(span);
    }
    callback({ code: ExportResultCode.SUCCESS });
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.stopped = true;
    return Promise.resolve();
  }

  snapshot(): Readonly<{ dropped: number; spans: readonly ReadableSpan[] }> {
    return Object.freeze({ dropped: this.dropped, spans: Object.freeze([...this.finished]) });
  }
}

function traceContext(spanContext: SpanContext): AsterTraceContext {
  const traceFlags = (spanContext.traceFlags & 1) as 0 | 1;
  return Object.freeze({
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags,
    traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-0${traceFlags}`,
  });
}

function remoteParent(traceparent: string | undefined): SpanContext | undefined {
  if (traceparent === undefined) {
    return undefined;
  }
  const parts = traceparent.split("-");
  const traceId = parts[1];
  const spanId = parts[2];
  const flags = parts[3];
  return traceId && spanId && flags
    ? Object.freeze({
        traceId,
        spanId,
        traceFlags: flags === "01" ? TraceFlags.SAMPLED : TraceFlags.NONE,
        isRemote: true,
      })
    : undefined;
}

function statusFor(outcome: AsterObservationOutcome): SpanStatusCode {
  switch (outcome) {
    case "success":
      return SpanStatusCode.OK;
    case "error":
    case "timeout":
    case "unavailable":
      return SpanStatusCode.ERROR;
    case "cancelled":
    case "rejected":
      return SpanStatusCode.UNSET;
  }
}

function collectedStatus(code: SpanStatusCode): AsterCollectedTrace["status"] {
  return code === SpanStatusCode.OK ? "ok" : code === SpanStatusCode.ERROR ? "error" : "unset";
}

function collectedKind(kind: SpanKind): AsterCollectedTrace["kind"] | undefined {
  switch (kind) {
    case SpanKind.SERVER:
      return "server";
    case SpanKind.CLIENT:
      return "client";
    case SpanKind.PRODUCER:
      return "producer";
    case SpanKind.CONSUMER:
      return "consumer";
    case SpanKind.INTERNAL:
      return undefined;
  }
}

function dependencyKind(input: AsterDependencyObservationInput): SpanKind {
  if (input.dependency === "broker") {
    if (input.operation === "publish") {
      return SpanKind.PRODUCER;
    }
    if (input.operation === "consume") {
      return SpanKind.CONSUMER;
    }
  }
  return SpanKind.CLIENT;
}

function collectedAttributes(span: ReadableSpan): Readonly<Record<string, string>> | undefined {
  const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(span.attributes)) {
    if (typeof value !== "string") {
      return undefined;
    }
    attributes[name] = value;
  }
  return Object.freeze(attributes);
}

function collectedLinks(span: ReadableSpan): AsterCollectedTrace["links"] | undefined {
  if (span.links.length === 0) {
    return undefined;
  }
  return Object.freeze(
    span.links.map((link) =>
      Object.freeze({
        traceId: link.context.traceId,
        spanId: link.context.spanId,
      }),
    ),
  );
}

export class AsterTraceManager {
  private readonly activeStorage = new AsyncLocalStorage<ActiveTrace>();
  private readonly exporter: BoundedSpanExporter;
  private readonly provider: TracerProvider;
  private readonly tracer;
  private readonly active = new Set<ActiveTrace>();
  private closed = false;
  private rejectedSpans = 0;

  constructor(
    private readonly options: ValidatedTelemetryOptions,
    exportObserver: ExportAttemptObserver,
  ) {
    this.exporter = new BoundedSpanExporter(options.maxActiveSpans);
    const spanProcessors: SpanProcessor[] = [new SimpleSpanProcessor({ exporter: this.exporter })];
    if (options.export.mode === "otlp-http") {
      const endpoint = new URL(options.export.endpoint);
      endpoint.pathname = endpoint.pathname.replace(/\/v1\/metrics$/u, "/v1/traces");
      const delegate = new OTLPTraceExporter({
        url: endpoint.href,
        timeoutMillis: options.export.timeoutMs,
        concurrencyLimit: 1,
      });
      const exporter = new HealthTrackingSpanExporter(
        delegate,
        options.export.timeoutMs,
        exportObserver,
      );
      spanProcessors.push(
        new BatchSpanProcessor({
          exporter,
          maxQueueSize: options.maxActiveSpans,
          maxExportBatchSize: Math.min(32, options.maxActiveSpans),
          scheduledDelayMillis: options.export.intervalMs,
          exportTimeoutMillis: options.export.timeoutMs,
        }),
      );
    }
    this.provider = new TracerProvider({
      resource: resourceFromAttributes({
        "service.name": options.serviceName,
        "service.version": options.serviceVersion,
        "deployment.environment.name": options.environment,
      }),
      sampler: new AlwaysOnSampler(),
      forceFlushTimeoutMillis: options.shutdownTimeoutMs,
      spanLimits: {
        attributeValueLengthLimit: 64,
        attributeCountLimit: 8,
        eventCountLimit: 0,
        attributePerEventCountLimit: 0,
        linkCountLimit: 1,
        attributePerLinkCountLimit: 0,
      },
      spanProcessors,
    });
    this.tracer = this.provider.getTracer(
      TRACE_INSTRUMENTATION_NAME,
      TRACE_INSTRUMENTATION_VERSION,
    );
  }

  startHttp(input: AsterHttpObservationInput): AsterTraceLease | undefined {
    return this.start(
      "aster.http.server",
      SpanKind.SERVER,
      Object.freeze({
        "aster.boundary": "http_server",
        "http.request.method": input.method,
        "http.route": input.route,
      }),
      remoteParent(input.traceparent),
    );
  }

  startDependency(input: AsterDependencyObservationInput): AsterTraceLease | undefined {
    return this.start(
      "aster.dependency.operation",
      dependencyKind(input),
      Object.freeze({
        "aster.boundary": "dependency",
        "aster.dependency": input.dependency,
        "aster.operation": input.operation,
      }),
      undefined,
      remoteParent(input.linkedTraceparent),
    );
  }

  startEventProduction(input: AsterEventProductionObservationInput): AsterTraceLease | undefined {
    return this.start(
      "aster.event.produce",
      SpanKind.PRODUCER,
      Object.freeze({
        "aster.boundary": "event_producer",
        "aster.event.owner": input.owner,
      }),
    );
  }

  activeContext(): AsterTraceContext | undefined {
    const active = this.activeStorage.getStore();
    return active?.active === true ? active.context : undefined;
  }

  async collect(): Promise<AsterTraceCollectionResult> {
    if (this.closed) {
      return Object.freeze({ status: "unavailable", reason: "telemetry_closed" });
    }
    try {
      await this.provider.forceFlush();
      const snapshot = this.exporter.snapshot();
      const traces: AsterCollectedTrace[] = [];
      for (const span of snapshot.spans) {
        const kind = collectedKind(span.kind);
        const attributes = collectedAttributes(span);
        if (
          kind === undefined ||
          attributes === undefined ||
          (span.name !== "aster.http.server" &&
            span.name !== "aster.dependency.operation" &&
            span.name !== "aster.event.produce")
        ) {
          return Object.freeze({ status: "failed" });
        }
        const context = traceContext(span.spanContext());
        const links = collectedLinks(span);
        traces.push(
          Object.freeze({
            name: span.name,
            kind,
            traceId: context.traceId,
            spanId: context.spanId,
            ...(span.parentSpanContext ? { parentSpanId: span.parentSpanContext.spanId } : {}),
            ...(links ? { links } : {}),
            traceFlags: context.traceFlags,
            status: collectedStatus(span.status.code),
            attributes,
          }),
        );
      }
      return Object.freeze({
        status: "collected",
        traces: Object.freeze(traces),
        droppedSpans: snapshot.dropped + this.rejectedSpans,
      });
    } catch {
      return Object.freeze({ status: "failed" });
    }
  }

  forceFlush(): Promise<void> {
    return this.provider.forceFlush();
  }

  async shutdown(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const active of [...this.active]) {
      active.active = false;
      active.span.setAttribute("aster.outcome", "cancelled");
      active.span.end();
      this.active.delete(active);
    }
    await this.provider.shutdown();
  }

  private start(
    name: AsterCollectedTrace["name"],
    kind: SpanKind,
    attributes: Readonly<Record<string, string>>,
    inboundParent?: SpanContext,
    linkedContext?: SpanContext,
  ): AsterTraceLease | undefined {
    if (this.closed || this.active.size >= this.options.maxActiveSpans) {
      this.rejectedSpans++;
      return undefined;
    }
    const current = this.activeStorage.getStore();
    const parent =
      current?.active === true
        ? trace.setSpan(ROOT_CONTEXT, current.span)
        : inboundParent
          ? trace.setSpanContext(ROOT_CONTEXT, inboundParent)
          : ROOT_CONTEXT;
    const span = this.tracer.startSpan(
      name,
      {
        attributes,
        kind,
        ...(linkedContext ? { links: [{ context: linkedContext }] } : {}),
      },
      parent,
    );
    const state: ActiveTrace = {
      span,
      context: traceContext(span.spanContext()),
      active: true,
    };
    this.active.add(state);
    return Object.freeze({
      complete: (outcome: AsterObservationOutcome): void => {
        if (!state.active) {
          return;
        }
        state.active = false;
        span.setAttribute("aster.outcome", outcome);
        span.setStatus({ code: statusFor(outcome) });
        span.end();
        this.active.delete(state);
      },
      context: () => state.context,
      run: <T>(operation: () => T): T =>
        state.active ? this.activeStorage.run(state, operation) : operation(),
    });
  }
}
