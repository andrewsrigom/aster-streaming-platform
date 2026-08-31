# Work Queue

Only one item may be `IN_PROGRESS`; one frozen predecessor may be `WAITING_EXTERNAL`.

Phase09 is DONE through PR36 corrected exact `b5ccd59`, protected run33253867475,
clean exact-head confirmation, squash main `ffe8e24` and exact-main
run33254719311. P10 Catalog cache-aside is DONE through PR37 exact `cb86c37`,
protected run33270889083, clean confirmation comment5464418106, squash main
`903f7b4` and exact-main run33272501078. No Redis result may replace the
PostgreSQL visibility/version fence or authorize a durable decision. The history
below retains the remediation sequence that produced that release.
Protected run33260411345 passed at b65688b, but final-confirmation
discussion3886966492 found uncoordinated cold negative fence reads. Exact
correction62afee1 coalesces and leases the negative key before PostgreSQL;
corrected confirmation discussions3887086778/82 then found cross-time visibility
sharing and persistent wrong-type keys. Exact2930332 scopes fence sharing by
request time/policy and makes the bounded Redis script classify non-string values
for exact deletion. Catalog244/244, Redis17/17, affected73/73 and repeated real
Redis/PostgreSQL fixtures pass. Corrected publication, confirmation and protected
acceptance remain. Discussion3887146000 then found that an otherwise recognizable
absence marker could survive without bounded Redis expiry. Exact f50acbb embeds
and validates cache time, deletes missing/future/over-age envelopes and rechecks
the owner. Catalog245/245, affected73/73 and repeated Redis/PostgreSQL fixtures
pass. Protected run33265036497 passed exact4afe12f, but review discussion
3887201296 found owner-inclusive waiter buckets. Exact6088bf8 now counts only
attached callers for both refresh paths; Catalog245/245 and affected73/73 pass.
Review discussion3887242213 then found bounded control-byte reads destroyed the
shared Redis connection before malformed cleanup. Exact997ef27 preserves the
bounded reply for Catalog parsing/deletion. Redis17/17, Catalog245/245,
affected73/73 and repeated real Redis with cleanup0 pass. Publication and hosted
acceptance remain. Protected run `33266926624` passed exact `edf7bc8`, but exact-head
review discussions `3887280597`/`3887280599` found permanently contended malformed leases and
zero-waiter reattachment misclassification. Exact local d93afbc uses atomic
type/expiry lease recovery and separate monotonic attachment counts. Redis17/17,
Catalog246/246 and repeated real Redis pass with malformed lease recovery,
cross-instance negative fence reads 1 and cleanup 0. Focused Identity passed 147/147
after one unrelated timing failure under broad parallel load; the capped affected
gate passed 73/73, 59 cached, in 90.953 seconds. Publication and hosted confirmation
remain. Protected run `33268669701` passed exact `d05dad3`; confirmation discussion
`3887360355` then found invalid UTF-8 expansion after the Redis-side bound. Exact
local `ce97596` keeps the reply binary through its 16 KiB check and fails fatal
UTF-8 decoding as malformed without resetting the connection. Redis 17/17,
Catalog 246/246, real invalid-byte recovery/cleanup and affected 73/73 with 50
cached in 126.735 seconds pass. Publication and corrected hosted confirmation
were still pending at that checkpoint.
Exact-head discussion `3887423663` then found finite leases with TTL above the
two-second policy remained contended for their full duration. Exact local
`f014ebe` recovers those keys atomically. Redis17/17, Catalog246/246 and repeated
real Redis pass with the seeded 24-hour lease replaced and cleanup0. The complete
affected gate passes 73/73 with 51 cached in 107.438 seconds; only hosted gates
remained at that checkpoint.

P10-R04 is DONE. PR39 exact `601cc95` passed protected run `33274397440` and clean
confirmation, squash-merged without bypass as main `6a2fe3a`, and exact-main run
`33275183338` passed. Its Discovery103/103, affected73/73, real Redis, browser,
eleven-service outage and release evidence remain linked under
`evidence/phase-10`. P10-R08 is DONE through PR40 exact `6d74873`, protected
run33281516077, resolved exact-head review, squash main `eed8229` and exact-main
run33282217705. Initial PR40
run33277368515 passed; exactade7379 corrects its three initial review blockers.
Protected run33279111820 passed exact041c75e; confirmation discussion3887901456
then found duplicate token charges across Engagement replicas. Exact c5ea7c8
atomically deduplicates the finite shared admission marker. Redis18/18,
Engagement124/124 and affected73/73 pass; the later request-digest correction and
protected release supersede this checkpoint.

Confirmation at `aa5e6af` found discussion3887956537. The local correction adds
the canonical request digest to shared admission identity, retaining key-only
local ordering. Engagement126/126 and the corrected73/73 candidate pass.
Protected run33281516077 verifies its real Redis/PostgreSQL boundaries; PR40 and
exact-main run33282217705 close the item. P11-R10 is the frozen external
predecessor; P12-R01 is the sole active unpublished dependent.

Rails/fallback/owner composition/telemetry confirmation found database-admission and migration-rollout blockers.
Admission is corrected. Precursor PR35 exact `8002594` passed75/75,42/42,
confirmation and protected CI, then squash-merged as main `583c835`; exact-main
run33244657936 passed. The dependent is rebased on that squash and ready for its
PR34 correction. Exact0d1a7ef passed protected run33245434181; remediation review
found partial-log classification and stale ADR execution wording. Both are fixed
locally with Discovery89/89 and final54/54 affected candidate in47.708s.
Exact8650670 passed protected run33246333963; final confirmation found only a
GraphQL architecture excerpt default20/schema default10 mismatch. Exactdf08a70
corrected it and passed protected run33247048014. Closeout review then found a
Catalog federation capacity mismatch: the genre branch can emit36 references
while Catalog admitted20. The local correction accepts36, rejects37 and retains
DataLoader owner batches of at most20; focused Catalog build and230/230 pass.
The corrected affected candidate passes54/54,38 cached, in55.844s.
Exactdbce479 was published; closeout review5057751709 found fallback could replace
cancelled/indeterminate primary results. The invalidated protected run33248060625
was cancelled. The local correction restricts fallback to empty/unavailable and
passes Discovery build,90/90 focused tests and the affected54/54 candidate in49.022s.
Historical stashes are superseded.

| Order | Work item | Requirement | Status |
|---:|---|---|---|
| 1 | Select and record the source-code license | P00-R01 | DONE |
| 2 | Reconcile Phase 00 traceability, sequence, and public-repository workflow | P00-R08 | DONE |
| 3 | Define engineering demonstration, local demo, and repository governance contracts | P00-R11 | DONE |
| 4 | Select and pin the supported Node.js and pnpm versions | P00-R03 | DONE |
| 5 | Initialize Git policy, pnpm workspace, Turborepo, and deterministic ignores | P00-R02 | DONE |
| 6 | Add strict TypeScript, formatting, linting, unused-code, import-boundary, and commit checks | P00-R04 | DONE |
| 7 | Add link, terminology, and unsupported-status-claim validation | P00-R05 | DONE |
| 8 | Add CI for install integrity, code checks, tests, documentation, secrets, and dependency review | P00-R06 | DONE |
| 9 | Add public contribution governance and repository templates | P00-R07 | DONE |
| 10 | Create the authorized public GitHub repository and apply verified protections | P00-R07 | DONE |
| 11 | Integrate `.ai/` state checks into the normal contribution workflow | P00-R08 | DONE |
| 12 | Document exact bootstrap, check, demo, and cleanup commands | P00-R09 | DONE |
| 13 | Verify a clean checkout, capture the Phase 00 evidence index, and close the phase | P00-R10 | DONE |
| 14 | Select local platform versions, resource bounds, and the first Docker runtime checkpoint | P01-R01 | DONE |
| 15 | Add an explicit project-scoped destructive local reset | P01-R02 | DONE |
| 16 | Validate process-start configuration and classify secrets | P01-R03 | DONE |
| 17 | Implement structured logging with redaction and trace correlation | P01-R04 | DONE |
| 18 | Select the HTTP adapter through an ADR and create the transport boundary | P01-R11 | DONE |
| 19 | Calibrate risk-proportionate verification and affected-scope feedback | P00-R06 | DONE |
| 20 | Implement lifecycle, health, and bounded graceful shutdown | P01-R05 | DONE |
| 21 | Define the bounded telemetry contract and runtime metrics | P01-R06 | DONE |
| 22 | Implement narrow PostgreSQL, Redis, broker, object-storage, clock, ID, and telemetry adapters | P01-R07 | DONE |
| 23 | Compose startup deadlines, dependency readiness, health routes, and the Identity reference skeleton | P01-R08 | DONE |
| 24 | Prove the reference runtime against real local dependencies | P01-R09 | DONE |
| 25 | Publish resource-aware profiles, troubleshooting, and the clean Docker-only Phase 01 closeout | P01-R10 | DONE |
| 26 | Select identity/session trust and implement the guarded local assertion boundary | P02-R01 | DONE |
| 27 | Resolve accounts and implement durable revocable local sessions | P02-R02 | DONE |
| 28 | Implement owned profiles, active selection, deletion policy and transactional outbox (also P02-R04 through P02-R08) | P02-R03 | DONE |
| 29 | Expose the Identity subgraph and verify sanitized authorization and concurrency behavior (also P02-R10) | P02-R09 | DONE |
| 30 | Model rights review, attribution and the title publication lifecycle | P03-R01 | DONE |
| 31 | Persist structured rights revisions and immutable review provenance | P03-R02 | DONE |
| 32 | Implement authorized operator workflow and publication/retirement transactions | P03-R06 | DONE |
| 33 | Implement published-only browse/detail, locale fallback and Catalog Federation schema | P03-R05 | DONE |
| 34 | Verify generated HLS publication, candidate-source reviews and the Catalog Docker runtime | P03-R04 | DONE |
| 35 | Compose versioned Identity/Catalog schemas and protect known operations | P04-R01 | DONE |
| 36 | Run Apollo Router with private subgraphs, trusted context, telemetry and partial-failure acceptance | P04-R02 | DONE |
| 37 | Implement public SSR, deterministic Apollo hydration, explicit seed and the accessible Web shell | P05-R01 | DONE |
| 38 | Approve one source and deliver its bounded immutable media pipeline | P06-R01 | DONE |
| 39 | Create owner-validated short-lived playback sessions through Federation | P07-R01 | DONE |
| 40 | Deliver accessible HLS player, preferences, QoE/errors and clean playable demo | P07-R04 | DONE |
| 41 | Record durable owner-authorized monotonic playback progress | P08-R01 | DONE |
| 42 | Read bounded owned history and continue-watching pages | P08-R06 | DONE |
| 43 | Add idempotent owned watchlist with current Catalog visibility | P08-R07 | DONE |
| 44 | Batch federated Title and Profile engagement fields per request | P08-R08 | DONE |
| 45 | Relay owner outboxes and verify idempotent consumers, deletion and rebuild | P08-R09 | DONE |
| 46 | Integrate honest player reports and resume, then close Phase 08 | P08-R11 | DONE |
| 47 | Build versioned Discovery projection, rebuild and bounded published-title search | P09-R01 | DONE |
| 48 | Compose independent home rails, safe fallbacks and freshness telemetry | P09-R03 | DONE |
| 49 | Integrate public SSR rails/search and private profile enhancement; close Phase 09 | P09-R10 | DONE |
| 50 | Implement rights-safe Catalog cache-aside, jitter, coalescing, lease and metrics | P10-R01 | DONE |
| 51 | Implement bounded Discovery stale-while-revalidate and refresh fallback | P10-R04 | DONE |
| 52 | Add operation limiters and prove outage, atomicity and hot-key behavior; close Phase 10 | P10-R08 | DONE |
| 53 | Register dependency policies and execute bounded retries for safe Catalog reads | P11-R01 | DONE |
| 54 | Add operation-scoped circuit breakers to safe Catalog reads | P11-R05 | DONE |
| 55 | Add a private bounded controlled failure-injection laboratory | P11-R08 | DONE |
| 56 | Run failure game days, update runbooks and close Phase 11 | P11-R10 | DONE |
| 57 | Standardize trace/log context, telemetry privacy and bounded exporter failure | P12-R01 | DONE |
| 58 | Export platform golden signals and backend product outcomes | P12-R03 | DONE |
| 59 | Define bounded browser playback telemetry and complete local QoE measurement | P12-R11 | DONE |
| 60 | Define executable SLIs, initial SLOs and error budgets | P12-R05 | DONE |
| 61 | Provision a bounded three-layer operational overview | P12-R12 | DONE |
| 62 | Implement multi-window SLO burn-rate alerts linked to runbooks | P12-R07 | DONE |
| 63 | Diagnose three injected failures from telemetry and close Phase 12 | P12-R10 | DONE |
| 64 | Generate trusted operations, enforce the environment rollout and document safe schema delivery (also P13-R02/R12) | P13-R01 | IN_PROGRESS |
| 65 | Enforce GraphQL parser, shape, list, cost and introspection controls (also P13-R04/R05/R10) | P13-R03 | READY |
| 66 | Enforce execution, concurrency, identity-rate and cache-scope controls (also P13-R11) | P13-R06 | READY |
| 67 | Prove N+1/query counts and owner authorization; close Phase 13 (also P13-R08/R09) | P13-R07 | READY |

P12-R01 corrected source `03abe8a`, tree `b1474c7`, implements the trace/export
slice. Protected run `33298943743` passed every job at previous exact head
`e5f93e1`. Blocker-focused confirmation discussions `3888781189` and
`3888781191` found that the actual media candidate omitted its exporter endpoint
and real Catalog events lacked active producer context. The exact media path now
passes the endpoint, and Catalog uses a finite trace-only producer span without
recording false broker dependency metrics. Telemetry18/18, Catalog247/247,
event delivery23/23, media runner3/3 and affected gate73/73 with53 cached in
53.307 seconds pass. Evidence head `9a058ee` passed protected run `33300561121`
and clean confirmation; PR45 squash main `ce66f9c` passed exact-main run
`33301425220`, so item57 is released. Item58 is rebased on that exact main.
PR46 initial review found three signal-integrity gaps after source `2270745`:
fabricated vendor pool counts, missing pending-outbox age before broker
connection and product duration buckets ending at ten seconds. Source
`4a0221e`, tree `ffa3ce8`, rejects malformed pool snapshots, observes the
claimed fact before the connection gate, extends product buckets through 300
seconds and requires new Node, pool and product metrics in protected real-
Collector CI. Telemetry 19/19, PostgreSQL 31/31, event delivery 25/25, focused
product/consumer 7/7 and affected 73/73 pass, with 28 cached in 63.79 seconds.
Protected run `33302931164` stopped before collection because Fetch did not
preserve the Router Host. The bounded `node:http` correction produced exact
head `95e3a73`, tree `c0eb46a`; protected run `33303267611` passed every job,
including real Collector/Prometheus export and the playable demo. Confirmation
found no blocker. PR46 squash-merged as tree-identical main `2245251`, and
exact-main run `33304196111` passed every job. Item58 is released. Item59 starts
from that exact main and owns the local browser first-frame/rebuffer contract,
explicit sampling/retention policy and truthful remote-collection boundary.
Its exact source `74780e5`, tree `412cc4c`, passes the local 19/19 focused,
116/116 Web and 14/14 affected gates. Protected run `33305864184` and the
single exact-head confirmation found no blocker. PR47 squash main `6dba10e`
has the same tree, and exact-main run `33307059156` passed every job. Item59 is
released. Item60 is the sole `IN_PROGRESS` item, rebased directly onto that
exact main. Initial PR48 review discussion `3889183230` found that the progress
query's 400 ms bucket was absent from runtime metrics. Corrected source
`0661a81`, tree `d7978e0`, exports that bucket and cross-validates every local
product SLI threshold against runtime boundaries. Contract4/4, telemetry19/19
and the affected60/60 gate with14 cached in63.357 seconds pass. PR48 owns the
remaining protected runtime and bounded confirmation sequence. Protected run
`33308328939` passed every job at head `60c72a7`, but confirmation discussion
`3889248449` found the Catalog query's absent 300 ms Router bucket. Source
`fa4f0b8`, tree `519908f`, adds that exact finite boundary, cross-validates
Router/query thresholds and requires live supergraph plus Catalog ratios.
The Local platform job in protected run `33309698941` proved the Catalog series
exists but incorrectly rejected its legitimate measured value of zero. Source
`ef78d11`, tree `3c21d78`, accepts finite live ratios in the inclusive range
zero through one while retaining absent-series rejection. Focused checks
pass31/31 and the accepted affected gate passes60/60 with45 cached in47.73
seconds. Evidence head `aca4aba`, tree `8d40140`, passed protected run
`33310118280`, including the live packaged ratios and every required job.
Discussion `3889248449` is answered and resolved. Final confirmation discussion
`3889344066` then found failure-only populations disappearing when no completed
series had existed. Source `757f6a0`, tree `e9c7d24`, derives zero only from the
same present population for recording and objective queries. Exact `promtool`
and27/27 focused checks pass; the corrected affected gate passes60/60 with50
cached in49.705 seconds. Invalidated run `33310999656` was cancelled. Corrected
protected run `33311729108` passed every job, but confirmation discussion
`3889416115` found idle populations could retain `0/0` as `NaN`. Source
`c4e6a76`, tree `cfc21f6`, filters ratios on positive denominators and adds
prior-traffic/preexisting-counter idle tests. Exact `promtool` and27/27 focused
checks pass; the corrected affected gate passes60/60 with50 cached in47.383
seconds. Final head `72d5656`, tree `2374279`, passed protected run
`33313090638` attempt2 and clean confirmation. PR48 squash main `a99d3d5` has
the reviewed tree; exact-main run `33314309449` passed every required job and
releases item60. Item61 is released. PR49 evidence head `ba3de93`, tree
`73ee596`, passed protected run `33318672382` and clean exact-head confirmation.
Its tree-identical squash main `c297d32` passed valid exact-main run
`33319514232`; the earlier same-SHA run `33319497475` was superseded by
concurrency rather than treated as release evidence. Item62 starts from that
exact main on `feat/p12-burn-rate-alerts`. It owns finite multi-window burn-rate
rules, Prometheus firing/recovery proof and alert-linked runbook navigation. The
local candidate now passes exact 9/26-rule Prometheus validation, all synthetic
cases, a fresh 35-rule packaged proof and the affected15/15 gate with3 cached in
53.889 seconds. Exact source `9fbc2d1`, tree `580f7ab`, is committed; evidence
head `88a9d02` opened PR50. Protected run `33322558877` exposed pre-first-
evaluation health `unknown` after rule syntax/full-profile/telemetry passed; its
CI project cleaned and the invalidated run was cancelled. The bounded one-
interval poll passes locally on fresh packaged attempt7/18 seconds. Corrected
affected gate passes15/15 with3 cached in52.346 seconds. Initial review
discussion `3889911170` then found
observability-only future diffs could skip platform/promtool; classifier and
dedicated regression are corrected. Classification/CI tests pass34/34 and the
final corrected affected gate passes15/15 with11 cached in3.476 seconds.
Exact correction `8185a81`, tree `51dc011`, passed protected run `33323508793`
with every required job. Discussion `3889911170` is answered/resolved, and the
single confirmation comment `5470101517` reports no major issue. Evidence head
`4b6db71` then passed protected run `33324696622`; PR50 squash main `633e819`
passed exact-main run `33325544350` and releases item62. Item63 starts from that
exact main on `feat/p12-diagnostic-exercises`. It owns the three trace-led
failure exercises, the concrete local trace-backend decision and Phase12
closeout; no Phase13 demand-control work starts early. ADR-0044, bounded Tempo/
Collector/Grafana configuration, the no-argument UUID-scoped runner,
proportional CI routing and focused tests are implemented. One local run stopped
during Docker Desktop image build. Published candidate `e0d1975` then passed
Catalog diagnosis, PostgreSQL recovery and clean teardown in protected run
`33331974187`, but its V1 trace read preceded dependency-span visibility and
Redis did not run. Correction `b732be2` then proved the exact PostgreSQL TraceQL
match, recovery and cleanup in run `33332980729`, but its V2 read remained
incomplete and Redis still did not run. The refined runner classifies the finite
TraceQL-selected span directly. Run `33333896159` passed Catalog/recovery and
cleanup but showed that prefiltering PostgreSQL by outcome was too restrictive;
the current correction selects the exact dependency first and validates its
failure outcome afterward. Run `33334497056` returned that dependency but
showed the classifier ignored intrinsic error status when its optional
outcome/name projection was absent. The current correction accepts only exact
dependency plus error status or a finite failure outcome. Run `33335112383`
then showed polling could stop on an earlier non-failure-marked dependency fact.
The current correction requires intrinsic error status in both TraceQL and
polling. Run `33335707261` then showed the request deadline can produce causal
outcome `cancelled` with status `unset`. The current correction matches only the
finite outcomes `timeout`, `cancelled`, `unavailable` or `error`; its affected
gate passes 73/73 with 60 cached in 56.093 seconds. Finite-outcome source
`58779b9` and protected run `33336386466` then passed all three diagnoses and
recoveries, exact zero-resource cleanup, source quality and aggregate
protection. Evidence head `ab09592` repeated the local-platform path, but
targeted confirmation found escaped-document privacy, Tempo product-network
reachability and missing Grafana data-source-health blockers. The local batch
corrects all three and passes focused diagnostics 12/12, platform tests 87/87
and the affected gate 73/73 with 59 cached in 50.323 seconds. Item63 remains
`IN_PROGRESS`. Published `00dfc26` and run `33338133771` then proved exact
cleanup but exposed the runner's direct Tempo host-port lookup as incompatible
with the accepted internal-only topology. The current correction publishes no
Tempo port and routes TraceQL through Grafana's UID-scoped proxy; focused tests
pass 12/12, platform tests pass 87/87 and the affected gate passes 73/73 with 59
cached in 62.801 seconds. Corrected source `0288555`, tree `1ceeb20`, passed
protected run `33338774702`: all three diagnoses/recoveries, exact cleanup,
source quality, playable demo and aggregate protection passed. Evidence head
`3aca9e5` passed run `33339712525`, but confirmation discussions `3890788286`
and `3890788287` found incomplete stored-trace privacy inspection and missing
lockfile-only diagnostic invalidation. The local batch checks a bounded stable
full trace, selects `pnpm-lock.yaml`, passes focused tests 23/23 and passes the
affected gate 73/73 with 63 cached in 44.855 seconds. Protected acceptance,
blocking-boundary confirmation and release remain. Published `bf10756` and run
`33341130651` selected the intended runtime but exposed Tempo's OTLP JSON Base64
span-ID encoding at the first complete-trace check; cleanup remained exact. The
local correction converts the hexadecimal expected ID, validates all stored
spans, passes focused tests 13/13 and passes the affected gate 73/73 with 60
cached in 54.407 seconds. Corrected source `cf87b8c`, tree `30ccdf9`, passed
protected run `33341630994`, including complete stored-trace privacy, all three
diagnoses/recoveries, exact cleanup, source quality, the Docker-only playable
demo and aggregate protection. Final evidence publication, confirmation and
release remain. Evidence head `cc2db4c`, tree `910678e`, passed exact-head run
`33342551385`; confirmation discussions `3890928257`/`3890928260` then found
missing Catalog transitive/root build-input diagnostic invalidation and a stale
operator-guide status. The current batch covers those paths, guarantees a
diagnostic path also selects the platform job, updates the guide, passes
classifier tests 11/11 and the affected gate 73/73 with 60 cached in 50.155 seconds.
Corrected source `089f656`, tree `d9abb88`, passed protected run `33344001503`,
including the selected diagnostic job and aggregate protection. Discussions
`3890928257`/`3890928260` are answered and resolved. Final evidence publication,
blocking-boundary confirmation and release remain.

Final correction `b646e496d0946262a688f34a118a896f6c40ebda`, tree
`789007d5f48d4a16c0a1b47b8e2554e1ee0e294a`, immediately observes the
diagnostic request and disruption promises. Protected run `33346575787`
attempt 2 passed the complete three-scenario runtime, source quality and
aggregate protection; discussion `3891065894` is answered and resolved, and
the final confirmation reported no blocker. PR51 squash-merged as tree-identical
main `2b77a32f43a87fcdfc5032faf856f369de183998`. Exact-main run
`33348247619` passed every required job, including the diagnostic runtime and
Docker-only playable demo. Item63 and Phase12 are released. Item64 starts from
that exact main on `feat/p13-trusted-operations`; it owns the source-generated
trusted-operation manifest, explicit local/integration audit workflow,
staging/production enforcement and safe schema/client rollout sequence.

P02-R09 is complete: [release evidence](../evidence/phase-02/release.txt). P03-R01 has [domain evidence](../evidence/phase-03/catalog-domain.txt); P03-R02 has [persistence evidence and its completed plan](../evidence/phase-03/catalog-persistence.txt). Phase 03 publication is PR 20; its technical fixture did not approve an actual film. The separate first-film approval belongs to Phase 06.

## Work-item rules

P09-R03 released a search-only readiness precursor accepting exactly
migration markers `1–2` or `1–3`. It does not apply migration3 or query rail
objects. After exact main, PR34 rebases and completes the rail migration,
owner-composed GraphQL and bounded telemetry. P09-R10 consumes those exact public
and private operations through existing Web SSR/private-client boundaries. It adds
no service, profile copy, Redux remote state, Redis authority or cross-owner SQL.

P10-R01 starts with Catalog public-title reads because the owner already has a
measurable bounded PostgreSQL path. The positive cache may reuse metadata only
after a current PostgreSQL visibility/version fence; browse ordering and playback
authority are not cached. Later P10 items reuse the proven primitives for optional
Discovery stale serving and operation limiters. No Phase11 retry/circuit policy or
Phase13 GraphQL calibration is implemented early.

Phase 07 has [protected release evidence](../evidence/phase-07/release.md). P08-R01 includes R02–R05 and atomic R09 intent; its protected/post-merge gates pass. P08-R06 has [protected closeout evidence](../evidence/phase-08/history-visibility.md). Watchlist has [protected closeout evidence](../evidence/phase-08/watchlist.md) under ADR-0032. Entity fields, relay and browser reports follow. No repeated CPU or film experiment.

- Move one item to `IN_PROGRESS` before changing code.
- `WAITING_EXTERNAL` requires a frozen evidenced candidate and permits only one later dependent local item under the predecessor-first release rule in `AGENTS.md`.
- Record its plan in `.ai/CHANGE_PLAN.md`.
- Do not mark `DONE` without linked evidence.
- Add newly discovered work only if it belongs to the active phase.
- Record future-phase ideas under the relevant specification rather than implementing them early.
- `READY` items after the active item are ordered runway, not authorization to start them concurrently.
