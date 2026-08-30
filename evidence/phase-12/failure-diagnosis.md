# P12-R10 Trace-led Failure Diagnosis Evidence

Status: **implemented; protected runtime remediation in progress**

## Acceptance contract

The disposable `pnpm diagnostics:run` fixture must diagnose, in order:

1. Catalog service loss from the released Catalog-read SLI source to the
   Router-to-Catalog trace boundary and correlated Router log;
2. PostgreSQL loss during an already admitted Catalog read from the same SLI to
   one failed Catalog PostgreSQL dependency span and correlated Catalog log;
3. Redis loss as a completed PostgreSQL-backed read with one failed Redis span,
   cache-unavailable log and no fabricated user failure.

Every scenario must restore the exact service and complete a real TitleDetail
request. The run must reject request canaries, GraphQL documents, credentials,
SQL text, URLs and oversized telemetry, then remove only its UUID-scoped
project and prove zero matching containers, networks and volumes.

## Implemented evidence

- Tempo `3.0.0` is digest-pinned in an unmodified upstream runtime child image.
- The diagnostic overlay is absent from normal demo commands and gives Tempo a
  128 MiB tmpfs, one-hour retention, finite ingestion/search/concurrency limits,
  a loopback-only query API and no named volume.
- The Collector retains its privacy processor and debug exporter while adding
  one 128-item/one-consumer OTLP queue, one-second request deadline and
  two-second retry budget.
- Grafana provisions one immutable `aster-tempo` data source linked to the
  existing Prometheus metrics.
- The runner accepts no flags or target, generates a validated
  `aster-p12-diagnostics-<uuid>` name, uses ephemeral loopback ports and applies
  exact project-scoped mutation and cleanup.
- The PostgreSQL scenario admits the request before pausing the database by
  holding `catalog.public_candidates` through the exact
  `aster-p12-diagnostic-lock` application name; recovery terminates only that
  holder.
- A focused Catalog runtime regression proves a PostgreSQL dependency span for
  the request stays inside the inbound HTTP trace.

Current focused results on 2026-08-30:

```text
node --test tools/run-diagnostic-exercises.test.mjs tools/verify-diagnostics-profile.test.mjs
12 passed, 0 failed

node tools/verify-ci-policy.ts
status ok

node --test tools/verify-ci-policy.test.ts tools/classify-ci-change.test.ts
35 passed, 0 failed

node --test --test-name-pattern='keeps PostgreSQL observations' services/catalog/dist/test/runtime.test.js
1 passed, 0 failed (non-matching tests skipped)

CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4 pnpm check:changed
73 tasks passed, 59 cached, 0 failed, 51.067 seconds (corrected candidate)
```

These checks prove source policy and focused behavior only. They do not prove a
real Tempo/Collector/Grafana execution or the three diagnoses.

Initial source review corrected five blocking boundaries: one twelve-minute
execution budget with two minutes reserved for cleanup, SIGINT/SIGTERM cleanup,
a proof-only Tempo host listener, finite categories for emitted trace facts and
complete diagnostic CI invalidation paths. It also shortened the PostgreSQL
barrier poll and allowed the documented Tempo flush interval. The single
source confirmation review found no remaining requirement, telemetry-integrity,
privacy, availability, cleanup or public-contract blocker. The first protected
runtime subsequently exposed a trace-visibility blocker, which activates the
written stopping-rule exception and does not rewrite that earlier source review
as runtime acceptance.

## Interrupted real attempt

The first real runner created project
`aster-p12-diagnostics-a548e736-f8d8-4600-8cac-6dbfc6decf1d` and reached the
bounded image-build/start stage. Docker Desktop's Linux engine then stopped
responding; the Windows Docker client returned an HTTP 500 through its named
pipe and WSL no longer exposed the `docker` command. The runner process was
interrupted after the external build remained stuck. No diagnostic scenario
completed.

After interruption, process inspection found no remaining runner, Compose,
Buildx or BuildKit client process. Because the engine itself was unavailable,
container/network/volume absence for the exact project could not be queried.
This is an unresolved cleanup check, not proof of residual resources and not
proof of clean teardown. No WSL shutdown, Docker reset, broad deletion or retry
loop was performed.

After the post-review candidate gate, one bounded read-only WSL check returned
`docker-client-unavailable`. No second probe, engine restart or host mutation
was attempted. The protected diagnostic CI lane therefore owns the next real
execution; its result must not be described as local-host acceptance.

## First protected runtime

Published source `e0d197507f8627349c747b3ebc6400f1265cf1e9` ran in protected
workflow `33331974187`. Local-platform job `99311978785` created only project
`aster-p12-diagnostics-508ea1e9-6421-4497-a538-aaa9951b8af9`.
The Catalog scenario passed with trace
`79b8bc23b20f97208fb71159a32fea44`, diagnosis
`catalog_service_unavailable`, population delta one and good delta zero.

The admitted PostgreSQL request and scoped recovery both ran. Collector output
contained a failed `postgresql/query/timeout` dependency span, but the runner's
Tempo V1 trace-by-ID poll did not see that boundary within 30 seconds for trace
`18e610d67847ed530e6830d61f43b568`. Redis therefore did not run. The runner
and workflow finalizers both reported clean project teardown. This is a failed
acceptance with proven recovery and cleanup, not a passed diagnostic run.

The bounded transcript is
[protected-run-33331974187.txt](diagnostics/protected-run-33331974187.txt).
The correction now waits for the exact scenario boundary through recent-store
TraceQL before retrieving the trace through Tempo's V2 OTLP JSON endpoint. The
V2 wrapper, exact finite queries and actual Catalog `title(id)` DataLoader path
have focused regressions. A new protected run must prove all three scenarios.

The corrected local candidate passes diagnostic/profile tests 12/12, platform
tests 87/87, the full Catalog suite 248/248 inside the aggregate gate and all
73 affected tasks with 59 cached in 51.067 seconds.

## Remaining acceptance

Before release:

1. inspect and, if present, remove only the exact interrupted project above
   when that same local engine is reachable;
2. run one complete corrected `pnpm diagnostics:run` execution through the
   protected diagnostic CI lane or a healthy local engine;
3. record its three bounded scenario JSON events and clean finalizer result;
4. retain the passing affected candidate gate and run protected CI;
5. replace this pending status with the measured results, exact source/tree and
   release evidence.

No Phase 12 closeout or released trace-backend claim is valid before those
steps pass.
