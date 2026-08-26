export const HTTP_DURATION_BUCKETS_SECONDS = Object.freeze([
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
]);

export const DEPENDENCY_DURATION_BUCKETS_SECONDS = Object.freeze([
  0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]);

export const ASTER_METRIC_CATALOG = Object.freeze({
  httpDuration: Object.freeze({
    name: "http.server.request.duration",
    description: "Duration of inbound HTTP requests.",
    unit: "s",
  }),
  httpActive: Object.freeze({
    name: "http.server.active_requests",
    description: "Number of active inbound HTTP requests.",
    unit: "{request}",
  }),
  dependencyDuration: Object.freeze({
    name: "aster.dependency.operation.duration",
    description: "Duration of outbound dependency operations.",
    unit: "s",
  }),
  dependencyActive: Object.freeze({
    name: "aster.dependency.operation.active",
    description: "Number of active outbound dependency operations.",
    unit: "{operation}",
  }),
  dependencyOutcomes: Object.freeze({
    name: "aster.dependency.operation.outcomes",
    description: "Number of completed outbound dependency operations by outcome.",
    unit: "{operation}",
  }),
  droppedObservations: Object.freeze({
    name: "aster.telemetry.dropped_observations",
    description: "Number of telemetry observations dropped by a bounded failure category.",
    unit: "{observation}",
  }),
  exportAttempts: Object.freeze({
    name: "aster.telemetry.export.attempts",
    description: "Number of telemetry export attempts by bounded result.",
    unit: "{attempt}",
  }),
  processCpuTime: Object.freeze({
    name: "process.cpu.time",
    description: "Total CPU seconds broken down by CPU mode.",
    unit: "s",
  }),
  processCpuUtilization: Object.freeze({
    name: "process.cpu.utilization",
    description: "Process CPU utilization normalized by CPUs available to the process.",
    unit: "1",
  }),
  processMemoryUsage: Object.freeze({
    name: "process.memory.usage",
    description: "Physical memory used by the process.",
    unit: "By",
  }),
  processUptime: Object.freeze({
    name: "process.uptime",
    description: "Time the process has been running.",
    unit: "s",
  }),
});
