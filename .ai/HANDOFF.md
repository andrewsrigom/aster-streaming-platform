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

## Implemented candidate

- ADR-0044 selects unmodified digest-pinned Tempo 3.0.0 in monolithic mode for
  one diagnostics-only overlay; the normal demo remains unchanged.
- Tempo receives only the Collector's already filtered traces and uses bounded
  tmpfs, retention, ingestion, query and process resources.
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
  published candidate and platform tests pass87/87. The failure-marked TraceQL
  affected gate passes 73/73 with 60 cached in 52.91 seconds.
  Documentation and pending evidence are current.
- Initial review corrected the global execution/cleanup budget, signal cleanup,
  listener scope, finite output categories and diagnostic CI invalidation.
  Confirmation found no remaining blocking source issue.

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
The current correction requires intrinsic error status in the exact TraceQL
predicate and keeps polling until the parsed facts also contain failure.

## External runtime state

The first real project was
`aster-p12-diagnostics-a548e736-f8d8-4600-8cac-6dbfc6decf1d`. Docker Desktop's
Linux engine failed during image build before any scenario completed. No client
process remained, but the unavailable engine prevented an exact container,
network or volume query. Cleanup is unresolved rather than claimed successful.
The latest single read-only WSL check returned `docker-client-unavailable`; no
restart, cleanup or repeated probe followed.

## Exact next actions

1. Commit/push the failure-marked TraceQL remediation and let its protected lane execute all three
   scenarios. Capture results in `evidence/phase-12/failure-diagnosis.md`.
2. Obtain one targeted confirmation, merge, verify exact-main CI and close
   Phase12. Inspect/remove only the exact interrupted local project when its
   original engine is reachable.

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
