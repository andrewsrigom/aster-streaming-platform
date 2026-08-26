import { ASTER_METRIC_CATALOG, createAsterTelemetry } from "./index.js";

const telemetry = createAsterTelemetry({
  serviceName: "telemetry-check",
  serviceVersion: "0.0.0",
  environment: "test",
  export: { mode: "none" },
});

const http = telemetry.startHttpRequest({ method: "POST", route: "/graphql" });
if (http.status !== "started") {
  throw new Error("Telemetry diagnostic could not start the HTTP observation.");
}
if (http.observation.complete({ outcome: "success", statusCode: 200 }).status !== "completed") {
  throw new Error("Telemetry diagnostic could not complete the HTTP observation.");
}

const dependency = telemetry.startDependencyOperation({
  dependency: "postgresql",
  operation: "query",
});
if (dependency.status !== "started") {
  throw new Error("Telemetry diagnostic could not start the dependency observation.");
}
dependency.observation.complete({ outcome: "success" });

const collection = await telemetry.collect();
if (collection.status !== "collected") {
  throw new Error("Telemetry diagnostic could not collect process-local metrics.");
}

const names = new Set(collection.metrics.map((metric) => metric.name));
for (const expected of [
  ASTER_METRIC_CATALOG.httpDuration.name,
  ASTER_METRIC_CATALOG.dependencyDuration.name,
  ASTER_METRIC_CATALOG.processCpuTime.name,
  ASTER_METRIC_CATALOG.processMemoryUsage.name,
  ASTER_METRIC_CATALOG.processUptime.name,
]) {
  if (!names.has(expected)) {
    throw new Error(`Telemetry diagnostic did not collect ${expected}.`);
  }
}

const shutdown = await telemetry.shutdown();
if (shutdown.status !== "completed") {
  throw new Error("Telemetry diagnostic did not shut down cleanly.");
}

console.log(
  JSON.stringify({
    event: "telemetry_diagnostic_passed",
    metricCount: collection.metrics.length,
    exportMode: "none",
    shutdown: shutdown.status,
  }),
);
