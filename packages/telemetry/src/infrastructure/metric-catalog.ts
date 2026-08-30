export const HTTP_DURATION_BUCKETS_SECONDS = Object.freeze([
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
]);

export const DEPENDENCY_DURATION_BUCKETS_SECONDS = Object.freeze([
  0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]);

export const DISCOVERY_FRESHNESS_BUCKETS_SECONDS = Object.freeze([
  1, 5, 15, 30, 60, 120, 180, 240, 300,
]);

export const CACHE_PAYLOAD_BUCKETS_BYTES = Object.freeze([256, 1_024, 4_096, 8_192, 16_384]);

export const EVENT_AGE_BUCKETS_SECONDS = Object.freeze([
  0.1, 0.5, 1, 5, 15, 30, 60, 300, 900, 1_800, 3_600,
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
  discoveryRailDuration: Object.freeze({
    name: "aster.discovery.rail.duration",
    description: "Duration of one bounded Discovery rail selection.",
    unit: "s",
  }),
  discoveryRailOutcomes: Object.freeze({
    name: "aster.discovery.rail.outcomes",
    description: "Number of Discovery rail selections by finite outcome.",
    unit: "{rail}",
  }),
  discoveryRailFreshness: Object.freeze({
    name: "aster.discovery.rail.freshness",
    description: "Age of the oldest projected title served by a Discovery rail.",
    unit: "s",
  }),
  discoverySearchQualitySamples: Object.freeze({
    name: "aster.discovery.search.quality_samples",
    description: "Deterministically sampled search result-count and top-rank buckets.",
    unit: "{sample}",
  }),
  cacheDuration: Object.freeze({
    name: "aster.cache.operation.duration",
    description: "Duration of one bounded product-cache decision.",
    unit: "s",
  }),
  cacheOutcomes: Object.freeze({
    name: "aster.cache.operation.outcomes",
    description: "Number of product-cache decisions by finite family and outcome.",
    unit: "{operation}",
  }),
  cachePayloadBytes: Object.freeze({
    name: "aster.cache.payload.size",
    description: "Size of a bounded product-cache payload when measured.",
    unit: "By",
  }),
  operationLimitDuration: Object.freeze({
    name: "aster.operation.limit.duration",
    description: "Duration of one bounded rate or concurrency admission decision.",
    unit: "s",
  }),
  operationLimitOutcomes: Object.freeze({
    name: "aster.operation.limit.outcomes",
    description: "Number of operation admission decisions by finite policy and outcome.",
    unit: "{decision}",
  }),
  circuitBreakerEvents: Object.freeze({
    name: "aster.resilience.circuit_breaker.events",
    description: "Number of circuit-breaker results and state transitions by finite policy scope.",
    unit: "{event}",
  }),
  postgresPoolConnections: Object.freeze({
    name: "aster.postgresql.pool.connections",
    description: "Latest bounded PostgreSQL pool connection and capacity snapshot.",
    unit: "{connection}",
  }),
  eventDeliveryAge: Object.freeze({
    name: "aster.event.delivery.age",
    description: "Age of a validated event at a finite delivery boundary.",
    unit: "s",
  }),
  eventDeliveryOutcomes: Object.freeze({
    name: "aster.event.delivery.outcomes",
    description: "Number of event delivery boundary results by finite owner and stage.",
    unit: "{event}",
  }),
  productOperationDuration: Object.freeze({
    name: "aster.product.operation.duration",
    description: "Duration of a finite backend product operation.",
    unit: "s",
  }),
  productOperationOutcomes: Object.freeze({
    name: "aster.product.operation.outcomes",
    description: "Number of finite backend product operation results.",
    unit: "{operation}",
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
  nodeMemoryUsage: Object.freeze({
    name: "aster.nodejs.memory.usage",
    description: "Node.js heap, external and array-buffer memory by finite type.",
    unit: "By",
  }),
  processUptime: Object.freeze({
    name: "process.uptime",
    description: "Time the process has been running.",
    unit: "s",
  }),
});
