import { request, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import {
  runAsterSafeRead,
  type AsterSafeReadAttemptResult,
  type AsterSafeReadObservation,
} from "@aster/runtime";
import type {
  AsterDependencyObservation,
  AsterObservationOutcome,
  AsterTelemetry,
} from "@aster/telemetry";
import type { PublicationLookup } from "../application/session-ports.js";
import { playbackIdentifier } from "../domain/session.js";

const OPERATION =
  "query PlaybackPublications($ids: [ID!]!) { _playbackPublications(ids: $ids) { titleId publicationId titleVersion manifestUrl checkedAt validUntil } }";
const MAX_RESPONSE_BYTES = 8192;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

type CatalogRequest = (
  options: RequestOptions,
  response: (message: IncomingMessage) => void,
) => ClientRequest;

function onlyField(value: unknown, field: string): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, field)
  );
}

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
    // Optional telemetry cannot decide a Catalog read.
  }
}

/** Fixed owner endpoint and operation with one deadline-bound safe-read retry layer. */
export function createCatalogPublicationClient(
  options: Readonly<{
    credential: string;
    request?: CatalogRequest;
    random?: () => number;
    observe?: (observation: AsterSafeReadObservation) => void;
    telemetry?: Pick<AsterTelemetry, "startDependencyOperation">;
  }>,
) {
  if (!/^[a-f0-9]{64}$/u.test(options.credential)) {
    throw new Error("Invalid Catalog read credential.");
  }
  const send = options.request ?? request;
  let inFlight = 0;
  return Object.freeze({
    async currentPublication(
      titleId: string,
      signal: AbortSignal,
      traceparent?: string,
    ): Promise<PublicationLookup> {
      if (signal.aborted) {
        return { status: "cancelled" };
      }
      if (!playbackIdentifier(titleId) || inFlight >= 4) {
        return { status: "unavailable" };
      }
      if (
        traceparent !== undefined &&
        (!/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u.test(traceparent) ||
          traceparent.slice(3, 35) === "0".repeat(32) ||
          traceparent.slice(36, 52) === "0".repeat(16))
      ) {
        return { status: "unavailable" };
      }
      inFlight += 1;
      try {
        const result = await runAsterSafeRead<unknown>(
          {
            operationTimeoutMs: 1500,
            attemptTimeoutMs: 650,
            responseReserveMs: 100,
            maxAttempts: 2,
            baseBackoffMs: 25,
            maxBackoffMs: 25,
            random: options.random ?? Math.random,
            ...(options.observe ? { observe: options.observe } : {}),
          },
          signal,
          (attemptSignal): Promise<AsterSafeReadAttemptResult<unknown>> =>
            new Promise((resolve) => {
              let outgoing: ClientRequest | undefined;
              let incoming: IncomingMessage | undefined;
              let settled = false;
              const observation = startCatalogObservation(options.telemetry);
              const finish = (
                attemptResult: AsterSafeReadAttemptResult<unknown>,
                outcome: AsterObservationOutcome,
              ): void => {
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
              const permanent = (outcome: AsterObservationOutcome = "rejected"): void => {
                finish({ status: "permanent" }, outcome);
              };
              const cancelled = (): void => {
                finish({ status: "cancelled" }, signal.aborted ? "cancelled" : "timeout");
              };
              attemptSignal.addEventListener("abort", cancelled, { once: true });
              if (attemptSignal.aborted) {
                cancelled();
                return;
              }
              const payload = JSON.stringify({
                query: OPERATION,
                operationName: "PlaybackPublications",
                variables: { ids: [titleId] },
              });
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
                      origin: "http://playback:3300",
                      "x-aster-csrf": "1",
                      "x-aster-playback-credential": options.credential,
                      "content-type": "application/json",
                      accept: "application/json",
                      "content-length": Buffer.byteLength(payload),
                      connection: "close",
                    },
                  },
                  (response) => {
                    incoming = response;
                    incoming.once("error", (error) => {
                      finish(
                        { status: retryableTransportError(error) ? "transient" : "permanent" },
                        "unavailable",
                      );
                    });
                    incoming.once("aborted", () => {
                      finish({ status: "transient" }, "unavailable");
                    });
                    const contentType = response.headers["content-type"]?.split(";", 1)[0]?.trim();
                    const declaredBytes = response.headers["content-length"];
                    if (RETRYABLE_STATUS.has(response.statusCode ?? 0)) {
                      finish({ status: "transient" }, "unavailable");
                      return;
                    }
                    if (
                      settled ||
                      attemptSignal.aborted ||
                      response.statusCode !== 200 ||
                      !["application/json", "application/graphql-response+json"].includes(
                        contentType ?? "",
                      ) ||
                      response.headers["content-encoding"] !== undefined ||
                      (declaredBytes !== undefined &&
                        (!/^[0-9]{1,5}$/u.test(declaredBytes) ||
                          Number(declaredBytes) > MAX_RESPONSE_BYTES))
                    ) {
                      permanent(
                        response.statusCode && response.statusCode >= 500
                          ? "unavailable"
                          : "rejected",
                      );
                      return;
                    }
                    const chunks: Buffer[] = [];
                    let bytes = 0;
                    response.on("data", (chunk: Buffer) => {
                      bytes += chunk.length;
                      if (bytes > MAX_RESPONSE_BYTES) {
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
                        const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                        if (
                          !onlyField(value, "data") ||
                          !onlyField(value["data"], "_playbackPublications")
                        ) {
                          permanent();
                          return;
                        }
                        const publications: unknown = value["data"]["_playbackPublications"];
                        if (!Array.isArray(publications) || publications.length !== 1) {
                          permanent();
                          return;
                        }
                        finish(
                          { status: "completed", value: publications[0] as unknown },
                          "success",
                        );
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
        return result.status === "completed"
          ? { status: "completed", value: result.value }
          : { status: result.status };
      } finally {
        inFlight -= 1;
      }
    },
  });
}
