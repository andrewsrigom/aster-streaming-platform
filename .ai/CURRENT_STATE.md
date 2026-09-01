# Current State

Last updated: 2026-09-01

## Active phase

**Phase 13 — GraphQL Performance and Security**

Status: **IN_PROGRESS**. Phases00–12 are released. P12-R10 final correction
`b646e496d0946262a688f34a118a896f6c40ebda`, tree
`789007d5f48d4a16c0a1b47b8e2554e1ee0e294a`, passed protected workflow
`33346575787` attempt 2, including the complete three-scenario diagnostic
runtime. Discussion `3891065894` is resolved and the final confirmation found
no blocker. PR51 squash-merged as tree-identical main
`2b77a32f43a87fcdfc5032faf856f369de183998`; exact-main run `33348247619`
passed every required job, including source quality, every owner integration,
the diagnostic runtime and Docker-only playable demo. Item64 implemented
P13-R01/R02/R12 on `feat/p13-trusted-operations` from that exact main:
one deterministic first-party operation manifest, exact admission under an
explicit environment policy, a bounded local/integration audit workflow and a
safe schema/client rollout. Initial PR52 run `33350909056` and review found four
real integration/contract blockers. Corrected source `0e4a4b3`, tree `61b32535`,
passes the affected candidate gate and protected run `33352310376`. Confirmation
discussion `3891493400` found a verifier-only CI-classification gap. Source
`b85230d`, tree `05532b63`, corrected it and run `33354040239` passed.
Blocker-focused discussion `3891588767` then found same-name manifest versions
collapsed by Web tests. Source `effc7fd`, tree `0acdba2a`, corrects it; exact-head
run `33355546182` passes. Discussions `3891672851`/`3891672854` then found
retained-body reprinting and unsafe pre-union rollback. Source `5f4a315`, tree
`7c15d925`, preserves retained bytes and defines the union rollback floor; run
`33357231869` passes. Discussion `3891772219` found AST locations still omit
ignored boundary bytes. Source `0bcdd68`, tree `7ad2f2d8`, now retains explicit
JSON body strings including every leading/trailing byte; Router11/11 and the
gate49/49 with38 cached in45.499 seconds pass. Evidence head `66fcab71` passed
protected run `33359022739`; discussion `3891772219` is resolved. Confirmation
discussion `3891915868` found Router generator-only changes could skip platform
CI. Source `64fa64e`, tree `35817101`, routes the complete Router package through
that proof; CI policy38/38 and gate49/49 with36 cached in64.294 seconds pass.
Protected run `33360643657` attempt1 had one transient TraceQL indexing timeout;
attempt2 passed every required job and discussion `3891915868` is resolved.
Blocker-focused discussion `3895588146` then found the packaged proof could pair
a retained `Browse` body with current variables. Source `2286c7f`, tree
`d253a5e`, joins the persisted body to the unique current schema-manifest hash
and fails closed on missing/ambiguous joins. Platform92/92 and gate49/49 with33
cached in98.949 seconds pass. Final source `a353164`, tree `f6925778`, separates
the current delivery index from the current-plus-retained enforcement union.
Evidence head `de50b3e` passed exact-head protected run `33410126892` and clean
confirmation; all ten review threads are resolved. PR52 squash main `fb5cf014`
retained candidate tree `a78f095`; exact-main run `33412728404` passed every
required job. Item64 is released. Item65 final candidate head `94c17b9`, tree
`d034c03`, passed protected run `33424006919`; PR55 squash main `8cd6c0b`
retained that tree, and exact-main run `33425758870` passed on attempt2 after
one isolated TraceQL indexing timeout. Item65 is released. Full Phase00–14 goal
stays active. Item66 is released: third corrected exact head `e6134ae` passed
protected run `33447062908`, its discussions are resolved, final confirmation
`5485910820` found no major issue, PR56 squash main `98deb52` retained the
candidate tree and exact-main run `33448911764` passed. Item67 is the sole
`IN_PROGRESS` item on `feat/p13-n-plus-one-authorization`, rebased onto that
released main. Published head `c9ef4ea` passed protected run `33470076413`.
Final confirmation discussion `3900877477` found the single-title workload
could not detect per-entity amplification. Local source `3d90dff`, tree
`331be6b`, now proves ten-title Search/Home hydration and repairs the Catalog
parameter boundary exposed by that workload. Real maximum-batch20 integration,
full Discovery runtime and affected73/73 gate pass. Published head `71f3ff5`
entered run `33474006491`; source/owners through Engagement passed, but Discovery
exposed an exact300 temporal assertion after returning legitimate freshness299.
Source `3d2f6ee`, tree `cef2ee2`, derives the valid 298–300-second projection
lease window. Focused proof5/5, full ten-title runtime and affected73/73 pass.

## Verified

Phases 00–12 are released locally through protected and exact post-merge CI. [Phase 08 acceptance](../evidence/phase-08/release.md) covers all twelve requirements, actual browser save/resume/library, event recovery and explicit limitations. [Phase 07 acceptance](../evidence/phase-07/release.md) covers playback; [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights/media evidence. [Phase 10 release](../evidence/phase-10/operation-limiters-release.txt) records the final limiter gate. [Phase 12 evidence](../evidence/phase-12/README.md) records traces, signals, executable SLIs/SLOs, alerts, dashboard and diagnostic acceptance. No hosted deployment is claimed.

P09-R01/R02/R06/R07 are released. [Search release](../evidence/phase-09/search-release.md)
records candidate `fc353c3`, protected run 33238473742, resolved review, squash
`0bdcb27` and exact-main run 33239191134. The 70 focused tests, real PostgreSQL,
11-service Kafka/Router runtime and 73-task candidate remain linked from the
[Phase 09 index](../evidence/phase-09/README.md).

P09-R03 releases migration 0003, independent featured/recent/
curated-trending/genre rails, stable recent fallback, nullable Engagement home
composition and finite OpenTelemetry product instruments. Discovery 90/90,
telemetry 10/10, PostgreSQL 18.6 and the 11-service Router runtime pass. The
failed SQL/guard harness attempts and exact cleanup are retained in [home SQL](../evidence/phase-09/home-rails-postgres.txt)
and [runtime evidence](../evidence/phase-09/home-rails-runtime.txt). Schema
compatibility and the [54/54 candidate gate](../evidence/phase-09/home-rails-candidate.txt)
also pass. PR34 exact `390b655` passed protected run33248598719 and clean
confirmation, squash-merged as `a3f969c`, and exact-main run33249289718 passed.

P09-R10 is [released](../evidence/phase-09/web-discovery-release.md) through
corrected candidate `b5ccd59`, protected run33253867475, clean exact-head
confirmation, PR36 squash main `ffe8e24` and exact-main run33254719311. Public
SSR home/search, owner-confirmed private continue-watching, explicit degradation
and Catalog/Playback isolation pass their recorded Web110/110, browser8/8 and
46/46 candidate gates.

## Current work

P13-R01/R02/R12 item64 is released. It generates an
Apollo manifest and finite Rhai matcher from the 25 reviewed operations,
packages both with Apollo Router 2.17.0 Core and binds each operation name to the
exact link-ready Apollo wire-document hash. Actual `HttpLink` bodies for all 19
Web operations match. One explicit retained source permits at most two reviewed
hashes per name during Router-first rollout. Explicit local/integration `audit`
preserves finite known-name diagnostics; `staging` and `production` fail startup
outside `enforce`. Enforce rejects missing, unknown and altered documents before
planning and emits only `matched`, `unknown` or `missing` trust results.

Initial PR52 run `33350909056` exposed audit SLI label loss in Local platform and
Playback, while review found source/wire hash drift and the missing rollout union.
Corrected source `0e4a4b3d5742f2458d082b59bac1efedf1651783`, tree
`61b325350149c9d5ba07b4ddc3c41cb324526984`, addresses the complete initial
round. Router11/11, Web118/118, focused policy36/36 and the affected gate49/49
with35 cached in72.599 seconds pass. Protected run `33352310376` then passed
every job, including enforce-mode Router telemetry and the playable demo.
Confirmation discussion `3891493400` found only that a future verifier-only
change could skip the Local platform lane. Source `b85230d`, tree `05532b63`,
adds the exact path to the finite classifier; classifier12/12 and affected
gate49/49 with36 cached in50.442 seconds pass. Protected run `33354040239`
passes. Blocker-focused discussion `3891588767` then found that Web tests kept
only one same-name manifest version by hash order. Source `effc7fd`, tree
`0acdba2a`, indexes all reviewed versions; Web119/119 and gate49/49 with35 cached
in54.987 seconds pass. Protected run `33355546182` passes. Follow-up discussions
`3891672851`/`3891672854` found retained-body reprinting and an unsafe pre-union
rollback after new-client exposure. Source `5f4a315`, tree `7c15d925`, now hashes
retained source bytes without reprinting and keeps the union Router as rollback
floor; Router11/11 and gate49/49 with35 cached in53.095 seconds pass. Protected
run `33357231869` passes. Discussion `3891772219` then found source locations
exclude ignored leading/trailing bytes. Source
`0bcdd68833c23f1ae61a1c07f5f93ac5d9d989e1`, tree
`7ad2f2d88d5c2848265f6bbf568ba4168aee3562`, replaces the ambiguous source
slice with bounded versioned JSON body strings and proves a boundary-inclusive
body/hash. Router11/11 and the final affected gate49/49 with38 cached in45.499
seconds pass. Evidence head `66fcab71` passed protected run `33359022739`,
including the packaged Router, every integration, diagnostics and playable demo;
discussion `3891772219` is resolved. Confirmation discussion `3891915868` found
that `apps/router/` itself did not select platform CI. Source
`64fa64e7650e422e4b1a4405555521afc95921bd`, tree
`35817101dd1cb1126b2bddb2a2e9646938f760d0`, adds that complete prefix and a
five-path generator/writer/main/package/verifier regression. CI policy38/38 and
the repeated gate49/49 with36 cached in64.294 seconds pass. Protected run
`33360643657` attempt2 passed after attempt1's isolated TraceQL indexing timeout;
discussion `3891915868` is resolved. Discussion `3895588146` found the runtime
verifier selected `Browse` by name only. Source
`2286c7f71a82011c2eb083cdf52de07dc7301f51`, tree
`d253a5e8e69abf18c29e8dd432b3c4225958aa73`, selects the exact current hash from
the schema manifest, proves retained-first and missing/ambiguous cases, and adds
that regression to the platform gate. Platform92/92 and gate49/49 with33 cached
in98.949 seconds pass. Final source
`a353164b36a7124c1721915ee07be09ca561de78`, tree
`f69257780d003d75ef575101a8e3c358fd9923cb`, keeps persisted/Rhai enforcement
as the bounded current-plus-retained union while the schema delivery manifest
identifies exactly one current version. Evidence head `de50b3e` passed protected
run `33410126892` and clean confirmation; PR52 squash main `fb5cf014` retained
tree `a78f095`, and exact-main run `33412728404` passed. APQ stays disabled.
PostgreSQL/data ownership, owner authorization, public GraphQL fields, Redis,
events and media remain unchanged.

P13-R03/R04/R05/R10 item65 is the sole active item on
`feat/p13-graphql-demand-controls`; PR55 is open. Initial source
`36b6af2cb114aa4dad2afddc39142ad5e5878c28`, tree
`e8fc58bbcbe3899b7b420adcdedfbd867173de0b`, upgrades owner metadata to
Federation v2.9, analyzes every exact current/retained trusted operation for
aliases, depth, roots, selections, nested list expansion and static owner cost,
and emits one bounded 25-operation demand artifact. Missing/invalid metadata,
overflow, parser amplification and every policy boundary fail closed. Router
18/18, verifier2/2 and the exact rebased affected candidate gate51/51 pass.
Initial protected run `33415238912` reached the real packaged Router but its
demand verifier rejected the valid HTTP 200 status used for a sanitized GraphQL
introspection error. Initial review discussion `3896477418` found the analyzer
bounded raw query bytes instead of the complete encoded request. Correction
`96dc6eab7b7deacea14a1661b6491c991d0d7a0c`, tree
`c708f9e226e3f45959afc75cd96aff4d0c776cb8`, requires structured error-only
HTTP 200 responses and bounds the canonical operation envelope at the Router's
32 KiB limit. Router19/19, verifier2/2 and the corrected affected gate51/51 with
38 cached in110.103 seconds pass. Protected run `33416680451` accepted the HTTP
status guard, then exposed that pinned Router redaction intentionally returns
only `GraphQL operation failed.` with code `UNAVAILABLE`, without a location;
the verifier had guessed `GRAPHQL_VALIDATION_FAILED`. Source
`55875ce2fcab48062c0a310593c96f14a46e3815`, tree
`9ac71a9c3f7f78f5d4fd4b0c688bc4f5ca2964d5`, asserts the exact finite redacted
response. Verifier2/2 and the repeated affected gate51/51 with41 cached in91.422
seconds pass. Exact head `0fd6c78738411ca1a515298eefe04ee2474d7da5`
passed protected run `33417515807`, including packaged GraphQL rejection,
owners, diagnostics and the Docker playable demo. Discussion `3896477418` is
resolved. Confirmation discussion `3896804794` found a removed non-root entity
field cost could silently fall back to an implicit weight. Source
`8395f7985173bb10af7dcb6f3aaafee298ed1452`, tree
`0a026a6a00cf481b0b9709a098e3b185668b07e8`, requires direct field cost on every
selected non-root field of a cost-owned type and explicitly annotates all
current `Title`/`Profile` fields. The demand profiles are unchanged. Router20/20
and the affected gate51/51 with32 cached in88.328 seconds pass. Corrected
candidate head `9f23640a65df42c89dc4ecfc645a0c5cf543e3f7`, tree
`7812620d0c4fe0862944884f5ed5504cb08a75fc`, passed protected run
`33420810495` attempt2. Attempt1's only failure was an unrelated transient
storage fixture assertion; the same unchanged integration and every later job
passed on the bounded rerun. Discussion `3896804794` is resolved, both review
threads are resolved and confirmation comment `5482516972` found no major
issue. Final candidate head `94c17b95e49322bb9425423018cfd56d0b8df779`,
tree `d034c033ec57e9b641fba04dae678ea082c944b7`, passed protected run
`33424006919`. PR55 squash main
`8cd6c0b25938f605ded95df736b2c53b4ecff150` retained that exact tree.
Exact-main run `33425758870` passed on attempt2 after attempt1's isolated
TraceQL indexing timeout; unchanged source/product jobs and cleanup were green.
Item65 is released.

P13-R06/R11 item66 is implemented locally on
`feat/p13-execution-rate-cache-controls` from exact released main `8cd6c0b`.
ADR-0047 and operation-demand manifest version2 give every exact trusted hash a
derived public/account/profile scope, one finite rate class, the existing
three-second/eight-request Router boundary and mandatory `no-store`. Router's
GraphQL service overwrites admitted response cache control; the fixed
pre-service oversized-body rejection is data-free and has no freshness or
validators. Identity profile create/update/delete share an eight-token/
two-per-second authorized-account limiter; selection uses sixteen/four-per-
second. PostgreSQL is Identity's sole readiness-critical dependency; Redis
outage keeps readiness and uses only bounded local admission.

Initial source `a090285`, tree `98d3064`, passed gate54/54 with20 cached in
178.363 seconds. Evidence head `59b7215`, tree `ee1c908`, opened PR56. Protected
run `33432579598` then exposed a real Identity subgraph readiness assertion and
Router startup failure from an unsupported static response-header YAML shape.
Initial review discussion `3897861197` found that exact durable mutation retries
used a fresh admission identity and could be rate-rejected before receipt
replay.

Corrected source `8d2633d052a44ad0d6f115be0641369f911c0820`, tree
`d75aca0b7097e47d5ef6beff6ce8222cae6d5b10`, validates canonical mutation input
and binds admission to mutation ID plus request digest, consults the distributed
decision before outage-only local state, and bounds local degradation by 1,024
buckets/8,192 expiring markers. It uses supported Rhai response handling,
strengthens transport-rejection checks and records Router failure logs.
Identity159/159, Router21/21, telemetry19/19, Router verifier5/5 and GraphQL
verifier3/3 pass. The complete real integration passed all11 scenarios in
150.963 seconds and cleaned remaining0. The isolated packaged Router proof
passed accepted/adverse cache behavior and removed its project. The corrected
affected gate passes57/57 with37 cached in95.749 seconds. Published head
`82ba630` passed protected run `33437257163`; initial discussion `3897861197` is
resolved. Confirmation discussion `3898385895` then found the 30-second
Redis/local marker could expire before the 86,400-second durable receipt, again
allowing an exact retry to be rate-rejected before replay.

Second corrected source `bf14e2c2a403558122d2ae27b827a382368b671f`, tree
`0084c671589711660e3a23aa87316d84f5b9bc41`, validates and authorizes the
canonical mutation, reads its retained PostgreSQL receipt before admission and
returns exact replay or changed-payload conflict immediately. Only a missing
receipt reaches the bounded limiter; the existing write path repeats owner
authorization. Identity162/162 pass. The second full all11 integration passed in
142.098 seconds and cleaned remaining0; exact committed source repeated the real
subgraph in18.137 seconds with an exhausted bucket, removed marker, retained
receipt replay, no marker recreation and cleanup0. The accepted affected gate
passes57/57 with46 cached in61.880 seconds after final evidence/documentation
updates. Published head `1e115fe` passed protected run `33442875698` and
discussion `3898385895` is resolved. Its blocker-focused review found that the
packaged verifier hard-coded 25 demand profiles instead of the bounded
current-plus-retained union (`3898857100`) and successful Redis decisions did
not prune expired local markers before capacity (`3898857110`).

Third corrected source `af47c625bc937cb6e41325bcbd9b64914db7b3b2`, tree
`bb2d47618032af388d5c3dfd8c698d39b83e6dda`, derives and validates the exact
persisted name/hash union with at most two versions per name. Identity prunes
expired markers before capacity on successful Redis and degraded local paths.
Identity163/163, Router verifier6/6 and the complete affected gate57/57 with39
cached in66.529 seconds pass. Evidence head `e6134ae` passed protected run
`33447062908`; both blocker discussions are resolved and final confirmation
`5485910820` found no major issue. PR56 squash main `98deb52` retained candidate
tree `897c44c`; exact-main run `33448911764` passed every required job. Item66
is released.

P13-R07/R08/R09 item67 is active from released item66 main `98deb52`. PR57
initial discussions `3899340521` and `3899340535` found that the original
1/3/5/1 measurements were owner-local and the audit accepted self-asserted
semantic labels. Corrected source `e0f5e27`, tree `da9b02b`, runs the exact audit
during composition and derives owner, authorization scope and resolution from
the five owner schemas, exact trusted-operation policy and implementation
contracts. Exact documents through Router observed TitleDetail2 (Catalog2),
SearchTitles5 (Catalog2/Discovery3), HomePublic7 (Catalog2/Discovery5) and
ContinueWatching7 (Catalog3/Engagement1/Identity3). Router26/26, query
proof15/15, strict Engagement build and both full disposable runtimes pass with
cleanup0. The 12-case matrix remains valid. The corrected affected gate passes
73/73 with36 cached in162.116 seconds. Published evidence head `aca2558` entered
protected run `33456003304`; attempts3 and4 repeated a post-restart
`SUBREQUEST_HTTP_ERROR` after Discovery was healthy with the preserved
generation. Recovery source `c5ae760`, tree `11b11c2`, adds one finite 10-second
probe that retries only that explicit transient transport classification. The
repeated local runtime passed in182.041 seconds with one recovery attempt in
129.793 ms and cleanup0. The final affected gate passes73/73 with64 cached in
52.555 seconds. Published evidence head `996798b` entered protected run
`33460420680`; Local platform and every earlier job passed, but Discovery proved
that Compose had replaced the stopped endpoint while Router retained its prior
address for the full probe. Process-restart source `c5b0eca`, tree `5dadb0a`,
uses `--no-recreate` and asserts container identity/network endpoint before the
same finite semantic probe. The full local runtime passed with unchanged exact
counts, preserved generation/identity/endpoint, one recovery attempt in64.738
ms and cleanup0 in181.547 seconds. The final affected gate passes73/73 with61
cached in65.141 seconds. Published head `be6b57d` entered protected run
`33462043470`; every earlier job and Local platform passed, while Discovery
proved the same container received a new direct endpoint. Final source
`02d6739`, tree `6d9e27b`, restarts only the Router process to renew local DNS,
re-resolves its loopback-only ephemeral port and retains the 10-second semantic
deadline. The full runtime passes with unchanged counts, both container
identities preserved, endpoint/port changes observed, exact generation/search,
one recovery attempt in269.302 ms and cleanup0 in111.911 seconds. The final
affected gate passes73/73 with61 cached in84.672 seconds. Evidence checkpoint
head `7272f3f` passed protected run `33463962414`, and both initial discussions
are resolved. Confirmation discussion `3900443731` found that the Engagement
worker could select an earlier deleted two-row profile after setup. Source
`f5fbe29`, tree `4f44b71`, now carries the exact setup profile privately into
measurement and removes arbitrary profile ordering. Focused proof3/3, strict
Engagement build, the complete runtime and corrected gate73/73 pass. The runtime
records ContinueWatching7 in104.127 ms, cleanup0 and retainedRuntimeTouched
false. Evidence head `10bef1f` passed protected run `33465978576` attempt2 and
discussion `3900443731` is resolved. Confirmation discussion `3900633355` found
that Catalog's audited one-query maximum omitted the normal cold fence/load pair
and its one fence-change retry. Source `20b5f27`, tree `700bdc4`, exports that
exact owner query plan, derives the worst-case budget as four and proves the
observed four-call retry sequence. Router consumes the owner contract and rejects
both a reduced total and removed retry. Catalog249/249, Router26/26 and the
affected73/73 gate with56 cached in86.394 seconds pass. No executable query
path, adapter, schema, authorization policy or measurement changed, so existing
heavyweight runtime evidence remains valid. Published head `65e5dc2` entered
protected run `33468676673`; dependency review, documentation/security and Local
platform passed, while source quality exposed that Router lint preceded the
top-level Catalog build declaration. Final source `1ec01c3`, tree `f27a9f8`,
uses a narrow typed `@aster/catalog/query-plan` subpath without duplicating plan
values. A fresh detached clean-checkout source gate passes63/63 with0 cached in
159.682 seconds; the repeated affected gate passes73/73 with63 cached in54.731
seconds. Published evidence head `c9ef4ea` passed protected run `33470076413`.
Final confirmation discussion `3900877477` found the single-title workload
could not detect per-entity query amplification. Local source `3d90dff`, tree
`331be6b`, seeds ten exact rights-valid titles and requires ten distinct Search
and Home hydrations. Its first run exposed that four parameters per fence made
ten entities require 43 parameters against the shared maximum32. Catalog now
sends one bounded JSON tuple parameter while preserving exact ID/version/
rights/publication matching. Catalog249/249 and real maximum-batch20 integration
pass with cleanup0. The complete Discovery runtime keeps SearchTitles5 and
HomePublic7 at ten entities, passes restart/failure/log assertions and cleanup0;
the affected gate passes73/73 with56 cached in69.532 seconds. Evidence
head `71f3ff5` entered protected run `33474006491`: clean source and every owner
through Engagement passed. Discovery retained ten distinct Search entities and
the exact query counts, but its harness rejected legitimate freshness299 because
it required exact300; cleanup0. The Local platform job independently timed out
waiting for TraceQL to index the PostgreSQL diagnostic after recovery and cleaned
its project. Source `3d2f6ee`, tree `cef2ee2`, validates the derived inclusive
298–300 interval from the existing lease/indexing contract. Focused proof5/5,
complete ten-title runtime and affected73/73 with60 cached in61.806 seconds pass
with cleanup0. Published evidence head `35d46d9`, tree `1371744`, passed
protected run `33475401067`. Documentation checkpoint `1ba7d1c`, tree `a41922f`,
then preserved every source/owner job but reproduced recent-store TraceQL
ordering timeouts in two different diagnostic scenarios on protected run
`33476967426`; both recovered and cleaned. Source `b2c77a8`, tree `a0b091c`,
adds Tempo's supported `most_recent=true` hint while retaining the exact
predicate, 45-second wait and all privacy/recovery/cleanup checks. Focused
tests14/14, a complete local three-scenario run and affected73/73 with60 cached
in62.328 seconds pass. Evidence head `a7c0ae6`, tree `267ab80`, passed protected
run `33480268553`: the corrected complete diagnostic exercise, exact cleanup,
every owner runtime, Docker-only playable demo and aggregate protection passed.
Documentation head `c195a1d`, tree `a028aa1`, passed protected run
`33481864676`, and all existing discussions were resolved. The permitted
confirmation opened discussion `3901909548`: both federated runners narrowed
observations to expected owners before validation. Source `a99b3af`, tree
`dc84bbc`, validates the complete observed owner set and removes the post-
observation exclusion field. Focused proof5/5, strict Engagement build, both
complete federated runtimes and affected73/73 with55 cached in65.919 seconds
pass with cleanup0. Evidence head `71823fe`, tree `5d075d0`, passed protected
run `33485233911`, including every source/owner runtime, the Docker-only demo,
all three platform diagnostics and exact cleanup. Discussion resolution, one
final corrected-candidate confirmation and release remain.

P12-R01 is released from source `03abe8a`, tree `b1474c7`. The
repository-owned adapter creates finite privacy-safe server, dependency and
event-producer spans, drives logger context, propagates child owner context,
links async events, bounds the media coordinator and exports metrics/traces
through finite OTLP queues and deadlines. Evidence is indexed under
`evidence/phase-12/`. Protected run `33298943743` passed the previous exact head;
its blocker-focused confirmation found the actual media endpoint and real
Catalog producer gaps. Both are corrected without claiming broker I/O for
durable outbox intent. The local candidate gate passes73/73 with53 cached in
53.307 seconds. Protected run `33300561121`, clean confirmation, PR45 squash
main `ce66f9c` and exact-main run `33301425220` complete its release. No hosted
backend, dashboard, SLO or product contract is claimed by this slice.

P12-R03 and the backend portion of P12-R04 are released through PR46 exact head
`95e3a73`, tree `c0eb46a`, protected run `33303267611`, clean confirmation,
squash main `2245251` and exact-main run `33304196111`. The slice exports finite
Node memory, PostgreSQL pool, event age/delivery and backend product-result
signals. Existing HTTP/dependency golden signals, cache metrics and
event-loop/V8 instrumentation remain active.

Source `4a0221e`, tree `ffa3ce8`, preserves the corrected linked Discovery
consumer while adding the finite metrics. Local review corrected future and
excessive event ages that were being clamped into false samples and assigned
the explicit non-primary pool roles. PR46 initial review then found that vendor
pool counters were sanitized into valid-looking metrics, outbox age was absent
before broker connection and product buckets ended at ten seconds. The batched
remediation rejects the whole malformed pool sample, records the claimed fact's
finite unavailable outcome/valid age before the connection gate, extends
product buckets through 300 seconds and requires Node, pool and product metric
names from the real Collector in protected CI. Telemetry 19/19,
PostgreSQL 31/31, event delivery 25/25, combined product/consumer 7/7 and the
affected gate 73/73 with 28 cached in 63.79 seconds pass. Protected run
`33302931164` exposed only a diagnostic bug: Fetch did not preserve the Router's
required Host and received 403 before collecting metrics. The bounded probe now
uses `node:http` with the explicit reviewed Host. The corrected exact-head and
exact-main runs both passed the real Collector/Prometheus assertion, all
protected integrations and Docker playable demo.

P12-R04/R11 browser QoE is released from exact source `74780e5`, tree `412cc4c`,
based exactly on released main `2245251`. The player measures session,
manifest, decoded first frame, rendition, rebuffer, fatal-error and completion
events in a 64-sample memory-only journal without identifiers or media URLs.
This slice makes its sampling and lifetime explicit, adds an aggregate
first-frame/rebuffer result, clears observations on retry/unmount and prevents
pause/seek time from becoming false rebuffer time. Remote collection remains
disabled until a separately reviewed trusted ingestion and retention design
exists; no endpoint or field-QoE claim is implied.

Focused recorder/adapter tests pass19/19 and the complete Web suite passes
116/116. Typecheck and scoped lint pass. The affected candidate gate passes
14/14 tasks with one cached in48.518 seconds, including production Web build,
public-artifact/privacy checks, documentation, architecture, security and AI
state. One read-only Docker query found no local daemon before resource
creation, so the changed playable-browser proof was delegated to protected CI;
no WSL/Docker restart or repeated host diagnostic was attempted.

Protected run `33305864184` and the single exact-head confirmation found no
blocker. PR47 squash main `6dba10e` retained the reviewed tree, and exact-main
run `33307059156` passed every required job, including the changed playable
browser journey. Item59 is released.

P12-R05/R06 is rebased directly on exact main. Initial PR48 review discussion
`3889183230` correctly found that the 400 ms progress query selected a histogram
bucket absent from runtime metrics. Corrected source `0661a81`, tree `d7978e0`,
adds that exact finite bucket and a cross-contract regression. It defines four
machine-readable SLI populations, good events, exclusions, sources,
aggregations, owners and windows plus initial objectives and error budgets. Nine
Prometheus recording rules use finite Router or released backend product
metrics; no-traffic windows do not become artificial success. Contract tests
pass 4/4, telemetry tests 19/19, Router tests 10/10 and platform policy 23/23.
Exact Router 2.17 configuration validation and Prometheus 3.14 `promtool`
rule/synthetic tests pass. The corrected affected gate passes 60/60 tasks with
14 cached in 63.357 seconds. Browser first-frame remains a local diagnostic
because remote sampling and retention are zero. PR48 protected packaged
Router/Prometheus run `33308328939` passed every job at head `60c72a7` and
proved the live supergraph ratio. Confirmation discussion `3889248449` then
found that the live Router histogram omitted the Catalog query's 300 ms bucket.
Source `fa4f0b8`, tree `519908f`, adds the exact finite Router boundary, rejects
Router/query threshold drift and makes protected CI require both live
Router-backed ratios. Exact Router configuration and31/31 focused checks pass;
an earlier affected repeat passed60/60 with50 cached in49.715 seconds. A first
repeat was discarded because the untracked upstream verifier archive correctly
failed repository size policy; that exact temporary file was removed. The Local
platform job in protected run `33309698941` then proved the Catalog ratio series
exists and exposed only a diagnostic assumption: a measured zero ratio is valid
when every live request misses the 300 ms good-event threshold. Source
`ef78d11`, tree `3c21d78`, accepts finite live ratios from zero through one while
retaining the separate absent-series rejection. Focused checks pass31/31 and the
accepted affected gate passes60/60 with45 cached in47.73 seconds. Evidence head
`aca4aba`, tree `8d40140`, passed protected run `33310118280`, including the
packaged Router/Prometheus probe and every required job. Discussion `3889248449`
is answered with exact evidence and resolved. Final confirmation discussion
`3889344066` then found that a failure-only window omitted the ratio when its
good-event label set had never existed. Source `757f6a0`, tree `e9c7d24`, derives
zero only from the same present population for recording and full-window
queries. Exact Prometheus rule/tests and27/27 focused contract/platform checks
pass; excluded-only/no-population queries remain absent. The corrected affected
gate passes60/60 with50 cached in49.705 seconds. Invalidated run `33310999656`
was cancelled. Protected run `33311729108` passed every job at head `0ac7201`,
including exact rules, real telemetry and the playable demo. Confirmation
discussion `3889416115` then found that an earlier population becoming idle
could retain a `0/0` `NaN` ratio. Source `c4e6a76`, tree `cfc21f6`, filters every
recording and objective ratio on a positive denominator. Exact Prometheus tests
cover prior-traffic and preexisting-counter idle windows;27/27 focused checks
pass. The corrected affected gate passes60/60 with50 cached in47.383 seconds.
Protected run `33313090638` attempt1 reached an external BuildKit EOF before the
profile build; rerunning only failed jobs as attempt2 passed every exact-head
job. The exact-head review found no remaining blocker. PR48 squash-merged as
main `a99d3d5` with reviewed tree `2374279`; exact-main run `33314309449` passed
every required job and releases P12-R05/R06.

P12-R12 is released. ADR-0042 selects the
unmodified digest-pinned Grafana OSS 13.2.0 runtime. The local candidate bakes a
read-only Prometheus data source and one 15-panel dashboard, publishes only
loopback port3001, grants finite anonymous Viewer access, joins only `edge` and
uses disposable bounded tmpfs state. Fixed queries separate user impact,
dependency health and runtime saturation. Grafana is absent from product and
`platform-status` readiness. The initial complete candidate gate passed15/15
tasks in74.899 seconds. Protected run `33316483464` then exposed an
underprovisioned64-PID/256-MiB Grafana startup plus attempted background plugin
installation. One isolated local probe reproduced it and measured100 startup
PIDs,87 healthy PIDs and253.2 MiB. The correction uses128 PIDs,384 MiB and
disables plugin preinstallation/automatic update. Its isolated repeat became
healthy with99 PIDs/225.9 MiB, provisioned the read-only data source/dashboard,
emitted no plugin-installer/thread failure and left zero scoped resources. The
resource-corrected complete candidate gate passed15/15 tasks in62.976 seconds.
Initial review discussions `3889614208` and `3889614213` then found a mismatched
Playback SLI label and stale `lastNotNull` range semantics. The batched local
correction uses released `playback_start`, cross-checks all four dashboard IDs
against the SLO contract and makes their ratio queries current-instant only.
Focused dashboard/platform tests pass39/39; combined focused CI/platform/reset
tests pass62/62. The corrected complete candidate passes15/15 tasks with2 cached
in81.29 seconds. Protected run `33317459549` then built the corrected full
profile and passed packaged telemetry but exposed a CI-only exact-string defect:
Grafana13 formats `/api/health` as valid whitespace-bearing JSON. A unique
two-container local probe confirmed health, fixed data source, exact Playback
query and immutable dashboard; all scoped resources were removed. The bounded
assertion now tolerates JSON whitespace while requiring `database=ok`. Its
focused CI policy tests pass23/23. The corrected complete candidate passes15/15
tasks with3 cached in77.929 seconds. Exact source `c678484`, tree `397ead5`, then
passed every protected job in run `33317834141`, including full-profile Grafana
health, fixed data source/query/dashboard, optional failure isolation and the
complete playable/integration suites. Both initial review discussions are
evidenced and resolved. Evidence head `ba3de93`, tree `73ee596`, then passed
protected run `33318672382` and clean confirmation. PR49 squash main `c297d32`
retained that tree, and valid exact-main run `33319514232` passed every required
job; earlier same-SHA run `33319497475` was superseded by concurrency.

P12-R07 is released. Its candidate from exact main `c297d32` implements the
reviewed rapid 1h/5m and
6h/30m pairs for three page-class SLIs and sustained 1d/2h and 3d/6h pairs for
all four. Complete sampled coverage suppresses fresh/evicted partial windows.
Prometheus 3.14.0 reports 9 valid SLI rules and 26 valid alert-policy rules; all
synthetic firing, suppression and recovery cases pass. A fresh isolated packaged
image exposed 35 healthy live rules, seven alert instances, the 3-day coverage
guard and zero active no-traffic alerts. Focused policy tests pass68/68; the
affected candidate passes15/15 with3 cached in53.889 seconds, including
platform75/75 and CI policy33/33. The candidate links to the immutable overview
and complete runbook. No external receiver or historical compliance claim is in
scope. Exact source `9fbc2d1`, tree `580f7ab`, contains the coherent feature;
evidence head `88a9d02` opened PR50. Protected run `33322558877` passed rule
syntax/tests, full-profile startup and telemetry but queried rule health before
the one-minute alert group completed its first evaluation, returning `unknown`.
The exact CI project was removed and the invalidated run cancelled after the
decisive failure. A bounded 3-second poll over one complete evaluation interval,
followed by a fresh strict read, is corrected locally; a fresh packaged image
needed seven attempts/18 seconds and then passed all 35/7 assertions. Focused CI
policy tests pass23/23; the corrected affected gate passes15/15 with3 cached in
52.346 seconds. Initial review discussion `3889911170` then found that a future
observability-rule-only change could skip the platform/promtool job. The
classifier now routes all `infra/observability/` plus the SLO verifier/tests to
that job, with dedicated path regression; combined classification/CI policy
tests pass34/34. The final corrected affected gate passes15/15 with11 cached in
3.476 seconds, including platform75/75, documentation, memory, formatting,
lint, typecheck and a zero-finding secret scan. Publication, protected
acceptance and review were still pending at that checkpoint. Exact correction
`8185a81`, tree `51dc011`, then
passed every required protected job in run `33323508793`, including exact
Prometheus rule tests, the 35-rule/seven-alert packaged assertion, all owner
integrations and the playable demo. Discussion `3889911170` is answered with
that evidence and resolved. The single exact-head confirmation comment
`5470101517` reports no major issue. Evidence head `4b6db71` passed protected
run `33324696622`; PR50 squash main `633e819` passed exact-main run
`33325544350` and closes the item.

P12-R10 is the sole active item on `feat/p12-diagnostic-exercises` from exact
main `633e819`. ADR-0044 and published candidate `e0d1975` implement a diagnostics-only,
digest-pinned Tempo profile plus one no-argument UUID-scoped runner. It uses the
released Catalog SLI source, the exact Router trace, privacy-filtered Tempo
search and correlated bounded logs to diagnose Catalog service loss, a
PostgreSQL failure after request admission and Redis degradation. Recovery and
cleanup target only the disposable project. Protected run `33331974187` passed
Catalog diagnosis, PostgreSQL recovery and exact cleanup, then failed because
V1 trace retrieval preceded query visibility of the required PostgreSQL span.
Correction `b732be2` and run `33332980729` proved the exact PostgreSQL TraceQL
match plus recovery/cleanup, but the subsequent V2 read remained incomplete;
Redis still did not run. The refined runner uses the exact finite TraceQL span
directly. Focused diagnostic/profile tests pass12/12, platform tests pass87/87
and the refined aggregate gate passes 73/73 with 60 cached in 63.796 seconds.
Protected run `33333896159` then passed Catalog diagnosis/recovery and clean
teardown, but its PostgreSQL TraceQL predicate filtered on failure outcome
before selection and timed out; PostgreSQL recovered and Redis did not run. The
current correction selects the exact dependency span and leaves the mandatory
failure-outcome check in the classifier. Its aggregate gate passes 73/73 with
60 cached in 64.055 seconds.
Protected run `33334497056` then passed Catalog diagnosis/recovery and clean
teardown. Its exact PostgreSQL dependency search returned a selected fact, but
the classifier ignored intrinsic error status when the optional outcome/name
projection was absent; PostgreSQL recovered and Redis did not run. The current
correction requires exact dependency plus either intrinsic error status or one
finite failure outcome.
Its aggregate gate passes 73/73 with 60 cached in 53.918 seconds.
Protected run `33335112383` then passed Catalog diagnosis/recovery and clean
teardown but stopped on a selected PostgreSQL fact that was not failure-marked;
PostgreSQL recovered and Redis did not run. The current correction requires
exact dependency plus intrinsic error status in TraceQL and keeps polling until
the parsed finite facts also contain a failure signal.
Its aggregate gate passes 73/73 with 60 cached in 52.91 seconds.
Protected run `33335707261` then passed Catalog diagnosis/recovery and clean
teardown but its PostgreSQL trace did not match intrinsic error status because
the request deadline can produce causal outcome `cancelled`, which maps to
status `unset`; PostgreSQL recovered and Redis did not run. The current
correction matches only the finite outcomes `timeout`, `cancelled`,
`unavailable` and `error`. Its aggregate gate passes 73/73 with 60 cached in
56.093 seconds.
Initial review corrected execution/cleanup headroom, signal handling, listener
scope, diagnostic output categories and CI invalidation. Finite-outcome source
`58779b98c991a81617f52894fd34368542a2e365` passed protected run `33336386466`:
Catalog, PostgreSQL and Redis diagnoses/recoveries, exact project cleanup,
source quality and aggregate protection all passed. Targeted confirmation at
evidence head `ab09592` found three blockers: multiline GraphQL canaries were
not matched after JSON escaping, Tempo shared product networks, and the runner
read Grafana provisioning without calling data-source health. The local batch
checks escaped canaries, places Tempo only on dedicated internal ingest/query
networks and requires Grafana health `OK`; focused diagnostics pass 12/12. The
platform suite passes 87/87 and the affected gate passes 73/73 with 59 cached in
50.323 seconds. The prior runtime remains supporting evidence, but this
topology/acceptance change requires the protected three-scenario run again.
Published source `00dfc26` and protected run `33338133771` then started the
isolated profile but failed at startup because the runner requested a direct
Tempo host port that its internal-only networks correctly do not provide. The
exact diagnostic project was cleaned to zero. The current correction publishes
no Tempo port and sends bounded TraceQL reads through Grafana's UID-scoped
data-source proxy; focused diagnostic/profile tests pass 12/12, platform tests
pass 87/87 and the affected gate passes 73/73 with 59 cached in 62.801 seconds.
Corrected source `0288555`, tree `1ceeb20`, passed protected run `33338774702`.
Local-platform job `99330472682` diagnosed and recovered Catalog, PostgreSQL and
Redis failures through the isolated topology and cleaned exact project
`aster-p12-diagnostics-3be252e8-469d-4c05-8846-2154bcbbdca1`. Source-quality
job `99330472705`, the Docker-only playable demo and aggregate job
`99332541219` also passed. Evidence head `3aca9e5` passed protected run
`33339712525`. Its exact-head confirmation discussions `3890788286` and
`3890788287` found two remaining proof gaps: privacy inspected only the
TraceQL-selected fields, and a lockfile-only dependency change skipped the
diagnostic runtime. The local remediation waits for three identical bounded
full-trace snapshots through Grafana, checks the complete stored trace for raw
and escaped canaries, and classifies `pnpm-lock.yaml` as diagnostic-changing.
Focused tests pass 23/23; the affected gate passes 73/73 with 63 cached in
44.855 seconds. Published `bf10756` selected diagnostics in protected run
`33341130651`; local-platform job `99336871735` reached the first full-trace
check and exposed Tempo's OTLP JSON Base64 span-ID representation. The exact
project cleaned successfully. The current correction converts the hexadecimal
query ID to Base64, requires all returned span IDs to match, and then checks the
complete trace for privacy. Focused diagnostic/profile tests pass 13/13 and the
affected gate passes 73/73 with 60 cached in 54.407 seconds. Corrected protected
runtime source `cf87b8c`, tree `30ccdf9`, passed run `33341630994`.
Local-platform job `99338255936` proved complete stored-trace privacy, all three
diagnoses/recoveries and exact cleanup; source quality `99338255932`,
documentation/security `99338255943`, dependency review `99338239593` and
aggregate `99340328371` also passed. Final evidence publication and confirmation
remain. Evidence head `cc2db4c`, tree `910678e`, passed exact-head run
`33342551385`. Confirmation discussions `3890928257`/`3890928260` found that
Event Delivery, Object Storage, transitive Broker and root workspace/TypeScript
Catalog build inputs did not all select diagnostics, and that the operator guide
still called acceptance pending. The current batch covers those inputs, makes
diagnostic selection imply the platform job, updates the guide, passes classifier
tests 11/11 and passes the affected gate 73/73 with 60 cached in 50.155 seconds.
Corrected source `089f656`, tree `d9abb88`, passed protected run `33344001503`.
Classifier `99344592918`, local-platform `99344620047`, source quality
`99344620051`, documentation/security `99344620049`, dependency review
`99344593060` and aggregate `99347035124` passed. Discussions
`3890928257`/`3890928260` are answered and resolved; final evidence publication
head `21d9d06` passed exact-head run `33345010435`; every required job,
three-scenario diagnostic runtime and playable demo passed. The permitted
confirmation found discussion `3891065894`: the admitted PostgreSQL request
could reject while the runner awaited barrier/pause work and terminate Node
before recovery/cleanup. The local remediation immediately observes request
and injection through `Promise.allSettled`; runner tests pass 10/10 and the
affected gate passes 73/73 with 63 cached in 53.89 seconds. Repeated protected
runtime and corrected confirmation remain.
Architecture, operations, runbooks and licensing are current. The
earlier local attempt stopped during Docker Desktop image build and could not
inspect scoped resources. The normal demo is unchanged; Phase13 has not started.
One post-review read-only WSL check returned `docker-client-unavailable`; no
restart or repeated probe was attempted.

P11-R10 is released at tree-identical main `834bf15` and successful exact-main
run `33296443777`. Superseded run
`33293548409` predates the correction and run `33294397540` exposed the removed
dependency. Confirmation on `1a2c3f2` exposed the now-rejected configuration
expansion.

P10's first slice defines and implements the Catalog public-title cache boundary.
PostgreSQL remains the visibility and rights authority; a cache hit may reuse only
a bounded version-matched public projection after the owner confirms the current
visibility/version fence. Valid absence may use only a short negative cache.
Redis timeout, malformed bytes, lease loss or eviction falls back to PostgreSQL
without changing a public result. In-process coalescing and a tokenized Redis
lease reduce duplicate refreshes; neither authorizes a write. Exact cache keys,
TTL jitter, command/value limits, finite metrics, optional runtime composition and
degraded readiness are implemented locally. Initial review's oversized-write
metric defect was corrected. Confirmation then found unbounded Redis GET
materialization, whole-batch rather than per-title coalescing, and an oversized
corruption metric that could be dropped. Corrected exact
`2a9b86c221180f2df8caf74f66d9a2495c794888` performs the size decision inside
Redis before GET, coalesces shared hot titles across mixed batches while retaining
one batch for newly owned titles, and records malformed outcomes without invalid
size samples. Protected run33260411345 passed at b65688b, but final-confirmation
discussion3886966492 found that a cold absence check reached PostgreSQL before
either coordination boundary. Correction
`62afee15240ab1d197aac84b4d63e1a0e1dce382` coalesces each negative key in
process and leases it across instances before the owner fence read. Corrected
confirmation discussions3887086778/82 then found cross-time fence sharing and a
persistent wrong-type Redis key. Exact `2930332e7b1c049c081bfad8c5d62c71009f03bf`
keys fence work by ID, request time and policy, and classifies non-string Redis
values inside the bounded script for exact deletion. Catalog244/244, Redis17/17
and affected73/73 pass. Exact real Redis proves bounded oversized/wrong-type
reads,24-call cold positive/fence coalescing, one cross-instance negative fence
read, expiry, outage fallback and cleanup0; real PostgreSQL again proves the
four-field fence, exact source and stale-dispute rejection with cleanup0.
The next confirmation discussion3887146000 found that an exact old absence
marker without a bounded Redis expiry could hide later publication indefinitely.
Exact `f50acbb7cbb26cef480b0bb87018510660da48ca` timestamps the negative envelope,
rejects missing/future/older-than-ten-second values and deletes the exact key
before owner recheck. Catalog245/245, affected73/73, real Redis including the
unbounded marker and the complete PostgreSQL fixture pass with cleanup0.
Protected run33265036497 passed exact `4afe12f`, but review discussion3887201296
found that the refresh owner shifted every coalesced waiter bucket. Exact
`6088bf8` counts only attached callers for fence and positive refreshes;
Catalog245/245 and affected73/73 pass. Existing real fixtures remain applicable
because cache bytes, Redis wire, visibility and coordination did not change.
Exact-head review discussion3887242213 then found that a bounded control-byte
value destroyed the Redis connection before Catalog malformed recovery. Exact
`997ef27` validates only type/byte length for returned strings and keeps strict
write validation. Redis17/17, Catalog245/245 and affected73/73 pass. Repeated real
Redis proves `controlValueDeleted=true`, the connection remains usable and
cleanup0; PostgreSQL behavior is unchanged.
Protected run `33266926624` passed exact `edf7bc8`, but review discussions
`3887280597`/`3887280599` found a permanently contended malformed lease and a zero-waiter
reattachment metric case. Exact local correction `d93afbc` atomically recovers
wrong-type/non-expiring lease keys and tracks monotonic attachments separately
from active waiters. Redis17/17, Catalog246/246, scoped lint/format and repeated
real Redis pass; the fixture proves both malformed lease classes, Catalog-path
recovery, one cross-instance negative fence read and cleanup 0. Focused Identity
passed 147/147 after one unrelated terminal-fallback timing failure under broad
parallel load; the concurrency-capped affected gate then passed 73/73 with 59
cached in 90.953 seconds. At that checkpoint, publication and confirmation were pending.
Protected run `33268669701` then passed exact `d05dad3`; exact-head confirmation
discussion `3887360355` found post-decode expansion of Lua-bounded invalid UTF-8.
Exact local `ce97596` retains the raw reply as at most 16 KiB of bytes and applies
fatal UTF-8 decoding without resetting the connection. Redis 17/17, Catalog
246/246, the real invalid-byte deletion/probe/cleanup fixture and affected 73/73
gate with 50 cached in 126.735 seconds pass. At that checkpoint, publication and
corrected confirmation were pending.
Exact-head discussion `3887423663` then found that a finite but excessive lease
TTL remained contended beyond the two-second policy. Exact local `f014ebe`
atomically replaces remaining TTLs above the requested window while preserving
finite holders inside it. Redis17/17, Catalog246/246 and repeated real Redis pass
with `excessiveTtlLeaseRecovered=true` and cleanup0. The complete affected gate
passes 73/73 with 51 cached in 107.438 seconds. At that checkpoint, hosted CI and
corrected confirmation were pending. PR37 exact `cb86c37` then passed protected
run33270889083 and clean confirmation comment5464418106, squash-merged without
bypass as main `903f7b4`, and exact-main run33272501078 passed all required jobs.

The Discovery stale cache is rebased onto released main `903f7b4`. Exact
`53bdbf2` aligns the local platform policy with ADR-0038. PR39 initial automated
review found no issue; the complete local review then corrected cross-time title
expiry, best-effort cache writes and all-settled consumer shutdown at `5a5f5e2`.
Discovery103/103 and the corrected complete affected gate pass 73/73 with56
cached in106.071 seconds. Exact `8faf35a` makes the disposable
runtime assert the configured non-critical Redis outage; the eleven-service
PostgreSQL/Router proof passes in 395884 ms with healthy Discovery, public home
fallback, zero broker lag, replay, isolation, restart recovery and cleanup0.
Discovery99/99, telemetry11/11, Web111/111 and real Redis also pass. The Web stale
path remains byte-identical after rebase, so browser1/1 carries forward.

P10-R08 now owns the remaining Phase10 requirements. Its implementation places
Redis-backed token buckets after current Engagement owner authorization and
idempotency replay, partitioned by operation and an account pseudonym, with a
bounded process-local outage/hot-key shield. Discovery search has a separate
two-active/one-waiter/100-ms bulkhead. Redis remains disposable; final
GraphQL/router identity and workload calibration remains Phase13. Initial
protected run33277368515 passed every job and real fixture at exact6719bda. Its
three P2 review findings are corrected together at exactade7379: same-key
mutation work is serialized before receipt/rate admission, Engagement retry
timing is in the GraphQL payload, and Discovery saturation is a public payload
code. Redis18/18, telemetry12/12, Engagement123/123, Discovery105/105 and
Web111/111 focused suites pass. The corrected complete candidate passes73/73,
48 cached,in73.641 seconds. Protected run33279111820 then passed all required
jobs and the corrected real fixtures at exact041c75e. Confirmation discussion
3887901456 found one remaining blocking boundary: different Engagement replicas
could each charge the shared bucket before PostgreSQL serialized the receipt.
Exact c5ea7c8 changes the Redis decision to one v2 bucket plus one finite atomic
admission-digest marker. Two limiter/recorder instances now make two admission
calls but one charge, while PostgreSQL still produces one receipt/event/effect.
Redis18/18, Engagement124/124, scoped static checks and the corrected affected
gate pass73/73,44 cached,in61.854 seconds. The Redis script/key changed, so one
protected real-dependency repeat and the permitted blocking-boundary confirmation
remain.
The local Docker daemon remains unavailable; no repeated daemon/WSL probe is
authorized or needed.

Confirmation at `aa5e6af` found discussion3887956537: the shared admission identity
also needed the canonical request digest. Exact `6d74873` binds both Engagement
operations to that digest while preserving key-only local conflict ordering.
Engagement126/126 and the corrected73/73 candidate pass. Protected
run33281516077 verifies the extended two-writer Redis fixture, PostgreSQL outage
and cross-replica boundary. PR40 squash `eed8229` and exact-main run33282217705
release P10-R08 and close Phase10.

P11-R01 accepts ADR-0040 and records nineteen dependency operation classes
with current criticality, deadlines, retry ownership, capacity, fallback and
telemetry. `@aster/runtime` implements one framework-free safe-read executor with
an overall deadline, per-attempt deadline, remaining-budget gate, at most three
generic attempts, equal-jitter exponential backoff and finite observations. The
concrete Playback and Discovery policies use two attempts only for HTTP
502/503/504, EAI_AGAIN, ECONNRESET or incomplete/aborted streams; timeout,
malformed data, HTTP500, 4xx and local capacity do not retry. Both retain their
existing concurrency permit. Per-attempt telemetry uses only `catalog`/`read`.
Runtime88/88, Playback38/38, Discovery107/107 and telemetry12/12 pass. Exact
implementation `96e399b` has tree `d66004c`; the affected candidate passes53/53
with19 cached in69.098 seconds. Dependency-policy and retry-timing evidence are
captured under `evidence/phase-11/`. Initial PR41 review discussion3888089399
found the Playback README still claimed no network retry. The batched local
remediation documents sole retry ownership in Playback/Discovery and corrects
remaining stale Phase10 service/architecture/catalog status. Documentation
gates pass. Confirmation discussion3888100550 then found that an opaque upstream
signal could cancel but could not reduce retry admission before expiry. The
local blocking-boundary remediation makes repository child deadlines report the
minimum monotonic parent budget and establishes that lineage at Playback's
GraphQL/application boundaries. Runtime90/90 and Playback38/38 pass, including a
399-ms parent that cannot fund a 400-ms retry. Corrected exact source `af4951a`
has tree `e306bcc`; the affected candidate passes53/53 with19 cached in128.838
seconds and evidence is updated. Evidence head `6d709b4` passed protected run
`33284610557` and exact-head confirmation found no major issue. PR41
squash-merged as `ebdcb18` with the identical reviewed tree; exact-main run
`33285339274` passed every required job. [Release evidence](../evidence/phase-11/safe-read-release.txt).

P11-R05 now accepts ADR-0041. A shared runtime breaker has a bounded 30-second,
64-result window, four minimum samples, 50% threshold, five-second open state,
one half-open probe and generation fencing. Playback publication, Discovery
snapshot and Discovery export use independent instances around one complete
safe read, so a retry contributes one logical outcome. Playback remains fail
closed; Discovery creates no fallback data. Finite OpenTelemetry events expose
results, rejection and transitions. Focused runtime98/98, telemetry13/13,
Playback40/40 and Discovery108/108 tests pass, including real loopback open
suppression/recovery and operation isolation. Exact source `d039748` has tree
`b09864d`; its complete affected gate passes 53/53 with 21 cached in 73.623
seconds. [Candidate evidence](../evidence/phase-11/circuit-breakers.txt) records
the finite transitions and HTTP-call suppression. Initial PR42 review then found
two P1 blockers: domain-invalid owner data could count as breaker success before
Playback session or Discovery projection validation rejected it. Superseded run
`33286458648` was cancelled after its local-platform and documentation jobs
passed. Corrected exact source `92452d1` has tree `804c9cd`; it validates and
copies publication/snapshot identity, freshness, lease and content inside the
breaker-accounted action. Playback41/41, Discovery109/109 and the corrected
affected gate pass 53/53 with 39 cached in 52.928 seconds. Evidence head
`dfaf47d` passed protected run `33289750207` and clean confirmation. PR42
squash-merged as tree-identical main `59600ae`; exact-main run `33290477608`
passed every required job and releases P11-R05.

P11-R08/R09 now implements a tools-only failure laboratory. One immutable
construction-time HTTP scenario binds only IPv4 loopback and covers latency,
timeout, reset, selected error, malformed response, partial stream and finite
saturation. A second adapter delivers the same synthetic event exactly twice.
Production activation, request-controlled selection, remote binding and
production-source imports are structurally refused. Initial focused tests passed10/10;
the corrected affected candidate passes11/11 tasks in2m14.356s after removing
unused public surface rejected by the first gate. Initial PR43 review discussion
`3888409705` found that `close()` could race pending `listen()` and leave a
listener alive. Corrected source `896a3df` shares one complete close promise,
waits for pending bind and rejects startup closed during that interval. Focused
tests pass11/11 and the corrected affected gate passes11/11 in49.422s.
Evidence head `371ba55` passed clean confirmation and protected run
`33291705269`. PR43 squash-merged without bypass as tree-identical main
`bdbe2e0481ebb36c6d9be65502ecf8673bc7514e`; exact-main run `33292389504`
passed every required job and releases P11-R08/R09.

P11-R10 now maps and executes the five remaining game days. Exact protected
source `371ba55` proves Discovery stop/recovery, Redis-absent healthy home,
broker outage/drain and zero scoped cleanup. Exact source `aac04c7` exercises
the actual configured Web Apollo chain and rejects block, flow, escaped and
configuration-expanded Router retry keys throughout traffic shaping.
Focused failure tests pass 68/68, PostgreSQL
adapter/transaction saturation passes 28/28 and the new Web/Router contracts
pass 16/16. Bulkhead, fallback, retry-amplification and five game-day artifacts
plus complete Redis/Discovery/PostgreSQL/broker/media runbooks are recorded.
Web112/112 and Router4/4 pass. The final affected candidate passes 17/17 tasks,
five cached, in 48.053 seconds. Protected exact-head run `33295744010`, clean
confirmation, tree-identical squash main `834bf15` and exact-main run
`33296443777` release P11-R10 and Phase11.

## Historical Phase 09 corrections

PR34 confirmation discussions3886014605/606 found transaction fan-out and no
old/new schema overlap. Home selections now use one transaction at a time per
request, with five runtime connections covering four GraphQL admissions plus
readiness; Discovery83/83 and focused static gates pass. Frozen PR35 accepts only
ordered markers `1–2` or `1–3` in readiness and its old init preflight without
using/applying migration3. Its corrected75/75,42/42, protected run33243983340
and confirmation pass; it merged as583c835 and exact-main CI33244657936 passed.
The dependent is rebased onto that squash; Discovery88/88, real PostgreSQL
staged-old/rails-new readiness and the
repeated eleven-service runtime plus final54/54 candidate pass. Exact affected
source object IDs stayed unchanged across the squash rebase, so no heavyweight
proof was duplicated.
[Compatibility evidence](../evidence/phase-09/home-rails-compatibility.txt).

PR34 exact `0d1a7ef` passed protected run33245434181. Remediation confirmation
review5057520267 found two additional requirement-relevant issues: `PARTIAL`
GraphQL responses logged as rejected and ADR-0036 still describing parallel
fan-out. The local correction classifies partial as degraded, records sequential
one-transaction selection and passes focused Discovery89/89 plus the final54/54
affected candidate in47.708s. Its publication update remains.

Exact `8650670` passed protected run33246333963. Final confirmation review5057560831
found only a stale architecture excerpt defaulting `homeContinueWatching` to20
while the authoritative schema/generated API use10. The documentation-only
correction `df08a70` passed protected run33247048014. Closeout review5057633664
then found that the genre branch can flatten36 valid Catalog entities while the
transport admitted20. The correction admits exactly36 federation references,
keeps ordinary lists at20 and uses the existing request-scoped DataLoader to
split owner reads into batches of at most20. Catalog build and230/230 tests pass.
The corrected affected candidate passes54/54,38 cached, in55.844s.
Exact `dbce479` was published and protected run33248060625 started. Closeout
review5057751709 found fallback could hide `cancelled` or `indeterminate` primary
outcomes behind a completed recent rail. The run was cancelled as invalidated.
Fallback is now restricted to the documented `empty` and `unavailable` codes;
Discovery build,90/90 focused tests and the affected54/54 candidate in49.022s pass.

R11 no longer competes for browser response bodies. Exact request selection waits under the same12-second deadline for application-rendered state; Profiles require an empty collection and progress requires `Progress saved`, followed by owner reads proving resume/completion. Seven observer regressions, Web104/104, the43-task affected candidate, protected CI33228909828, clean exact-head review and exact-main CI33229726626 pass. PR32 merged as6f38ce0. Retained demo is unchanged.

Owner relays, dedicated signed Identity consumption, deletion/quarantine/replay, bounded lifecycle and opt-in Compose are implemented under ADR-0034. Latest strict builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests pass. [Real SQL](../evidence/phase-08/events-postgres.txt) passes including maximum quarantine bytes. [Real Kafka/owner observations](../evidence/phase-08/events-runtime.txt) prove backlog, redelivery, poison/replay/offsets, outage saves, recovery and new deletion consumption. All fixtures were cleaned.

The earlier local supervisor exited1 on an incorrect SIGTERM assertion. Protected CI33211565625 now passes the complete corrected supervisor, real SQL/owner/Kafka recovery, shutdown and fixture cleanup; all owners exited143 as specified. The original local failure remains historical, not rewritten as success. [Candidate gate](../evidence/phase-08/events-candidate.txt) records the local70/70 and carry-forward. No retained migration, event key or broker activation occurred.

## Not implemented

P13-R01/R02/R12 is released through exact-main run `33412728404`. GraphQL
shape/list/cost controls are released through tree-identical PR55 merge
`8cd6c0b` and exact-main run `33425758870` attempt2. Execution/rate/cache
controls are released through PR56 squash main `98deb52` and exact-main run
`33448911764`.
N+1/query-count proof and owner-authorization abuse tests have corrected local
evidence plus passing clean63/63 and final73/73 gates after PR57 initial review,
bounded process-restart correction, exact-profile correction, Catalog
query-plan/clean-package correction and a real ten-entity/maximum-batch parameter
remediation plus the derived projection-lease assertion. Evidence head `35d46d9`
passed protected run `33475401067`. Later protected run `33476967426` exposed a
P12-R10 recent-store ordering defect; source `b2c77a8` passes focused14/14, one
complete local diagnostic runtime, affected73/73 and protected run
`33480268553`. Documentation head `c195a1d` passed run `33481864676`; the
resulting confirmation exposed observed-owner projection. Exact-owner-set source
`a99b3af` passes focused5/5, both full federated runtimes and affected73/73.
Evidence head `71823fe` passes protected run `33485233911`; its result-checkpoint
gate, discussion, final confirmation and release gates remain.
Phase14 capacity validation and hosted deployment remain planned.

## Next outcome

For P13-R07/P13-R08/P13-R09 item67, publish one evidence checkpoint containing
protected run `33485233911`, require the checkpoint's exact protected CI,
resolve discussion `3901909548`, request one final corrected-candidate
confirmation, squash merge and verify exact-main CI. Then close Phase13 and
activate the newly documented reference/readability direction from clean main;
hosted deployment is not its immediate objective.
Inspect the exact historical interrupted Phase12 project only when that same
Docker engine becomes reachable.

## Runtime and recovery

After the reported WSL failure, the owner explicitly authorized targeted Ubuntu-20.04 termination/restart. Both commands exited 0. Eight existing Aster containers were restarted without rebuild, migration or data deletion; nine service healthchecks passed, collector ran and homepage returned HTTP 200. Other projects were untouched. No CPU/root-cause conclusion is established.

Docker's Ubuntu bind-mount integration last failed with a refused distro-services socket; do not retry unchanged or restart WSL automatically. The user subsequently reported memory decreased; no second host measurement was made. Native pinned Node/pnpm were recovered from the same trusted image into a persistent cache after the old temporary copy disappeared; hash unchanged. Direct WSL Docker and a sequential 384-MiB disposable PostgreSQL fixture work without repository bind mounts; all fixtures were removed. Continue bounded gates, not host diagnostic loops. Exact cache path is in HANDOFF.

Retained project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008 and Playback0001, no Phase08 upgrade. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Big Buck Bunny remains title00000000-0000-4000-8000-000000080001, version9/rights4, publication c2929850-d3a3-4e30-945f-688d639d2c68; recorded bundle209objects/95496764bytes. [Publication](../evidence/phase-06/publication.md). Preserve media, databases, audit and all user processes.

## Current risks

- The exact earlier SDK/provider seed transport cause remains unproved; the released read-only replay removes that dependency and passes protected/exact-main gates. No blind retry, retained reset or CPU attribution.
- Retain uncertain claims, pending facts, permanent deletion fences and the event
  signing key. Migration3 is allowed only with the released finite search
  compatibility precursor now verified by exact-main CI33244657936.
- ADR-0026 permits only exact stopped/expired disposable scratch cleanup. Hosted lifecycle/fencing/storage budgets remain P14-R11.
- Shared-host timings are laboratory observations, not field SLOs. No host investigation is required.
- Phase13 dependency re-review on the unchanged pinned graph reports zero
  high/critical and one known moderate UUID advisory. Exact installed Apollo callers use argument-free
  `v1()`/`v4()`, not the advisory's v3/v5/v6 buffer paths. Keep it visible and
  re-review upstream remediation before hosted release; no unsupported
  transitive-major override.
- Preserve MIT/upstream notices. No paid resources, invented media rights or global Docker cleanup.
