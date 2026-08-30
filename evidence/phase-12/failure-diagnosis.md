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
The first correction waits for the exact scenario boundary through recent-store
TraceQL before a Tempo V2 read. Exact finite queries and the actual Catalog
`title(id)` DataLoader path have focused regressions.

The corrected local candidate passes diagnostic/profile tests 12/12, platform
tests 87/87, the full Catalog suite 248/248 inside the aggregate gate and all
73 affected tasks with 59 cached in 51.067 seconds.

## Second protected runtime

Corrected source `b732be2773be2f7153166bb5cbe0fbea05cda5dc` ran in
workflow `33332980729`. Local-platform job `99314814021` created only project
`aster-p12-diagnostics-a55e436f-ae61-4f8c-a882-141418397304`.
Catalog again passed with trace `1a1398fe98eaf4e847ab9a1f704b71a2` and
the expected one-population/zero-good result.

For PostgreSQL trace `99e0a5052407fb076b462cb8203a201b`, the exact TraceQL
query completed before the runner entered its subsequent V2 poll. That V2 poll
still did not return the required recent boundary within 30 seconds. PostgreSQL
recovery and exact teardown passed; Redis did not run. The bounded transcript is
[protected-run-33332980729.txt](diagnostics/protected-run-33332980729.txt).

The refined runner now uses the exact TraceQL result's finite selected fields as
the boundary evidence. This preserves trace-ID correlation and rejects missing
dependency/outcome/status fields without assuming that a recent trace-by-ID read
is already complete. Focused diagnostic/profile tests pass 12/12 and the
refined affected gate passes 73/73 with 60 cached in 63.796 seconds. A third
protected run still had to prove all scenarios and cleanup.

## Third protected runtime

Selected-TraceQL source `817dbd690d5eddf8b6fffa00cfc42bf31edb6d4d`
ran in workflow `33333896159`. Local-platform job `99317260738` created only
project `aster-p12-diagnostics-17ba5e1d-f5ea-47bf-a60e-77ec77e2427d`.
Catalog passed with trace `a65a69f7175b1ab9287aa35e90c3ac32`, the expected
one-population/zero-good result and recovery.

The PostgreSQL request used trace `71e676892aa2cd91c0626af7e939fbb8`.
Its TraceQL query combined exact trace and dependency identity with a
failure-outcome predicate before selection and returned no match within 45
seconds. PostgreSQL recovery and exact teardown passed; Redis did not run. The
bounded transcript is
[protected-run-33333896159.txt](diagnostics/protected-run-33333896159.txt).

The correction keeps the exact trace/dependency query and finite `select`, then
requires `timeout`, `unavailable` or `error` in the existing classifier. Thus a
non-failed dependency span still fails acceptance without making the search
predicate depend on exporter representation of the selected outcome. Focused
diagnostic/profile tests pass 12/12 and the dependency-first affected gate
passes 73/73 with 60 cached in 64.055 seconds.

## Fourth protected runtime

Dependency-first source `e965c92301f1e5b62522bc5ddfe478f7c21558dd`
ran in workflow `33334497056`. Local-platform job `99318920595` created only
project `aster-p12-diagnostics-7d7bac32-5360-4691-806a-5c85d1fc8d5e`.
Catalog passed with trace `1b58032f6005809db6bc8b4aa43e2007`, the expected
one-population/zero-good result and recovery.

The exact PostgreSQL dependency search returned a selected fact and reached the
classifier. Classification still required the optional outcome/name projection
and did not use the selected intrinsic error status, so it rejected the fact.
PostgreSQL recovery and exact teardown passed; Redis did not run. The bounded
transcript is
[protected-run-33334497056.txt](diagnostics/protected-run-33334497056.txt).

Tempo's documented search response returns selected spans with intrinsic status
attributes. The correction therefore requires the exact dependency plus either
intrinsic `status=error` or one of the finite failure outcomes `timeout`,
`unavailable` and `error`. A success/unknown-status fact still fails.
Focused diagnostic/profile tests pass 12/12 and the finite dependency-failure
affected gate passes 73/73 with 60 cached in 53.918 seconds.

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
