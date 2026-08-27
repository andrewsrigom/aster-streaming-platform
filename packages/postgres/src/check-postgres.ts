import { createAsterTelemetry } from "@aster/telemetry";

import { createAsterPostgresAdapter } from "./index.js";

const telemetry = createAsterTelemetry({
  serviceName: "postgres-check",
  serviceVersion: "0.0.0",
  environment: "local",
  export: { mode: "none" },
});

const adapter = createAsterPostgresAdapter({
  connectionString: "postgresql://aster@127.0.0.1:1/aster",
  telemetry,
  maxConnections: 1,
  connectionTimeoutMs: 100,
  idleTimeoutMs: 100,
  statementTimeoutMs: 100,
  operationTimeoutMs: 100,
  closeTimeoutMs: 500,
});

const probe = await adapter.probe();
if (probe.status !== "unavailable" && probe.status !== "timed_out") {
  throw new Error("PostgreSQL diagnostic did not classify an unavailable endpoint.");
}
const close = await adapter.close();
if (close.status !== "completed") {
  throw new Error("PostgreSQL diagnostic did not close cleanly.");
}
const telemetryClose = await telemetry.shutdown();
if (telemetryClose.status !== "completed") {
  throw new Error("PostgreSQL diagnostic telemetry did not close cleanly.");
}

console.log(
  JSON.stringify({
    event: "postgres_diagnostic_passed",
    unavailableOutcome: probe.status,
    close: close.status,
  }),
);
