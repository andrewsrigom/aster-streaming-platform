import { createAsterTelemetry } from "@aster/telemetry";

import { createAsterObjectStorageAdapter } from "./index.js";

const telemetry = createAsterTelemetry({
  serviceName: "object-storage-check",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});

const adapter = createAsterObjectStorageAdapter({
  endpoint: "http://127.0.0.1:1",
  region: "us-east-1",
  bucket: "aster-diagnostic",
  accessKeyId: "local-access",
  secretAccessKey: ["local", "-development"].join(""),
  telemetry,
  maxInFlightOperations: 1,
  connectionTimeoutMs: 100,
  operationTimeoutMs: 150,
  closeTimeoutMs: 500,
});

const probe = await adapter.probe();
if (probe.status !== "unavailable" && probe.status !== "timed_out") {
  throw new Error("Object-storage diagnostic did not classify an unavailable endpoint.");
}
const close = await adapter.close();
if (close.status !== "completed") {
  throw new Error("Object-storage diagnostic did not close cleanly.");
}
const telemetryClose = await telemetry.shutdown();
if (telemetryClose.status !== "completed") {
  throw new Error("Object-storage diagnostic telemetry did not close cleanly.");
}

console.log(
  JSON.stringify({
    event: "object_storage_diagnostic_passed",
    unavailableOutcome: probe.status,
    close: close.status,
  }),
);
