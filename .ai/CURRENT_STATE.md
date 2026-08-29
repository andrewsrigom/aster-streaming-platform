# Current State

Last updated: 2026-08-29

## Active phase

**Phase 09 — Home Rails and Search**

Status: **IN_PROGRESS**, P09-R01 on feat/p09-discovery-search, rebased onto released main6f38ce0 through dd3f8c1 plus the current broker/rebuild checkpoint. PR32 exact d295ec7 passed protected CI/review, squash merge and exact-main CI33229726626; P08-R11 and Phase08 are released. Full Phase00–14 goal stays active.

## Verified

Phases 00–08 are released locally through protected and exact post-merge CI. [Phase 08 acceptance](../evidence/phase-08/release.md) covers all twelve requirements, actual browser save/resume/library, event recovery and explicit limitations. [Phase 07 acceptance](../evidence/phase-07/release.md) covers playback; [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights/media evidence. No hosted deployment is claimed.

P08-R01/R06/R07/R08 completed protected release. [Phase 08 evidence](../evidence/phase-08/README.md) records durable progress, history, watchlist and request-scoped fields. [Federated proof](../evidence/phase-08/federated-runtime.txt) covers real owner authorization, replay/conflict, revocation and anonymous Playback continuity. [Entity fields](../evidence/phase-08/engagement-fields.md) retain 98 tests, nine composition tests, real SQL/Docker and 67-task candidate evidence. No unchanged CPU, media or browser repeat is required.

## Current work

Discovery domain and Catalog source/private-runtime checkpoints pass. [Projection persistence evidence](../evidence/phase-09/projection-postgres.txt) records isolated roles, monotonic retirement fences, weighted GIN relevance, stable keysets and guarded rollback. [Event recovery](../evidence/phase-09/catalog-events.txt) covers bounded hints and exact quarantine/replay. [Rebuild runtime](../evidence/phase-09/rebuild-runtime.txt) adds canonical Kafka barriers, finite earliest consumer lifecycle, exact bounded Catalog export and resumable barrier-gated generation promotion. Consumer offsets advance durably on active/building generations before acknowledgement; scan checkpoints cannot regress them. Broker27/27, event-delivery23/23, Discovery55/55, scoped lint and real PostgreSQL18.6 pass; every disposable fixture cleaned to zero. Service composition, real Kafka runtime proof and GraphQL remain; no public search API exists yet.

R11 no longer competes for browser response bodies. Exact request selection waits under the same12-second deadline for application-rendered state; Profiles require an empty collection and progress requires `Progress saved`, followed by owner reads proving resume/completion. Seven observer regressions, Web104/104, the43-task affected candidate, protected CI33228909828, clean exact-head review and exact-main CI33229726626 pass. PR32 merged as6f38ce0. Retained demo is unchanged.

Owner relays, dedicated signed Identity consumption, deletion/quarantine/replay, bounded lifecycle and opt-in Compose are implemented under ADR-0034. Latest strict builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests pass. [Real SQL](../evidence/phase-08/events-postgres.txt) passes including maximum quarantine bytes. [Real Kafka/owner observations](../evidence/phase-08/events-runtime.txt) prove backlog, redelivery, poison/replay/offsets, outage saves, recovery and new deletion consumption. All fixtures were cleaned.

The earlier local supervisor exited1 on an incorrect SIGTERM assertion. Protected CI33211565625 now passes the complete corrected supervisor, real SQL/owner/Kafka recovery, shutdown and fixture cleanup; all owners exited143 as specified. The original local failure remains historical, not rewritten as success. [Candidate gate](../evidence/phase-08/events-candidate.txt) records the local70/70 and carry-forward. No retained migration, event key or broker activation occurred.

## Not implemented

Discovery and hosted release remain pending. Retained demo has not been upgraded to Phase08; that optional upgrade is not a release blocker. Signal / 01 is browse-only; Signal / 02 is the generated captioned sample.

## Next outcome

Complete P09-R01 by composing the implemented Discovery broker/rebuild/search pieces behind bounded GraphQL/Federation, then prove real Kafka/runtime and run the affected candidate gate before publication. No host experiment or retained-demo upgrade.

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
