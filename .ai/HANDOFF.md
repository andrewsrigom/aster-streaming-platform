# Handoff

Phase 00 is released. P01-R01, P01-R02, P01-R03, P01-R04, and P01-R11 are released on `main`. P00-R06 is released through protected squash `92d3531` with post-merge run `32999467446` passing.

P01-R05 is released through pull request 12 as exact protected squash `4d243351bb46ae6b63a80a9ca3b9186baa3c68ac`. Final source review reported no major issue, all three availability discussions are resolved, protected closeout run `33004817099` passed, and exact post-merge run `33004926766` passed every applicable job.

P01-R06 is active on branch `feat/p01-r06-telemetry` from clean released squash `4d24335`. Its owner is shared telemetry/runtime infrastructure; it changes no product context or durable data. The local implementation adds `@aster/telemetry` with repository-owned finite metric contracts, Node.js runtime collection, HTTP/dependency recorders, process-local manual collection, optional bounded OTLP/HTTP export, export failure/drop health, lifecycle-compatible flush/shutdown, declaration isolation, and cardinality/privacy controls.

The exact direct package selection is OpenTelemetry API `1.9.1`, core/resources/metrics SDK `2.10.0`, OTLP HTTP metrics exporter `0.221.0`, and runtime-node instrumentation `0.34.0`. Official/registry compatibility, Apache-2.0 licenses, Node.js `24.19.0`, the resolved peer line, generated declarations, focused failure behavior, audit, and changed-scope gates pass. A Collector, Prometheus scrape, dashboards, alerts, SLOs, product metrics, dependency adapters, Identity service, and Docker changes remain outside P01-R06.

## Resume point

1. Review the local implementation diff against P01-R06, its privacy/cardinality invariants, metric conventions, and lifecycle behavior; batch only requirement-level corrections.
2. Run the forced complete graph and append its exact result to `evidence/phase-01/runtime-telemetry.txt`.
3. Commit the stable candidate, prove a frozen exact clean checkout, and repeat only gates invalidated by any remediation.
4. Run one initial review and one confirmation, then publish through protected CI and release before activating P01-R07.

## Do not do yet

- Do not add a Collector, Prometheus, Grafana, Tempo, Loki, dashboard, alert, SLO, scrape endpoint, or hosted telemetry resource.
- Do not add an application service, product metric, GraphQL schema/resolver, account/profile/session behavior, product database schema, cache key, event, broker, or object-storage behavior.
- Do not let caller-controlled IDs, URLs, query text, GraphQL documents, headers, errors, endpoints, credentials, trace/span IDs, or arbitrary strings become metric dimensions.
- Do not expose OpenTelemetry SDK or exporter types outside `@aster/telemetry`.
- Do not merge or close Dependabot pull request 1 without dedicated compatibility evidence and an authorized disposition.
