import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import {
  createAsterCircuitBreaker,
  runAsterSafeRead,
  type AsterCircuitBreaker,
  type AsterCircuitBreakerObservation,
  type AsterSafeReadAttemptResult,
  type AsterSafeReadObservation,
} from "@aster/runtime";
import type {
  AsterDependencyObservation,
  AsterCircuitBreakerOperation,
  AsterObservationOutcome,
  AsterTelemetry,
} from "@aster/telemetry";
import type { CatalogSnapshotSource } from "../application/catalog-event-ports.js";
import type {
  CatalogSnapshotExportPage,
  CatalogSnapshotExportSource,
} from "../application/rebuild-ports.js";
import type { ProjectionStoreResult } from "../application/projection-ports.js";
import {
  discoveryIdentifier,
  normalizeCurrentCatalogSnapshot,
  type CatalogSnapshot,
} from "../domain/title-projection.js";

const SNAPSHOTS_OPERATION =
  "query DiscoverySnapshots($ids: [ID!]!) { _discoverySnapshots(ids: $ids) { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } }";
const EXPORT_OPERATION =
  "query DiscoveryExport($after: ID) { _discoveryExport(after: $after) { snapshots { titleId sourceVersion observedAt visibleUntil document { defaultLocale localizations { locale title synopsis } genres editorialLabels releaseYear publishedAt } } endCursor hasNextPage } }";
const MAX_RESPONSE_BYTES = 65_536;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const BREAKER_OPERATIONS = Object.freeze({
  DiscoverySnapshots: "discovery_snapshot",
  DiscoveryExport: "discovery_export",
} satisfies Readonly<
  Record<"DiscoverySnapshots" | "DiscoveryExport", AsterCircuitBreakerOperation>
>);
type CatalogRequest = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void,
) => ClientRequest;
type ParseResult<T> = Readonly<{ valid: true; value: T }> | Readonly<{ valid: false }>;

function retryableTransportError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = Object.getOwnPropertyDescriptor(error, "code");
  return Boolean(
    code && "value" in code && ["EAI_AGAIN", "ECONNRESET"].includes(code.value as string),
  );
}

function startCatalogObservation(
  telemetry: Pick<AsterTelemetry, "startDependencyOperation"> | undefined,
): AsterDependencyObservation | undefined {
  try {
    const started = telemetry?.startDependencyOperation({
      dependency: "catalog",
      operation: "read",
    });
    return started?.status === "started" ? started.observation : undefined;
  } catch {
    return undefined;
  }
}

function completeCatalogObservation(
  observation: AsterDependencyObservation | undefined,
  outcome: AsterObservationOutcome,
): void {
  try {
    observation?.complete({ outcome });
  } catch {
    // Optional telemetry cannot decide a Catalog snapshot.
  }
}

function outgoingTraceparent(
  observation: AsterDependencyObservation | undefined,
): string | undefined {
  try {
    return observation?.traceContext?.().traceparent;
  } catch {
    return undefined;
  }
}

function recordCircuitBreaker(
  telemetry: Pick<AsterTelemetry, "recordCircuitBreaker"> | undefined,
  operation: AsterCircuitBreakerOperation,
  observation: AsterCircuitBreakerObservation,
): void {
  try {
    telemetry?.recordCircuitBreaker?.({ dependency: "catalog", operation, ...observation });
  } catch {
    // Optional telemetry cannot decide a Catalog snapshot.
  }
}

function exact(value: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length &&
    keys.every((key) => typeof key === "string" && fields.includes(key))
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseCurrent(
  body: unknown,
  expectedTitleId: string,
  now: number,
): ParseResult<CatalogSnapshot | null> {
  const root = exact(body, ["data"]);
  const data = root && exact(root["data"], ["_discoverySnapshots"]);
  const snapshots = data?.["_discoverySnapshots"];
  const entry = Array.isArray(snapshots)
    ? Object.getOwnPropertyDescriptor(snapshots, "0")
    : undefined;
  if (!(
    Array.isArray(snapshots) &&
    snapshots.length === 1 &&
    Reflect.ownKeys(snapshots).length === 2 &&
    entry &&
    "value" in entry
  )) {
    return { valid: false };
  }
  const value: unknown = entry.value;
  if (value === null) {
    return { valid: true, value: null };
  }
  const normalized = normalizeCurrentCatalogSnapshot(value, now);
  return normalized?.titleId === expectedTitleId
    ? { valid: true, value: normalized }
    : { valid: false };
}

function parseExport(
  body: unknown,
  after: string | null,
  now: number,
): ParseResult<CatalogSnapshotExportPage> {
  const root = exact(body, ["data"]);
  const data = root && exact(root["data"], ["_discoveryExport"]);
  const page = data && exact(data["_discoveryExport"], ["snapshots", "endCursor", "hasNextPage"]);
  const snapshots = page?.["snapshots"];
  const endCursor = page?.["endCursor"];
  const hasNextPage = page?.["hasNextPage"];
  if (
    !Array.isArray(snapshots) ||
    snapshots.length > 2 ||
    Reflect.ownKeys(snapshots).length !== snapshots.length + 1 ||
    typeof hasNextPage !== "boolean" ||
    (hasNextPage && snapshots.length !== 2)
  ) {
    return { valid: false };
  }
  const values: unknown[] = [];
  let previous = after;
  for (let index = 0; index < snapshots.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(snapshots, String(index));
    const value = entry && "value" in entry ? (entry.value as unknown) : undefined;
    const snapshot = normalizeCurrentCatalogSnapshot(value, now);
    const titleId = snapshot?.titleId;
    if (!snapshot || !discoveryIdentifier(titleId) || (previous !== null && titleId <= previous)) {
      return { valid: false };
    }
    previous = titleId;
    values.push(snapshot);
  }
  const expectedCursor = values.length === 0 ? null : previous;
  if ((endCursor !== null && !discoveryIdentifier(endCursor)) || endCursor !== expectedCursor) {
    return { valid: false };
  }
  return {
    valid: true,
    value: Object.freeze({
      snapshots: Object.freeze(values),
      endCursor,
      hasNextPage,
    }),
  };
}

/** Fixed purpose-separated owner reads with one deadline-bound safe-read retry layer. */
export function createCatalogSnapshotClient(
  options: Readonly<{
    credential: string;
    now: () => number;
    request?: CatalogRequest;
    random?: () => number;
    observe?: (observation: AsterSafeReadObservation) => void;
    snapshotCircuitBreaker?: AsterCircuitBreaker;
    exportCircuitBreaker?: AsterCircuitBreaker;
    telemetry?: Pick<AsterTelemetry, "startDependencyOperation" | "recordCircuitBreaker">;
  }>,
): CatalogSnapshotSource & CatalogSnapshotExportSource {
  if (!/^[a-f0-9]{64}$/u.test(options.credential)) {
    throw new Error("Invalid Catalog Discovery credential.");
  }
  const send = options.request ?? request;
  const circuitBreakers = Object.freeze({
    DiscoverySnapshots:
      options.snapshotCircuitBreaker ??
      createAsterCircuitBreaker({
        samplingWindowMs: 30_000,
        minimumThroughput: 4,
        failureRateThresholdPercentage: 50,
        openDurationMs: 5_000,
        observe: (observation) => {
          recordCircuitBreaker(
            options.telemetry,
            BREAKER_OPERATIONS.DiscoverySnapshots,
            observation,
          );
        },
      }),
    DiscoveryExport:
      options.exportCircuitBreaker ??
      createAsterCircuitBreaker({
        samplingWindowMs: 30_000,
        minimumThroughput: 4,
        failureRateThresholdPercentage: 50,
        openDurationMs: 5_000,
        observe: (observation) => {
          recordCircuitBreaker(options.telemetry, BREAKER_OPERATIONS.DiscoveryExport, observation);
        },
      }),
  });
  let active = false;

  async function execute<T>(
    operationName: "DiscoverySnapshots" | "DiscoveryExport",
    query: string,
    variables: Readonly<Record<string, unknown>>,
    correlationId: string,
    signal: AbortSignal,
    parseBody: (body: unknown) => ParseResult<T>,
  ): Promise<ProjectionStoreResult<T>> {
    if (signal.aborted) {
      return { status: "cancelled" };
    }
    if (!discoveryIdentifier(correlationId) || active) {
      return { status: "unavailable" };
    }
    active = true;
    try {
      const execution = await circuitBreakers[operationName].execute(
        signal,
        async (breakerSignal) => {
          const result = await runAsterSafeRead<T>(
            {
              operationTimeoutMs: 2_000,
              attemptTimeoutMs: 850,
              responseReserveMs: 100,
              maxAttempts: 2,
              baseBackoffMs: 25,
              maxBackoffMs: 25,
              random: options.random ?? Math.random,
              ...(options.observe ? { observe: options.observe } : {}),
            },
            breakerSignal,
            (attemptSignal): Promise<AsterSafeReadAttemptResult<T>> =>
              new Promise((resolve) => {
                let outgoing: ClientRequest | undefined;
                let incoming: IncomingMessage | undefined;
                let settled = false;
                const observation = startCatalogObservation(options.telemetry);
                const traceparent = outgoingTraceparent(observation);
                const finish = (
                  attemptResult: AsterSafeReadAttemptResult<T>,
                  outcome: AsterObservationOutcome,
                ) => {
                  if (settled) {
                    return;
                  }
                  settled = true;
                  attemptSignal.removeEventListener("abort", cancelled);
                  incoming?.destroy();
                  outgoing?.destroy();
                  completeCatalogObservation(observation, outcome);
                  resolve(attemptResult);
                };
                const permanent = (outcome: AsterObservationOutcome = "rejected") => {
                  finish({ status: "permanent" }, outcome);
                };
                const cancelled = () => {
                  finish({ status: "cancelled" }, signal.aborted ? "cancelled" : "timeout");
                };
                attemptSignal.addEventListener("abort", cancelled, { once: true });
                if (attemptSignal.aborted) {
                  cancelled();
                  return;
                }
                const payload = JSON.stringify({ query, operationName, variables });
                try {
                  outgoing = send(
                    {
                      protocol: "http:",
                      hostname: "catalog",
                      port: 3200,
                      path: "/graphql",
                      method: "POST",
                      agent: false,
                      signal: attemptSignal,
                      maxHeaderSize: 8192,
                      headers: {
                        ...(traceparent ? { traceparent } : {}),
                        host: "catalog:3200",
                        origin: "http://discovery:3500",
                        "x-aster-csrf": "1",
                        "x-aster-discovery-credential": options.credential,
                        "x-aster-correlation-id": correlationId,
                        "content-type": "application/json",
                        accept: "application/json",
                        "content-length": Buffer.byteLength(payload),
                        connection: "close",
                      },
                    },
                    (response) => {
                      incoming = response;
                      response.once("error", (error) => {
                        finish(
                          { status: retryableTransportError(error) ? "transient" : "permanent" },
                          "unavailable",
                        );
                      });
                      response.once("aborted", () => {
                        finish({ status: "transient" }, "unavailable");
                      });
                      const type = response.headers["content-type"]?.split(";", 1)[0]?.trim();
                      const declared = response.headers["content-length"];
                      if (RETRYABLE_STATUS.has(response.statusCode ?? 0)) {
                        finish({ status: "transient" }, "unavailable");
                        return;
                      }
                      if (
                        settled ||
                        attemptSignal.aborted ||
                        response.statusCode !== 200 ||
                        !["application/json", "application/graphql-response+json"].includes(
                          type ?? "",
                        ) ||
                        response.headers["content-encoding"] !== undefined ||
                        response.headers["set-cookie"] !== undefined ||
                        (declared !== undefined &&
                          (!/^[0-9]{1,5}$/u.test(declared) ||
                            Number(declared) > MAX_RESPONSE_BYTES))
                      ) {
                        permanent(
                          response.statusCode && response.statusCode >= 500
                            ? "unavailable"
                            : "rejected",
                        );
                        return;
                      }
                      const chunks: Buffer[] = [];
                      let received = 0;
                      response.on("data", (chunk: Buffer) => {
                        received += chunk.length;
                        if (received > MAX_RESPONSE_BYTES) {
                          permanent();
                          return;
                        }
                        chunks.push(chunk);
                      });
                      response.once("end", () => {
                        if (attemptSignal.aborted) {
                          cancelled();
                          return;
                        }
                        if (!response.complete) {
                          finish({ status: "transient" }, "unavailable");
                          return;
                        }
                        try {
                          const parsed = parseBody(
                            JSON.parse(Buffer.concat(chunks).toString("utf8")),
                          );
                          if (parsed.valid) {
                            finish({ status: "completed", value: parsed.value }, "success");
                          } else {
                            permanent();
                          }
                        } catch {
                          permanent();
                        }
                      });
                    },
                  );
                  outgoing.once("error", (error) => {
                    finish(
                      { status: retryableTransportError(error) ? "transient" : "permanent" },
                      "unavailable",
                    );
                  });
                  outgoing.end(payload);
                } catch (error) {
                  finish(
                    { status: retryableTransportError(error) ? "transient" : "permanent" },
                    "unavailable",
                  );
                }
              }),
          );
          const value: ProjectionStoreResult<T> =
            result.status === "completed"
              ? { status: "completed", value: result.value }
              : { status: result.status };
          return {
            outcome:
              result.status === "completed"
                ? "success"
                : result.status === "cancelled"
                  ? "ignored"
                  : "failure",
            value,
          } as const;
        },
      );
      return execution.status === "completed"
        ? execution.value
        : {
            status:
              execution.status === "rejected" && execution.reason === "cancelled"
                ? "cancelled"
                : "unavailable",
          };
    } finally {
      active = false;
    }
  }

  return Object.freeze({
    current(titleId: string, correlationId: string, signal: AbortSignal) {
      return discoveryIdentifier(titleId)
        ? execute(
            "DiscoverySnapshots",
            SNAPSHOTS_OPERATION,
            { ids: [titleId] },
            correlationId,
            signal,
            (body) => parseCurrent(body, titleId, options.now()),
          )
        : Promise.resolve({ status: "unavailable" } as const);
    },
    exportPage(after: string | null, correlationId: string, signal: AbortSignal) {
      return after === null || discoveryIdentifier(after)
        ? execute("DiscoveryExport", EXPORT_OPERATION, { after }, correlationId, signal, (body) =>
            parseExport(body, after, options.now()),
          )
        : Promise.resolve({ status: "unavailable" } as const);
    },
  });
}
