import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { setTimeout as wait } from "node:timers/promises";

export const ASTER_FAILURE_LAB_TAG = "aster.failure_injection";
const ASTER_FAILURE_LAB_ENVIRONMENTS = ["local", "integration"] as const;
const ASTER_FAILURE_LAB_HTTP_MODES = [
  "latency",
  "timeout",
  "reset",
  "error",
  "malformed",
  "partial_stream",
  "saturation",
] as const;
const ASTER_FAILURE_LAB_MAX_ACTIVATIONS = 100;
const ASTER_FAILURE_LAB_MAX_ACTIVE = 16;
export const ASTER_FAILURE_LAB_MAX_BODY_BYTES = 16_384;
const ASTER_FAILURE_LAB_MAX_DELAY_MS = 10_000;
const ASTER_FAILURE_LAB_MAX_HOLD_MS = 30_000;

const LOOPBACK_HOST = "127.0.0.1";
const SCENARIO_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const ALLOWED_ERROR_STATUSES = new Set([429, 500, 502, 503, 504]);

type AsterFailureLabEnvironment = (typeof ASTER_FAILURE_LAB_ENVIRONMENTS)[number];
type AsterFailureLabEvent =
  | "activated"
  | "cancelled"
  | "completed"
  | "deadline"
  | "delivery_completed"
  | "delivery_failed"
  | "delivery_started"
  | "partial_stream"
  | "rejected_budget"
  | "rejected_saturation"
  | "reset";
type AsterFailureLabHttpMode = (typeof ASTER_FAILURE_LAB_HTTP_MODES)[number];
type AsterFailureLabIssue =
  | "active_limit"
  | "body"
  | "delay"
  | "environment"
  | "hold"
  | "max_activations"
  | "mode"
  | "scenario"
  | "state"
  | "status";

export interface AsterFailureLabObservation {
  activation: number;
  active: number;
  event: AsterFailureLabEvent;
  injection: typeof ASTER_FAILURE_LAB_TAG;
  mode: AsterFailureLabHttpMode | "duplicate_event";
  scenario: string;
}

export interface AsterFailureLabHttpOptions {
  activeLimit?: number;
  delayMs?: number;
  environment: string;
  holdMs?: number;
  maxActivations?: number;
  mode: AsterFailureLabHttpMode;
  observe?: (observation: AsterFailureLabObservation) => void;
  responseBody?: string;
  responseStatus?: number;
  scenario: string;
}

interface AsterFailureLabHttpAddress {
  host: typeof LOOPBACK_HOST;
  origin: string;
  port: number;
}

interface AsterFailureLabHttpAdapter {
  close(): Promise<void>;
  start(): Promise<AsterFailureLabHttpAddress>;
}

interface AsterFailureLabDeliveryContext {
  deliveryIndex: 1 | 2;
  injection: typeof ASTER_FAILURE_LAB_TAG;
  mode: "duplicate_event";
  scenario: string;
}

interface AsterDuplicateDeliveryOptions<T> {
  deliver: (event: T, context: AsterFailureLabDeliveryContext) => Promise<void> | void;
  environment: string;
  event: T;
  observe?: (observation: AsterFailureLabObservation) => void;
  scenario: string;
}

export class AsterFailureLabConfigurationError extends Error {
  readonly issue: AsterFailureLabIssue;

  constructor(issue: AsterFailureLabIssue, message: string) {
    super(message);
    this.name = "AsterFailureLabConfigurationError";
    this.issue = issue;
  }
}

export class AsterFailureLabDeliveryError extends Error {
  readonly deliveryIndex: 1 | 2;

  constructor(deliveryIndex: 1 | 2, cause: unknown) {
    super(`Injected duplicate delivery ${deliveryIndex} failed`, { cause });
    this.name = "AsterFailureLabDeliveryError";
    this.deliveryIndex = deliveryIndex;
  }
}

interface ValidatedHttpOptions {
  activeLimit: number;
  delayMs: number;
  holdMs: number;
  maxActivations: number;
  mode: AsterFailureLabHttpMode;
  observe: ((observation: AsterFailureLabObservation) => void) | undefined;
  responseBody: string;
  responseStatus: number;
  scenario: string;
}

function isOneOf<const T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.some((candidate) => candidate === value);
}

function validateEnvironment(environment: string): AsterFailureLabEnvironment {
  if (!isOneOf(ASTER_FAILURE_LAB_ENVIRONMENTS, environment)) {
    throw new AsterFailureLabConfigurationError(
      "environment",
      "Failure injection is restricted to local and integration environments",
    );
  }
  return environment;
}

function validateScenario(scenario: string): string {
  if (!SCENARIO_PATTERN.test(scenario)) {
    throw new AsterFailureLabConfigurationError(
      "scenario",
      "Failure-injection scenario must be a lowercase bounded label",
    );
  }
  return scenario;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  issue: AsterFailureLabIssue,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AsterFailureLabConfigurationError(
      issue,
      `Failure-injection ${issue} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function validateBody(body: string): string {
  if (Buffer.byteLength(body, "utf8") > ASTER_FAILURE_LAB_MAX_BODY_BYTES) {
    throw new AsterFailureLabConfigurationError(
      "body",
      `Failure-injection body exceeds ${ASTER_FAILURE_LAB_MAX_BODY_BYTES} bytes`,
    );
  }
  return body;
}

function validateHttpOptions(options: AsterFailureLabHttpOptions): ValidatedHttpOptions {
  validateEnvironment(options.environment);
  const scenario = validateScenario(options.scenario);
  if (!isOneOf(ASTER_FAILURE_LAB_HTTP_MODES, options.mode)) {
    throw new AsterFailureLabConfigurationError("mode", "Unknown failure-injection mode");
  }

  const delayMs = boundedInteger(options.delayMs ?? 50, 1, ASTER_FAILURE_LAB_MAX_DELAY_MS, "delay");
  const holdMs = boundedInteger(options.holdMs ?? 1_000, 1, ASTER_FAILURE_LAB_MAX_HOLD_MS, "hold");
  const maxActivations = boundedInteger(
    options.maxActivations ?? 16,
    1,
    ASTER_FAILURE_LAB_MAX_ACTIVATIONS,
    "max_activations",
  );
  const activeLimit = boundedInteger(
    options.activeLimit ?? 1,
    1,
    ASTER_FAILURE_LAB_MAX_ACTIVE,
    "active_limit",
  );
  const responseStatus = options.responseStatus ?? (options.mode === "error" ? 503 : 200);
  if (
    (options.mode === "error" && !ALLOWED_ERROR_STATUSES.has(responseStatus)) ||
    (options.mode !== "error" && responseStatus !== 200)
  ) {
    throw new AsterFailureLabConfigurationError(
      "status",
      "Failure-injection status is not allowed for this mode",
    );
  }

  return {
    activeLimit,
    delayMs,
    holdMs,
    maxActivations,
    mode: options.mode,
    observe: options.observe,
    responseBody: validateBody(options.responseBody ?? '{"injected":true}'),
    responseStatus,
    scenario,
  };
}

function observeSafely(
  observer: ((observation: AsterFailureLabObservation) => void) | undefined,
  observation: AsterFailureLabObservation,
): void {
  try {
    observer?.(Object.freeze({ ...observation }));
  } catch {
    // Laboratory observers must never alter the injected outcome.
  }
}

function tagResponse(
  response: ServerResponse,
  scenario: string,
  mode: AsterFailureLabHttpMode,
): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-aster-failure-injection", "true");
  response.setHeader("x-aster-failure-mode", mode);
  response.setHeader("x-aster-failure-scenario", scenario);
}

function sendResponse(
  response: ServerResponse,
  scenario: string,
  mode: AsterFailureLabHttpMode,
  status: number,
  body: string,
): void {
  tagResponse(response, scenario, mode);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(body);
}

export function createAsterFailureLabHttpAdapter(
  rawOptions: AsterFailureLabHttpOptions,
): AsterFailureLabHttpAdapter {
  const options = validateHttpOptions(rawOptions);
  const sockets = new Set<Socket>();
  const controllers = new Set<AbortController>();
  let activations = 0;
  let active = 0;
  let started = false;
  let closed = false;
  let listenPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;

  const observation = (event: AsterFailureLabEvent, activation: number): void => {
    observeSafely(options.observe, {
      activation,
      active,
      event,
      injection: ASTER_FAILURE_LAB_TAG,
      mode: options.mode,
      scenario: options.scenario,
    });
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    request.resume();
    activations += 1;
    const activation = activations;
    if (activation > options.maxActivations) {
      observation("rejected_budget", activation);
      sendResponse(response, options.scenario, options.mode, 503, '{"injected":"budget"}');
      return;
    }
    if (options.mode === "saturation" && active >= options.activeLimit) {
      observation("rejected_saturation", activation);
      sendResponse(response, options.scenario, options.mode, 503, '{"injected":"saturation"}');
      return;
    }

    active += 1;
    observation("activated", activation);
    const controller = new AbortController();
    controllers.add(controller);
    const cancel = (): void => {
      controller.abort();
    };
    request.once("aborted", cancel);
    response.once("close", cancel);

    try {
      switch (options.mode) {
        case "latency": {
          await wait(options.delayMs, undefined, { signal: controller.signal });
          sendResponse(
            response,
            options.scenario,
            options.mode,
            options.responseStatus,
            options.responseBody,
          );
          observation("completed", activation);
          break;
        }
        case "timeout": {
          await wait(options.holdMs, undefined, { signal: controller.signal });
          sendResponse(response, options.scenario, options.mode, 504, '{"injected":"deadline"}');
          observation("deadline", activation);
          break;
        }
        case "reset": {
          request.socket.destroy();
          observation("reset", activation);
          break;
        }
        case "error": {
          sendResponse(
            response,
            options.scenario,
            options.mode,
            options.responseStatus,
            options.responseBody,
          );
          observation("completed", activation);
          break;
        }
        case "malformed": {
          sendResponse(response, options.scenario, options.mode, 200, "{");
          observation("completed", activation);
          break;
        }
        case "partial_stream": {
          tagResponse(response, options.scenario, options.mode);
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          await new Promise<void>((resolveWrite, rejectWrite) => {
            response.write('{"injected":', (error) => {
              if (error) {
                rejectWrite(error);
              } else {
                resolveWrite();
              }
            });
          });
          request.socket.destroy();
          observation("partial_stream", activation);
          break;
        }
        case "saturation": {
          await wait(options.holdMs, undefined, { signal: controller.signal });
          sendResponse(response, options.scenario, options.mode, 200, options.responseBody);
          observation("completed", activation);
          break;
        }
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        observation("cancelled", activation);
        return;
      }
      throw error;
    } finally {
      request.removeListener("aborted", cancel);
      response.removeListener("close", cancel);
      controllers.delete(controller);
      active -= 1;
    }
  };

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent && !response.destroyed) {
        sendResponse(response, options.scenario, options.mode, 500, '{"injected":"failure"}');
      } else {
        response.destroy();
      }
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });

  const close = (): Promise<void> => {
    if (closePromise !== undefined) {
      return closePromise;
    }
    closed = true;
    for (const controller of controllers) {
      controller.abort();
    }
    for (const socket of sockets) {
      socket.destroy();
    }
    closePromise = (async () => {
      try {
        await listenPromise;
      } catch {
        // A failed bind has no listener to close.
      }
      if (!server.listening) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        server.closeAllConnections();
      });
    })();
    return closePromise;
  };

  const isClosed = (): boolean => closed;

  const start = async (): Promise<AsterFailureLabHttpAddress> => {
    if (started || closed) {
      throw new AsterFailureLabConfigurationError(
        "state",
        "Failure-injection adapter can be started exactly once",
      );
    }
    started = true;
    listenPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        reject(error);
      };
      server.once("error", onError);
      server.listen(0, LOOPBACK_HOST, () => {
        server.removeListener("error", onError);
        resolve();
      });
    });
    await listenPromise;
    if (isClosed()) {
      await close();
      throw new AsterFailureLabConfigurationError(
        "state",
        "Failure-injection adapter was closed during startup",
      );
    }
    const address = server.address() as AddressInfo | null;
    if (address === null || address.address !== LOOPBACK_HOST) {
      await close();
      throw new AsterFailureLabConfigurationError(
        "state",
        "Failure-injection adapter did not bind the required loopback address",
      );
    }
    return Object.freeze({
      host: LOOPBACK_HOST,
      origin: `http://${LOOPBACK_HOST}:${address.port}`,
      port: address.port,
    });
  };

  return {
    close,
    start,
  };
}

export async function injectAsterDuplicateDelivery<T>(
  options: AsterDuplicateDeliveryOptions<T>,
): Promise<{ deliveries: 2 }> {
  validateEnvironment(options.environment);
  const scenario = validateScenario(options.scenario);
  for (const deliveryIndex of [1, 2] as const) {
    const context = Object.freeze({
      deliveryIndex,
      injection: ASTER_FAILURE_LAB_TAG,
      mode: "duplicate_event" as const,
      scenario,
    });
    observeSafely(options.observe, {
      activation: deliveryIndex,
      active: 1,
      event: "delivery_started",
      injection: ASTER_FAILURE_LAB_TAG,
      mode: "duplicate_event",
      scenario,
    });
    try {
      await options.deliver(options.event, context);
    } catch (cause: unknown) {
      observeSafely(options.observe, {
        activation: deliveryIndex,
        active: 1,
        event: "delivery_failed",
        injection: ASTER_FAILURE_LAB_TAG,
        mode: "duplicate_event",
        scenario,
      });
      throw new AsterFailureLabDeliveryError(deliveryIndex, cause);
    }
    observeSafely(options.observe, {
      activation: deliveryIndex,
      active: 0,
      event: "delivery_completed",
      injection: ASTER_FAILURE_LAB_TAG,
      mode: "duplicate_event",
      scenario,
    });
  }
  return Object.freeze({ deliveries: 2 });
}
