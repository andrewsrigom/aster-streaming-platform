# Current State

Last updated: 2026-08-29

## Active phase

**Phase 11 — Resilience and Failure Laboratory**

Status: **IN_PROGRESS**. Phase10 is released: PR40 exact `6d74873` passed
protected run33281516077, resolved review, squash-merged without bypass as
`eed8229`, and exact-main run33282217705 passed the identical tree. P11-R01 is
active on `feat/p11-dependency-policies`. Full Phase00–14 goal stays active.

## Verified

Phases 00–10 are released locally through protected and exact post-merge CI. [Phase 08 acceptance](../evidence/phase-08/release.md) covers all twelve requirements, actual browser save/resume/library, event recovery and explicit limitations. [Phase 07 acceptance](../evidence/phase-07/release.md) covers playback; [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights/media evidence. [Phase 10 release](../evidence/phase-10/operation-limiters-release.txt) records the final limiter gate. No hosted deployment is claimed.

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

P11-R01 now accepts ADR-0040 and records nineteen dependency operation classes
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
captured under `evidence/phase-11/`. Review and protected publication remain.

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

P11-R01's review and protected publication remain. Later Phase11 breakers,
controlled injection, game days and runbooks remain planned. Hosted
deployment remains Phase14.

## Next outcome

Complete P11-R01: review and publish the evidenced deadline-bound safe-read
candidate.

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
- Last audit: zero high/critical, one known moderate UUID advisory with inspected Apollo callers unaffected; revisit before hosted release.
- Preserve MIT/upstream notices. No paid resources, invented media rights or global Docker cleanup.
