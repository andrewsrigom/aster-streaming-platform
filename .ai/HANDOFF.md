# Handoff

## Resume point

Item62 (P12-R07) is released. Exact correction `8185a81`, tree `51dc011`,
passed protected run `33323508793` and clean confirmation. Evidence head
`4b6db71` passed protected run `33324696622`; PR50 squash main is `633e819` and
exact-main run `33325544350` passed every required job.

Item63 (P12-R10) is the sole `IN_PROGRESS` item on
`feat/p12-diagnostic-exercises`, based exactly on main `633e819`. Its active
plan is `.ai/CHANGE_PLAN.md`. The coherent implementation candidate is ready
for its branch commit and protected execution.

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
- Policy/profile tests pass11/11, CI/classifier tests pass35/35 and the focused
  Catalog trace regression passes1/1. The post-review affected candidate gate
  passes73/73 with62 cached in13.114 seconds. Documentation and pending evidence
  are current.
- Initial review corrected the global execution/cleanup budget, signal cleanup,
  listener scope, finite output categories and diagnostic CI invalidation.
  Confirmation found no remaining blocking source issue.

## External runtime state

The first real project was
`aster-p12-diagnostics-a548e736-f8d8-4600-8cac-6dbfc6decf1d`. Docker Desktop's
Linux engine failed during image build before any scenario completed. No client
process remained, but the unavailable engine prevented an exact container,
network or volume query. Cleanup is unresolved rather than claimed successful.
The latest single read-only WSL check returned `docker-client-unavailable`; no
restart, cleanup or repeated probe followed.

## Exact next actions

1. Commit and publish the reviewed candidate so the protected diagnostic CI
   lane performs the next real three-scenario execution.
2. Capture its three scenario/recovery/clean-finalizer results in
   `evidence/phase-12/failure-diagnosis.md`. When the original local engine is
   reachable, inspect and if necessary remove only the exact interrupted
   project above.
3. If runtime findings change the candidate, repeat the affected gate and only
   the invalidated review boundary; otherwise publish the reviewed candidate,
   pass protected CI and merge/exact-main Phase12 closeout.

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
