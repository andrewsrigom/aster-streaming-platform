import { createAsterTelemetry } from "@aster/telemetry";

import { createAsterKafkaBrokerAdapter } from "./index.js";

const telemetry = createAsterTelemetry({
  serviceName: "broker-check",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});

const adapter = createAsterKafkaBrokerAdapter({
  brokers: ["127.0.0.1:1"],
  clientId: "aster-broker-check",
  groupId: "aster-broker-check",
  telemetry,
  maxInFlightPublishes: 1,
  connectionTimeoutMs: 500,
  operationTimeoutMs: 500,
  closeTimeoutMs: 1_000,
  retryMaxAttempts: 2,
  retryBaseDelayMs: 25,
});

const connect = await adapter.connect();
if (connect.status !== "unavailable" && connect.status !== "timed_out") {
  throw new Error("Broker diagnostic did not classify an unavailable endpoint.");
}
const close = await adapter.close();
if (close.status !== "completed") {
  throw new Error("Broker diagnostic did not close cleanly.");
}
const telemetryClose = await telemetry.shutdown();
if (telemetryClose.status !== "completed") {
  throw new Error("Broker diagnostic telemetry did not close cleanly.");
}

console.log(
  JSON.stringify({
    event: "broker_diagnostic_passed",
    unavailableOutcome: connect.status,
    close: close.status,
  }),
);
