import { createAsterTelemetry } from "@aster/telemetry";

import { createAsterRedisAdapter } from "./index.js";

const telemetry = createAsterTelemetry({
  serviceName: "redis-check",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});

const adapter = createAsterRedisAdapter({
  url: "redis://127.0.0.1:1/0",
  telemetry,
  maxInFlightCommands: 1,
  connectionTimeoutMs: 100,
  operationTimeoutMs: 100,
  closeTimeoutMs: 500,
  reconnectMaxAttempts: 0,
  reconnectBaseDelayMs: 10,
});

const connect = await adapter.connect();
if (connect.status !== "unavailable" && connect.status !== "timed_out") {
  throw new Error("Redis diagnostic did not classify an unavailable endpoint.");
}
const close = await adapter.close();
if (close.status !== "completed") {
  throw new Error("Redis diagnostic did not close cleanly.");
}
const telemetryClose = await telemetry.shutdown();
if (telemetryClose.status !== "completed") {
  throw new Error("Redis diagnostic telemetry did not close cleanly.");
}

console.log(
  JSON.stringify({
    event: "redis_diagnostic_passed",
    unavailableOutcome: connect.status,
    close: close.status,
  }),
);
