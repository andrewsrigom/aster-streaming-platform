# Handoff

## Resume point

Item62 (P12-R07) is released. Exact correction `8185a81`, tree `51dc011`,
passed protected run `33323508793` and clean confirmation. Evidence head
`4b6db71` passed protected run `33324696622`; PR50 squash main is `633e819` and
exact-main run `33325544350` passed every required job.

Item63 (P12-R10) is the sole `IN_PROGRESS` item on
`feat/p12-diagnostic-exercises`, based exactly on main `633e819`. Its active
plan is `.ai/CHANGE_PLAN.md`. Published candidate `e0d1975` is under runtime
remediation after protected runs `33331974187`, `33332980729` and
`33333896159`; dependency-first run `33334497056` adds the latest runtime
finding, followed by failure-marked run `33335112383`.
Failure-marked source `20110ec` and run `33335707261` add the current
`cancelled`/`unset` runtime finding.
Finite-outcome source `58779b9` passes protected run `33336386466`.

## Implemented candidate

- ADR-0044 selects unmodified digest-pinned Tempo 3.0.0 in monolithic mode for
  one diagnostics-only overlay; the normal demo remains unchanged.
- Tempo receives only the Collector's already filtered traces and uses bounded
  tmpfs, retention, ingestion, query and process resources. The current local
  correction removes Tempo from product networks: Collector uses only dedicated
  `diagnostics-ingest` and Grafana only `diagnostics-query` to reach it.
- Prometheus remains the metric source. Existing bounded structured container
  logs remain the log source; Loki is not added without a real ingestion and
  retention path.
- One no-argument UUID-scoped disposable Catalog diagnostic topology injects Catalog service,
  PostgreSQL and Redis loss sequentially. Diagnosis starts from the released
  Catalog-read SLI, follows searchable traces and correlated logs, then verifies
  intended degradation and recovery.
- The PostgreSQL scenario admits one blocked Catalog read before pausing the
  exact database. Recovery terminates only its named lock holder.
- Policy/profile tests pass12/12, CI/classifier tests passed35/35 at the
  published candidate and platform tests pass87/87. The finite-outcome
  affected gate passes 73/73 with 60 cached in 56.093 seconds.
- Initial review corrected the global execution/cleanup budget, signal cleanup,
  listener scope, finite output categories and diagnostic CI invalidation.
  Targeted confirmation at `ab09592` found JSON-escaped document privacy,
  product-network isolation and Grafana data-source-health blockers. The local
  batch corrects all three; focused diagnostics pass 12/12, platform tests pass
  87/87 and the affected gate passes 73/73 with 59 cached in 50.323 seconds. Its
  first protected run `33338133771` proved exact cleanup but exposed a direct
  Tempo host-port lookup incompatible with the new internal-only topology. The
  current correction removes that port and routes TraceQL through Grafana's
  UID-scoped proxy; focused diagnostics pass 12/12, platform tests pass 87/87
  and its affected gate passes 73/73 with 59 cached in 62.801 seconds. Its
  corrected source `0288555`, tree `1ceeb20`, passed protected run
  `33338774702`; local-platform job `99330472682`, source-quality job
  `99330472705` and aggregate job `99332541219` all passed.
- Evidence head `3aca9e5` passed protected run `33339712525`. Exact-head
  confirmation discussions `3890788286`/`3890788287` found that selected
  TraceQL fields were insufficient for stored-trace privacy proof and that
  lockfile-only changes skipped diagnostics. The local batch waits for a
  bounded stable full trace through Grafana, checks all stored attributes and
  adds `pnpm-lock.yaml` to diagnostic invalidation. Focused tests pass 23/23 and
  the affected gate passes 73/73 with 63 cached in 44.855 seconds.
- Published remediation `bf10756` and protected run `33341130651` reached the
  first full-trace check. Local-platform job `99336871735` failed because the
  runner searched the OTLP JSON response for the hexadecimal query ID while
  Tempo encodes span trace IDs as Base64 bytes; exact cleanup passed. The local
  correction converts hex to OTLP Base64, validates every stored span, passes
  focused tests 13/13 and the affected gate 73/73 with 60 cached in 54.407
  seconds.

## Protected runtime finding

Run `33331974187` passed Catalog diagnosis, PostgreSQL recovery and exact clean
teardown. Its PostgreSQL trace-by-ID poll ran before the required span became
query-visible; Redis did not run. Correction `b732be2` and run `33332980729`
then proved the exact PostgreSQL TraceQL match plus recovery/cleanup, but its V2
read remained incomplete and Redis still did not run. The refined runner uses
the exact finite TraceQL-selected span directly. Run `33333896159` passed
Catalog, PostgreSQL recovery and clean teardown, but the PostgreSQL query's
pre-selection failure-outcome predicate returned no match. The current
correction selects the exact dependency first and keeps failure-outcome
validation in the classifier. Run `33334497056` returned the exact selected
PostgreSQL dependency, but classification ignored intrinsic error status when
the optional outcome/name projection was absent. The current correction accepts
only exact dependency plus error status or a finite failure outcome.
Run `33335112383` then stopped on an earlier non-failure-marked dependency fact.
Run `33335707261` required intrinsic error status and therefore timed out after
the admitted PostgreSQL read was cancelled by the request deadline. Internal
telemetry intentionally records that causal span as `aster.outcome="cancelled"`
with intrinsic status `unset`. The current correction requires the exact
dependency plus one finite causal outcome: `timeout`, `cancelled`, `unavailable`
or `error`. It never accepts `success` or `rejected`.
Run `33336386466` then passed all three diagnoses and recoveries: Catalog
service loss, PostgreSQL outcome `cancelled` and Redis outcome `unavailable`.
Exact project cleanup, source quality and aggregate protection passed. Runtime
acceptance is verified at source `58779b9`.

## External runtime state

The first real project was
`aster-p12-diagnostics-a548e736-f8d8-4600-8cac-6dbfc6decf1d`. Docker Desktop's
Linux engine failed during image build before any scenario completed. No client
process remained, but the unavailable engine prevented an exact container,
network or volume query. Cleanup is unresolved rather than claimed successful.
The latest single read-only WSL check returned `docker-client-unavailable`; no
restart, cleanup or repeated probe followed.

## Exact next actions

1. Publish the full-trace privacy and lockfile-invalidation remediation, then
   require the protected three-scenario runtime.
2. Resolve discussions `3890788286`/`3890788287`, obtain the permitted
   blocking-boundary confirmation, merge after final protection, verify
   exact-main CI and close Phase12. Inspect/remove only the exact interrupted
   local project when its original engine is reachable.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Do not do yet

Do not add Loki, Alertmanager, hosted receivers, credentials, durable trace
storage or a field-SLO claim. Do not restart WSL/Docker automatically, reset
retained projects, delete by prefix or repeat host diagnostics. Phase13 starts
only after Phase12 exact-main release.
