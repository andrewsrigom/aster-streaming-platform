# Current State

Last updated: 2026-08-29

## Active phase

**Phase 10 — Advanced Redis and Concurrency**

Status: **IN_PROGRESS**, Catalog cache slice active on `feat/p10-catalog-cache`
from released main `ffe8e24`. Full Phase00–14 goal stays active.

## Verified

Phases 00–09 are released locally through protected and exact post-merge CI. [Phase 08 acceptance](../evidence/phase-08/release.md) covers all twelve requirements, actual browser save/resume/library, event recovery and explicit limitations. [Phase 07 acceptance](../evidence/phase-07/release.md) covers playback; [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights/media evidence. No hosted deployment is claimed.

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
degraded readiness are implemented locally. Catalog239/239 and Redis17/17 pass.
The disposable Redis8.10 proof compares24 uncached source reads with one
coalesced cold refresh, observes a cross-instance lease contender, a2.96ms warm
sample, expired-owner recovery, atomic compare-delete, negative reuse, outage
bypass and cleanup0. Exact implementation commit and hosted candidate remain
pending.

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

Discovery stale-while-revalidate, operation-specific Redis rate limiting,
expensive-path concurrency limits, the mixed outage/hot-key closeout and Phase10
release are not implemented. Hosted deployment remains Phase14.

## Next outcome

Publish and review the P10-R01 Catalog cache candidate, complete protected and
exact-main acceptance, then deliver Discovery stale-while-revalidate and the
limiter/outage closeout slices.

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
