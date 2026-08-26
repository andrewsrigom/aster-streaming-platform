# Skill: Observability

## Purpose

Make Aster explainable from the outside without relying on ad hoc production debugging.

## Telemetry principles

- Emit telemetry for decisions and boundaries, not every line of code.
- Correlate logs, metrics, and traces.
- Keep names stable and documented.
- Avoid high-cardinality metric labels.
- Keep sensitive data out of all telemetry.
- Measure user outcomes and dependency behavior.
- Attach enough context to reproduce, not enough to identify a person.

## Traces

Trace:

- GraphQL operation execution;
- router and subgraph calls;
- application use cases;
- PostgreSQL queries;
- Redis operations;
- event publication and consumption;
- object-storage operations;
- media processing stages.

Use bounded attributes such as operation name, subgraph, cache result, title publication state, rendition class, and error category.

Do not put raw query documents, tokens, email addresses, profile IDs, or signed URLs into span attributes.

## Metrics

Golden signals:

- request rate;
- error rate;
- latency;
- saturation.

Product and platform indicators:

- playback-start success;
- manifest request success;
- progress-write acceptance;
- cache hit and stale-serve ratios;
- event-loop delay;
- memory;
- database pool utilization;
- event consumer lag;
- media processing duration and failures;
- GraphQL rejected-operation count;
- circuit-breaker state changes.

## Logs

Use structured logs with:

- timestamp;
- level;
- service;
- environment;
- trace and span IDs;
- request or event ID;
- operation;
- outcome;
- error category;
- duration when useful.

Error logs preserve a sanitized cause chain. Avoid duplicate logging at every layer.

## SLI and SLO

An SLI must define:

- event population;
- good-event condition;
- exclusions;
- data source;
- aggregation;
- window.

An SLO must define target, window, owner, alert policy, and user impact.

Do not create an SLO merely because a metric exists.

## Alerts

Alert on symptoms that need action. Prefer multi-window burn-rate alerts for SLOs. Every alert links to a runbook and names an owner.

A dashboard without a decision it supports is not complete.
