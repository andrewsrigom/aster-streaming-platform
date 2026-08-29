# Current State

Last updated: 2026-08-29

## Active phase

**Phase 09 — Home Rails and Search**

Status: **IN_PROGRESS**, P09-R01 candidate on feat/p09-discovery-search at head e979d7d. P08-R11 and Phase08 are released through main6f38ce0 and exact-main CI33229726626. Full Phase00–14 goal stays active.

## Verified

Phases 00–08 are released locally through protected and exact post-merge CI. [Phase 08 acceptance](../evidence/phase-08/release.md) covers all twelve requirements, actual browser save/resume/library, event recovery and explicit limitations. [Phase 07 acceptance](../evidence/phase-07/release.md) covers playback; [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights/media evidence. No hosted deployment is claimed.

P08-R01/R06/R07/R08 completed protected release. [Phase 08 evidence](../evidence/phase-08/README.md) records durable progress, history, watchlist and request-scoped fields. [Federated proof](../evidence/phase-08/federated-runtime.txt) covers real owner authorization, replay/conflict, revocation and anonymous Playback continuity. [Entity fields](../evidence/phase-08/engagement-fields.md) retain 98 tests, nine composition tests, real SQL/Docker and 67-task candidate evidence. No unchanged CPU, media or browser repeat is required.

## Current work

Discovery search is implemented locally behind the fifth Federation subgraph. [Search runtime evidence](../evidence/phase-09/search-runtime.txt) records exact1fe7edb: real PostgreSQL18.6 migrations/relevance/keysets/fences/rebuild/recovery/roles/GIN pass; the11-service disposable Kafka/Router proof projects one title with zero lag, returns one federated result and an explicit empty result, preserves its active generation through restart, emits no raw query/title/secret or timer warning, and cleans to zero. [Candidate evidence](../evidence/phase-09/search-candidate.txt) records exact e979d7d passing73/73 aggregate tasks, zero high/critical audit findings and both reviews with no blocker. Protected release remains.

R11 no longer competes for browser response bodies. Exact request selection waits under the same12-second deadline for application-rendered state; Profiles require an empty collection and progress requires `Progress saved`, followed by owner reads proving resume/completion. Seven observer regressions, Web104/104, the43-task affected candidate, protected CI33228909828, clean exact-head review and exact-main CI33229726626 pass. PR32 merged as6f38ce0. Retained demo is unchanged.

Owner relays, dedicated signed Identity consumption, deletion/quarantine/replay, bounded lifecycle and opt-in Compose are implemented under ADR-0034. Latest strict builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests pass. [Real SQL](../evidence/phase-08/events-postgres.txt) passes including maximum quarantine bytes. [Real Kafka/owner observations](../evidence/phase-08/events-runtime.txt) prove backlog, redelivery, poison/replay/offsets, outage saves, recovery and new deletion consumption. All fixtures were cleaned.

The earlier local supervisor exited1 on an incorrect SIGTERM assertion. Protected CI33211565625 now passes the complete corrected supervisor, real SQL/owner/Kafka recovery, shutdown and fixture cleanup; all owners exited143 as specified. The original local failure remains historical, not rewritten as success. [Candidate gate](../evidence/phase-08/events-candidate.txt) records the local70/70 and carry-forward. No retained migration, event key or broker activation occurred.

## Not implemented

Discovery home rails, personalized composition, browser search and hosted release remain pending. The current search candidate is not released until protected merge and exact-main CI.

## Next outcome

Publish/merge P09-R01 through protected CI and confirm exact main. Then activate P09-R03 for independent rails, fallbacks and freshness telemetry.

## Runtime and recovery

After the reported WSL failure, the owner explicitly authorized targeted Ubuntu-20.04 termination/restart. Both commands exited 0. Eight existing Aster containers were restarted without rebuild, migration or data deletion; nine service healthchecks passed, collector ran and homepage returned HTTP 200. Other projects were untouched. No CPU/root-cause conclusion is established.

Docker's Ubuntu bind-mount integration last failed with a refused distro-services socket; do not retry unchanged or restart WSL automatically. The user subsequently reported memory decreased; no second host measurement was made. Native pinned Node/pnpm were recovered from the same trusted image into a persistent cache after the old temporary copy disappeared; hash unchanged. Direct WSL Docker and a sequential 384-MiB disposable PostgreSQL fixture work without repository bind mounts; all fixtures were removed. Continue bounded gates, not host diagnostic loops. Exact cache path is in HANDOFF.

Retained project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008 and Playback0001, no Phase08 upgrade. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Big Buck Bunny remains title00000000-0000-4000-8000-000000080001, version9/rights4, publication c2929850-d3a3-4e30-945f-688d639d2c68; recorded bundle209objects/95496764bytes. [Publication](../evidence/phase-06/publication.md). Preserve media, databases, audit and all user processes.

## Current risks

- The exact earlier SDK/provider seed transport cause remains unproved; the released read-only replay removes that dependency and passes protected/exact-main gates. No blind retry, retained reset or CPU attribution.
- Retain uncertain claims, pending facts, permanent deletion fences and the event signing key; old finite migrators/readiness may reject new schema versions. Drain and use compatible binaries or roll forward.
- ADR-0026 permits only exact stopped/expired disposable scratch cleanup. Hosted lifecycle/fencing/storage budgets remain P14-R11.
- Shared-host timings are laboratory observations, not field SLOs. No host investigation is required.
- Last audit: zero high/critical, one known moderate UUID advisory with inspected Apollo callers unaffected; revisit before hosted release.
- Preserve MIT/upstream notices. No paid resources, invented media rights or global Docker cleanup.
