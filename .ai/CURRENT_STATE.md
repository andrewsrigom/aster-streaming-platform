# Current State

Last updated: 2026-08-28

## Active phase

**Phase 08 — Progress, History, Watchlist, and Continue-Watching**

Status: **IN_PROGRESS**, P08-R11 on fix/p08-browser-ack, PR32. Its 77eda41 observer correction passed both real browser journeys and clean initial/confirmation review, but CI33220547568 failed in later immutable-seed replay. This failed test is not WAITING_EXTERNAL. P09-R01 is READY, preserved at 0e31767 on feat/p09-discovery-search plus snapshot WIP stash770430dfd71f7a4eaa477f805f8bcc1c4082cc32. Rebase after repair and apply only that stash once. Full Phase00–14 goal stays active.

## Verified

Phases 00–07 are released locally through protected and exact post-merge CI. [Phase 07 acceptance](../evidence/phase-07/release.md) covers all twelve requirements and explicit browser/content limitations. [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights approval, bounded acquisition, isolated HLS/JPEG, replay, publication, rollback and browser evidence. No hosted deployment is claimed.

P08-R01/R06/R07/R08 completed protected release. [Phase 08 evidence](../evidence/phase-08/README.md) records durable progress, history, watchlist and request-scoped fields. [Federated proof](../evidence/phase-08/federated-runtime.txt) covers real owner authorization, replay/conflict, revocation and anonymous Playback continuity. [Entity fields](../evidence/phase-08/engagement-fields.md) retain 98 tests, nine composition tests, real SQL/Docker and 67-task candidate evidence. No unchanged CPU, media or browser repeat is required.

## Current work

R11's browser correction selects requests synchronously and consumes one checked body before navigation; five regressions,26 player tests, Web types/lint and the14/14 gate pass. PR32 also passed the actual anonymous/personalized browser tests. The new [seed replay correction](../evidence/phase-08/player-seed-replay.txt) checks presence, verifies existing complete bytes without PUT and permits one conditional create only for explicit absence. Nine regressions/two file tests, scoped lint, real S3 replay/corruption/header checks and43/43 candidate tasks pass; exact fixture cleanup reports zero. Fresh protected acceptance/review remain required. Retained demo is unchanged.

Owner relays, dedicated signed Identity consumption, deletion/quarantine/replay, bounded lifecycle and opt-in Compose are implemented under ADR-0034. Latest strict builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests pass. [Real SQL](../evidence/phase-08/events-postgres.txt) passes including maximum quarantine bytes. [Real Kafka/owner observations](../evidence/phase-08/events-runtime.txt) prove backlog, redelivery, poison/replay/offsets, outage saves, recovery and new deletion consumption. All fixtures were cleaned.

The earlier local supervisor exited1 on an incorrect SIGTERM assertion. Protected CI33211565625 now passes the complete corrected supervisor, real SQL/owner/Kafka recovery, shutdown and fixture cleanup; all owners exited143 as specified. The original local failure remains historical, not rewritten as success. [Candidate gate](../evidence/phase-08/events-candidate.txt) records the local70/70 and carry-forward. No retained migration, event key or broker activation occurred.

## Not implemented

Phase08 exact post-merge closeout, Discovery and hosted release remain pending. Retained demo has not been upgraded to Phase08. Signal / 01 is browse-only; Signal / 02 is the generated captioned sample.

## Next outcome

Complete P08-R11 immutable replay correction under CHANGE_PLAN in the same PR32. Require real S3 proof, affected gate, refreshed boundary review, protected full demo/replay and exact main success. The [Phase08 audit](../evidence/phase-08/release.md) remains unreleased. Resume preserved Phase09 after repair; no repeated host experiment or retained-demo upgrade.

## Runtime and recovery

After the reported WSL failure, the owner explicitly authorized targeted Ubuntu-20.04 termination/restart. Both commands exited 0. Eight existing Aster containers were restarted without rebuild, migration or data deletion; nine service healthchecks passed, collector ran and homepage returned HTTP 200. Other projects were untouched. No CPU/root-cause conclusion is established.

Docker's Ubuntu bind-mount integration last failed with a refused distro-services socket; do not retry unchanged or restart WSL automatically. The user subsequently reported memory decreased; no second host measurement was made. Native pinned Node/pnpm were recovered from the same trusted image into a persistent cache after the old temporary copy disappeared; hash unchanged. Direct WSL Docker and a sequential 384-MiB disposable PostgreSQL fixture work without repository bind mounts; all fixtures were removed. Continue bounded gates, not host diagnostic loops. Exact cache path is in HANDOFF.

Retained project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008 and Playback0001, no Phase08 upgrade. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Big Buck Bunny remains title00000000-0000-4000-8000-000000080001, version9/rights4, publication c2929850-d3a3-4e30-945f-688d639d2c68; recorded bundle209objects/95496764bytes. [Publication](../evidence/phase-06/publication.md). Preserve media, databases, audit and all user processes.

## Current risks

- Seed replay upload unavailable reproduced in CI33220547568 after both browser tests passed. Read-only replay removes its unnecessary conditional upload; the exact earlier SDK/provider transport cause remains unproved. No blind retry, retained reset or CPU attribution.
- Retain uncertain claims, pending facts, permanent deletion fences and the event signing key; old finite migrators/readiness may reject new schema versions. Drain and use compatible binaries or roll forward.
- ADR-0026 permits only exact stopped/expired disposable scratch cleanup. Hosted lifecycle/fencing/storage budgets remain P14-R11.
- Shared-host timings are laboratory observations, not field SLOs. No host investigation is required.
- Last audit: zero high/critical, one known moderate UUID advisory with inspected Apollo callers unaffected; revisit before hosted release.
- Preserve MIT/upstream notices. No paid resources, invented media rights or global Docker cleanup.
