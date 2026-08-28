# Current State

Last updated: 2026-08-28

## Active phase

**Phase 08 — Progress, History, Watchlist, and Continue-Watching**

Status: **IN_PROGRESS**, P08-R09 (also R10/R12) is a locally accepted candidate on feat/p08-event-delivery, based on d7fa03a363ab979f008500040b0afa62ddec2704; publication is next. P08-R08 is DONE: [PR 29](https://github.com/andrewsrigom/aster-streaming-platform/pull/29), protected CI 33198008084, clean exact-head confirmation 5456085999 and exact main push 33199190529 all pass. R09 is already rebased; autostash fec057f was applied. Never reapply it or earlier restored stashes. Full Phase 00–14 goal stays active.

## Verified

Phases 00–07 are released locally through protected and exact post-merge CI. [Phase 07 acceptance](../evidence/phase-07/release.md) covers all twelve requirements and explicit browser/content limitations. [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights approval, bounded acquisition, isolated HLS/JPEG, replay, publication, rollback and browser evidence. No hosted deployment is claimed.

P08-R01/R06/R07/R08 completed protected release. [Phase 08 evidence](../evidence/phase-08/README.md) records durable progress, history, watchlist and request-scoped fields. [Federated proof](../evidence/phase-08/federated-runtime.txt) covers real owner authorization, replay/conflict, revocation and anonymous Playback continuity. [Entity fields](../evidence/phase-08/engagement-fields.md) retain 98 tests, nine composition tests, real SQL/Docker and 67-task candidate evidence. No unchanged CPU, media or browser repeat is required.

## Current work

Owner relays, dedicated signed Identity consumption, deletion/quarantine/replay, bounded lifecycle and opt-in Compose are implemented under ADR-0034. Latest strict builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests pass. [Real SQL](../evidence/phase-08/events-postgres.txt) passes including maximum quarantine bytes. [Real Kafka/owner observations](../evidence/phase-08/events-runtime.txt) prove backlog, redelivery, poison/replay/offsets, outage saves, recovery and new deletion consumption. All fixtures were cleaned.

The last supervisor exited 1 because its assertion incorrectly expected exit 0 after SIGTERM. All three actual owners exited the specified 143 with completed lifecycle logs; replaying those captured states/logs through the corrected validator passes. [Candidate gate](../evidence/phase-08/events-candidate.txt) passes 70/70 tasks and exact-base composition; it records the behavior-preserving static-check remediation and heavyweight carry-forward. The complete corrected supervisor still needs protected CI; do not claim its local exit was 0. No retained migration, event key or broker activation occurred.

## Not implemented

Candidate/protected release, player reports/resume, Discovery and hosted release remain pending. Retained demo has not been upgraded to Phase 08. Signal / 01 is browse-only; Signal / 02 is the generated captioned sample.

## Next outcome

Publish the P08-R09 candidate, then require initial/confirmation review, protected CI, squash and exact main push. The full 70-task local gate and exact-base composition pass. Do not repeat unchanged SQL/media/CPU/runtime behavior; hosted CI will execute the corrected supervisor. R11 browser reporting remains next.

## Runtime and recovery

After the reported WSL failure, the owner explicitly authorized targeted Ubuntu-20.04 termination/restart. Both commands exited 0. Eight existing Aster containers were restarted without rebuild, migration or data deletion; nine service healthchecks passed, collector ran and homepage returned HTTP 200. Other projects were untouched. No CPU/root-cause conclusion is established.

Docker's Ubuntu bind-mount integration last failed with a refused distro-services socket; do not retry unchanged or restart WSL automatically. The user subsequently reported memory decreased; no second host measurement was made. Native pinned Node/pnpm were recovered from the same trusted image into a persistent cache after the old temporary copy disappeared; hash unchanged. Direct WSL Docker and a sequential 384-MiB disposable PostgreSQL fixture work without repository bind mounts; all fixtures were removed. Continue bounded gates, not host diagnostic loops. Exact cache path is in HANDOFF.

Retained project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008 and Playback0001, no Phase08 upgrade. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Big Buck Bunny remains title00000000-0000-4000-8000-000000080001, version9/rights4, publication c2929850-d3a3-4e30-945f-688d639d2c68; recorded bundle209objects/95496764bytes. [Publication](../evidence/phase-06/publication.md). Preserve media, databases, audit and all user processes.

## Current risks

- Retain uncertain claims, pending facts, permanent deletion fences and the event signing key; old finite migrators/readiness may reject new schema versions. Drain and use compatible binaries or roll forward.
- ADR-0026 permits only exact stopped/expired disposable scratch cleanup. Hosted lifecycle/fencing/storage budgets remain P14-R11.
- Shared-host timings are laboratory observations, not field SLOs. No host investigation is required.
- Last audit: zero high/critical, one known moderate UUID advisory with inspected Apollo callers unaffected; revisit before hosted release.
- Preserve MIT/upstream notices. No paid resources, invented media rights or global Docker cleanup.
