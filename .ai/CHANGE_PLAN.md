# Work Item: Trace-led Failure Diagnosis and Phase 12 Closeout

- Status: IN_PROGRESS
- Owner: Platform
- Phase: 12
- Requirement IDs: P12-R10
- Created: 2026-08-30
- Updated: 2026-08-30

## Outcome

Aster provides one optional, disposable diagnostic profile and a repeatable
operator exercise that diagnoses at least three injected Catalog-path failures
from user-impact metrics, searchable distributed traces and correlated
structured logs. Each exercise identifies the failing boundary, applies the
scoped runbook action and proves SLI recovery without reading implementation
source. Completion closes Phase 12 and explicitly checks Phase 13 prerequisites.

## Current behavior

P12-R01 through P12-R09 and P12-R11/R12 are released. PR50 reviewed correction
`8185a81`, evidence head `4b6db71`, protected run `33324696622`, squash main
`633e819` and exact-main run `33325544350` release P12-R07. The normal optional
observability profile exports bounded traces only to the Collector debug output,
exports metrics to Prometheus and exposes the immutable Grafana overview. The
released Phase 11 game days prove failure behavior; the base release did not yet
contain a searchable trace backend or trace-led three-scenario acceptance.

Published source `e0d1975` implements ADR-0044, the bounded
Tempo/Collector/Grafana profile, policy/adverse tests, exact scenario
orchestration, proportional CI and the focused Catalog database-trace
regression. Protected run `33331974187` passed Catalog diagnosis, PostgreSQL
recovery and exact cleanup, then failed because V1 trace-by-ID polling preceded
visibility of the required PostgreSQL span; Redis did not run. Correction
`b732be2` waited for the exact scenario boundary through TraceQL, and protected
run `33332980729` proved that match plus recovery/cleanup, but the subsequent V2
read was still incomplete and Redis did not run. The refined runner classifies
the exact TraceQL-selected finite span instead of requiring recent trace-by-ID
completeness. Focused diagnostics pass12/12. Protected run `33333896159` passed
Catalog diagnosis/recovery and exact cleanup, then showed that filtering the
PostgreSQL span by failure outcome before selection was too restrictive. The
current correction selects the exact dependency first and retains mandatory
failure-outcome validation in the classifier.
Protected run `33334497056` then returned the exact selected PostgreSQL
dependency, but classification ignored its intrinsic error status when optional
outcome/name projection was absent. The current correction requires exact
dependency plus either intrinsic error status or one finite failure outcome.
Protected run `33335112383` then stopped on an earlier selected PostgreSQL fact
without a failure mark. The current correction requires intrinsic error status
in the exact TraceQL predicate and keeps polling until parsed facts also contain
a failure signal. Failure-marked source `20110ec` and protected run
`33335707261` proved Catalog diagnosis, PostgreSQL recovery and exact cleanup,
then showed that the admitted read can be cancelled by the request deadline.
That dependency span correctly carries `aster.outcome="cancelled"` with
intrinsic status `unset`. The current correction queries and classifies only the
finite causal outcomes `timeout`, `cancelled`, `unavailable` and `error`; it
still excludes `success` and `rejected`.

Finite-outcome source `58779b98c991a81617f52894fd34368542a2e365` passed
protected run `33336386466`. Local-platform job `99323989054` diagnosed and
recovered Catalog service loss, PostgreSQL loss with causal outcome `cancelled`
and Redis degradation with causal outcome `unavailable`, then proved clean
zero-resource teardown. Source-quality job `99323989060` and aggregate `CI
required` passed. The three-scenario runtime acceptance is verified at that
exact source.

The finite-outcome correction's affected gate passes 73/73 tasks with 60 cached
in 56.093 seconds. The initial review added one global execution budget with
cleanup headroom, signal-driven cleanup, a proof-only Tempo listener, finite
diagnostic output categories and complete CI invalidation paths. The isolated
topology later supersedes that listener with Grafana-proxied query access.
Targeted
confirmation at evidence head `ab09592` completed with three blocking findings:
compare the multiline GraphQL document against its JSON-escaped form, remove
Tempo from product `platform`/`edge` networks through dedicated ingest and query
networks, and require Grafana's Tempo data-source health endpoint to return
`OK`. They are one security/acceptance remediation batch. The next candidate
passes focused diagnostic/profile tests 12/12, platform tests 87/87 and the
affected gate 73/73 with 59 cached in 50.323 seconds. Published source `00dfc26`
and protected run `33338133771` then proved the isolated Compose model starts
and cleans exactly, but the runner still requested a direct Tempo host port;
Docker correctly omitted that port from its internal-only networks. The current
correction removes Tempo from the proof overlay's published ports and sends
bounded TraceQL reads through Grafana's UID-scoped data-source proxy. Focused
diagnostic/profile tests pass 12/12, platform tests pass 87/87 and the affected
gate passes 73/73 with 59 cached in 62.801 seconds. Corrected source `0288555`,
tree `1ceeb20`, passed protected run `33338774702`: local-platform job
`99330472682` diagnosed and recovered all three failures through the isolated
Grafana-proxied topology and cleaned the exact project; source-quality job
`99330472705`, the Docker-only playable demo and aggregate job `99332541219`
also passed. Evidence head `3aca9e5` then passed every protected job in run
`33339712525`. Corrected exact-head confirmation found two blocking proof gaps:
the selected TraceQL result cannot prove privacy for attributes omitted by
`select(...)`, and a lockfile-only dependency change does not invalidate the
diagnostic exercise. The current remediation batch inspects a bounded, stable
full trace fetched through Grafana before declaring privacy and routes
`pnpm-lock.yaml` through the diagnostic gate with adverse coverage.
Published remediation `bf10756` selected the intended protected diagnostic job
in run `33341130651`. Local-platform job `99336871735` reached the first real
stored-trace check, then exposed that Tempo's OTLP JSON response encodes span
trace IDs as Base64 bytes rather than repeating the hexadecimal request ID.
Cleanup completed exactly. The current correction decodes the expected
hexadecimal ID to the OTLP Base64 representation and requires every returned
span to match it before the complete-trace privacy assertion. Focused
diagnostic/profile tests pass 13/13 and the affected gate passes 73/73 with 60
cached in 54.407 seconds. A corrected protected runtime remains required.
Corrected source `cf87b8c`, tree `30ccdf9`, passed protected run `33341630994`.
Local-platform job `99338255936` validated the full stored OTLP trace, diagnosed
and recovered all three required failures, and cleaned its exact project.
Source-quality job `99338255932`, documentation/security job `99338255943`,
dependency review `99338239593` and aggregate `99340328371` also passed. Final
evidence head `cc2db4c`, tree `910678e`, passed exact-head run `33342551385`.
Its permitted confirmation found two remaining blockers: diagnostic CI omitted
Catalog's Event Delivery/Object Storage/transitive Broker and root workspace/
TypeScript build inputs, and the primary operator guide retained a superseded
pending-acceptance claim. The current batch makes every diagnostic path imply
the platform job, covers those Catalog build inputs and records the completed
acceptance in the guide. Classifier tests pass 11/11 and the affected gate
passes 73/73 with 60 cached in 50.155 seconds. Corrected protection and confirmation
remain.
Corrected source `089f656`, tree `d9abb88`, passed protected run `33344001503`:
classifier `99344592918`, diagnostic local-platform `99344620047`, source
quality `99344620051`, documentation/security `99344620049`, dependency review
`99344593060` and aggregate `99347035124` all passed. Discussions
`3890928257`/`3890928260` are answered and resolved. Final evidence publication
head `21d9d06` then passed exact-head workflow `33345010435`, including the
complete three-scenario diagnostic exercise and Docker-only playable demo.
The permitted blocking-boundary confirmation found discussion `3891065894`:
the admitted PostgreSQL request could reject before the runner reached its
later `await`, temporarily leaving the rejection unobserved and allowing Node
to terminate before recovery/cleanup. The remediation immediately observes the
request and failure injection together with `Promise.allSettled`, preserves
injection-error precedence and rethrows only after both settle. Its focused
runner tests pass 10/10 and the affected gate passes 73/73 with 63 cached in
53.89 seconds. Repeated protected diagnostic acceptance and corrected
confirmation remain.

## Proposed behavior

Add a diagnostics-only Compose overlay that replaces only the Collector and
Grafana images with repository-owned diagnostic variants and adds unmodified,
digest-pinned Tempo 3.0.0 in monolithic mode. Tempo receives only privacy-filtered
OTLP/HTTP traces from the Collector, stores them on a size-bounded disposable
tmpfs, and is reachable only by Grafana and a loopback diagnostic endpoint.
Prometheus remains the metric source; existing structured container logs remain
the log source, so Loki is not added without a real ingestion and retention
path.

Run three sequential failures in one UUID-scoped disposable Catalog diagnostic topology:
Catalog service loss, Catalog PostgreSQL loss and optional Catalog Redis loss.
For each, start from the released Catalog-read SLI, locate the affected trace,
correlate its finite dependency/operation attributes with sanitized logs, apply
the matching restart/recovery action and verify the intended degraded or
recovered SLI. Never touch the retained demo or another Docker project.

## Boundaries

- Owning context: Platform owns diagnostic storage and orchestration; Catalog
  retains product decisions and PostgreSQL authority.
- Affected services/packages: Collector diagnostic configuration, Tempo,
  Grafana diagnostic provisioning, Compose policy, diagnostic runner, CI,
  runbooks and Phase 12 evidence.
- Authoritative data: PostgreSQL remains Catalog authority; traces, metrics and
  logs are disposable observations only.
- Read models/caches: Prometheus and Tempo are non-authoritative operational
  projections; Redis remains optional and non-authoritative.
- Trust boundaries: local GraphQL input, OTLP payloads, Tempo/Grafana query APIs,
  Docker project selection and captured logs are untrusted and bounded.
- External dependencies: unmodified Tempo 3.0.0 image pinned by multi-platform
  digest under AGPL-3.0-only terms; existing Collector, Prometheus and Grafana.

## Invariants

- The normal demo and observability profiles do not gain Tempo, extra memory or
  a new listener; the diagnostic overlay is opt-in.
- Only the exact UUID-scoped disposable Compose project may be stopped,
  restarted, queried or removed by the exercise.
- Tempo stores no product authority and no durable named volume.
- Trace attributes and logs contain no token, cookie, profile, title, request,
  GraphQL document, SQL text, credential or signed media URL.
- Every query, export, retry, queue, trace, result set, deadline, resource and
  cleanup operation is finite.
- Redis loss may preserve a good user SLI through PostgreSQL fallback; the
  exercise must report that as degraded dependency health, not fabricate user
  impact.
- Diagnosis uses released SLI, trace and log contracts rather than source-code
  inspection.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Tempo absent or unhealthy | diagnostic profile refuses readiness; product owners remain unaffected | bounded Collector export failure and Tempo health |
| Tempo export stalls | Collector drops after finite queue/retry budget; GraphQL serving remains bounded | Collector exporter queue/failure telemetry |
| Catalog service stopped | Catalog read becomes an honest failed/partial user outcome | Catalog-read SLI, Router-to-Catalog trace boundary and stable Router log category |
| PostgreSQL paused | Catalog cannot authorize/read durable publication state and fails honestly without destroying the disposable tmpfs | Catalog-read SLI, Catalog PostgreSQL dependency span/metric and correlated Catalog log |
| Redis stopped | Catalog falls back to PostgreSQL without changing durable truth | good Catalog-read SLI plus failed Redis dependency signal and degraded readiness/log |
| Recovery does not converge by deadline | exercise fails, preserves scoped logs/evidence and still removes only its disposable project | finite recovery timeout and exact remaining-resource report |

## Data and contracts

- Schema/migration: none.
- GraphQL: existing allowlisted Catalog browse operation only.
- Events: none.
- Cache: existing Catalog Redis cache-aside behavior only; no key or TTL change.
- Compatibility: additive diagnostic overlay and tooling; base/full profile
  behavior remains unchanged without that file.
- Retention/deletion: Tempo uses bounded tmpfs and at-most-one-hour trace
  retention; project-scoped teardown removes all diagnostic state.

## Security and privacy

- Authorization: no new product or hosted operator privilege; diagnostic APIs
  bind to IPv4 loopback or private Compose networks only.
- Input limits: fixed three scenarios, fixed operations/PromQL/TraceQL queries,
  finite result counts, request bodies and deadlines.
- Sensitive data: automated canaries reject identifiers, documents, SQL,
  credentials and signed URLs from traces/log evidence.
- Abuse cases: remote binding, arbitrary queries, project-name injection,
  persistent storage, unbounded trace size/search, hidden cleanup failure and
  use against production or retained projects are rejected.

## Implementation steps

1. Record the diagnostic-backend, retention, licensing and no-Loki decision in ADR-0044.
2. Add bounded Tempo, Collector export and Grafana data-source configuration in a diagnostics-only overlay.
3. Add policy tests for image pinning, network/listener/resource bounds, privacy, finite queues/search and exact cleanup.
4. Implement the three-scenario telemetry-led runner and adverse/recovery assertions.
5. Capture raw trace/metric/log evidence, update runbooks and close Phase 12 after the full acceptance gate.

## Tests

- Domain: not applicable; no Catalog domain rule changes.
- Application: diagnostic result classification rejects missing, ambiguous,
  oversized, sensitive or mismatched signals.
- Integration: real Tempo/Collector/Prometheus/Grafana health, OTLP export,
  exact-ID/boundary TraceQL selection and data-source checks.
- Contract: Compose/runtime image pins, exact topology, bounded resources,
  retention, query vocabulary, privacy and cleanup.
- Browser: existing playable demo remains protected; optional trace navigation
  is verified through the Grafana/Tempo API contract.
- Performance/failure: three sequential injected failures, bounded telemetry
  exporter outage, recovery and zero scoped resources after teardown.

## Evidence

- Commands: focused diagnostic policy/tests, exact Compose configuration,
  isolated trace-backend probe, three-scenario runner, `pnpm check:changed` and
  protected CI acceptance.
- Raw artifact path: `evidence/phase-12/failure-diagnosis.md` plus bounded raw
  JSON/text artifacts under `evidence/phase-12/diagnostics/`.
- Acceptance result: source implementation and focused evidence pass. The first
  protected runtime proves Catalog diagnosis, PostgreSQL recovery and exact
  cleanup. The second also proves exact PostgreSQL TraceQL selection, but both
  stopped before Redis on trace-by-ID completeness. The third proves the
  selected-span path for Catalog plus recovery/cleanup, then stops at the
  overly restrictive PostgreSQL outcome predicate. The fourth reaches
  classification with the exact PostgreSQL dependency but exposes the missing
  intrinsic-status fallback. The fifth stops on an earlier non-failure-marked
  dependency fact. The sixth reaches the causal
  PostgreSQL span and proves its deadline path is `cancelled`/`unset`. The
  seventh passes the finite dependency-outcome path for Catalog, PostgreSQL and
  Redis plus recovery and exact cleanup. Corrected source `0288555` repeats that
  complete acceptance with the escaped-document privacy check, dedicated
  internal networks, required Grafana data-source health and Grafana-proxied
  TraceQL; protected run `33338774702` and every required job pass.
- Iteration gate: diagnostic configuration/policy tests plus exact Tempo
  configuration validation and focused runner unit tests.
- Candidate gate: `CI=true NODE_OPTIONS=--max-old-space-size=1536
  TURBO_CONCURRENCY=4 pnpm check:changed`, documentation/AI checks, zero-finding
  secret scan and `git diff --check`.
- Heavyweight repeat triggers: repeat the real diagnostic profile and all three
  exercises only when its image/configuration, Collector pipeline, scenario
  orchestration, SLI/trace/log query or cleanup assertion changes.
- Review stopping rule: one complete initial review and one confirmation;
  extend only for requirement, telemetry integrity, privacy/security,
  availability, cleanup or public-contract blockers.

## Rollback or recovery

Remove the additive diagnostics overlay, diagnostic child images/configuration,
runner and Tempo provisioning. Base Collector, Prometheus, Grafana, product
services, schemas, media and retained demo remain unchanged. A failed exercise
uses the same exact project-scoped teardown and preserves no named trace volume.

## Documentation updates

- ADR-0044, observability architecture, local development, operational overview
  and Catalog/telemetry runbooks.
- Phase 12 evidence index and failure-diagnosis evidence.
- Licensing, repository state, queue, decisions ledger, session log and handoff.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
