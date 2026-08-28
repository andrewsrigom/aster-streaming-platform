# Current State

Last updated: 2026-08-28

## Active phase

**Phase 08 — Progress, History, Watchlist, and Continue-Watching**

Status: **IN_PROGRESS**, P08-R11 on fix/p08-browser-ack from main e20a7de. PR31 passed protected CI33217783905 and two clean reviews, but exact main33218775702 failed in the personalized browser response-body/navigation observer. This failed test is not WAITING_EXTERNAL. P09-R01 is READY with its21-test domain checkpoint preserved, unpublished, at c9cb96d on feat/p09-discovery-search. Rebase it after predecessor correction; do not reapply historical stashes. Full Phase00–14 goal stays active.

## Verified

Phases 00–07 are released locally through protected and exact post-merge CI. [Phase 07 acceptance](../evidence/phase-07/release.md) covers all twelve requirements and explicit browser/content limitations. [Phase 06 acceptance](../evidence/phase-06/acceptance.md) and [release](../evidence/phase-06/release.md) retain rights approval, bounded acquisition, isolated HLS/JPEG, replay, publication, rollback and browser evidence. No hosted deployment is claimed.

P08-R01/R06/R07/R08 completed protected release. [Phase 08 evidence](../evidence/phase-08/README.md) records durable progress, history, watchlist and request-scoped fields. [Federated proof](../evidence/phase-08/federated-runtime.txt) covers real owner authorization, replay/conflict, revocation and anonymous Playback continuity. [Entity fields](../evidence/phase-08/engagement-fields.md) retain 98 tests, nine composition tests, real SQL/Docker and 67-task candidate evidence. No unchanged CPU, media or browser repeat is required.

## Current work

R11's [local browser proof](../evidence/phase-08/player-demo.md) and PR31 protected browser run passed actual2-second resume, history/completion, watchlist/focus, isolation, optional-save failure, sign-out and accessibility. Exact main later exposed the observer race. The test-only correction selects requests synchronously and consumes one checked body before navigation; five regressions,26 player tests, Web types/lint and the14/14 affected gate pass. [Correction evidence](../evidence/phase-08/player-browser-ack.txt) retains the failure and limitations. Fresh protected browser acceptance/reviews and exact main remain required. Production code and retained demo are unchanged.

Owner relays, dedicated signed Identity consumption, deletion/quarantine/replay, bounded lifecycle and opt-in Compose are implemented under ADR-0034. Latest strict builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests pass. [Real SQL](../evidence/phase-08/events-postgres.txt) passes including maximum quarantine bytes. [Real Kafka/owner observations](../evidence/phase-08/events-runtime.txt) prove backlog, redelivery, poison/replay/offsets, outage saves, recovery and new deletion consumption. All fixtures were cleaned.

The earlier local supervisor exited1 on an incorrect SIGTERM assertion. Protected CI33211565625 now passes the complete corrected supervisor, real SQL/owner/Kafka recovery, shutdown and fixture cleanup; all owners exited143 as specified. The original local failure remains historical, not rewritten as success. [Candidate gate](../evidence/phase-08/events-candidate.txt) records the local70/70 and carry-forward. No retained migration, event key or broker activation occurred.

## Not implemented

Phase08 exact post-merge closeout, Discovery and hosted release remain pending. Retained demo has not been upgraded to Phase08. Signal / 01 is browse-only; Signal / 02 is the generated captioned sample.

## Next outcome

Complete P08-R11 browser acknowledgement correction under CHANGE_PLAN, then require protected real-browser acceptance, reviews and exact main success. Five deterministic observer regressions,26 player/reporting tests, scoped lint and Web types pass. The [Phase08 audit](../evidence/phase-08/release.md) remains unreleased. Resume preserved Phase09 after repair. No repeated host experiment or retained-demo upgrade.

## Runtime and recovery

After the reported WSL failure, the owner explicitly authorized targeted Ubuntu-20.04 termination/restart. Both commands exited 0. Eight existing Aster containers were restarted without rebuild, migration or data deletion; nine service healthchecks passed, collector ran and homepage returned HTTP 200. Other projects were untouched. No CPU/root-cause conclusion is established.

Docker's Ubuntu bind-mount integration last failed with a refused distro-services socket; do not retry unchanged or restart WSL automatically. The user subsequently reported memory decreased; no second host measurement was made. Native pinned Node/pnpm were recovered from the same trusted image into a persistent cache after the old temporary copy disappeared; hash unchanged. Direct WSL Docker and a sequential 384-MiB disposable PostgreSQL fixture work without repository bind mounts; all fixtures were removed. Continue bounded gates, not host diagnostic loops. Exact cache path is in HANDOFF.

Retained project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008 and Playback0001, no Phase08 upgrade. [Upgrade and rollback](../evidence/phase-07/backend-release.md). Big Buck Bunny remains title00000000-0000-4000-8000-000000080001, version9/rights4, publication c2929850-d3a3-4e30-945f-688d639d2c68; recorded bundle209objects/95496764bytes. [Publication](../evidence/phase-06/publication.md). Preserve media, databases, audit and all user processes.

## Current risks

- One seed replay returned upload unavailable; later finite diagnostic, normal startup and replay verified identical bytes and recovered. Root cause is unproved. If fresh protected CI reproduces it, diagnose that bootstrap boundary; do not loop, reset retained data or attribute it to CPU. Details remain in player-demo.md.
- Retain uncertain claims, pending facts, permanent deletion fences and the event signing key; old finite migrators/readiness may reject new schema versions. Drain and use compatible binaries or roll forward.
- ADR-0026 permits only exact stopped/expired disposable scratch cleanup. Hosted lifecycle/fencing/storage budgets remain P14-R11.
- Shared-host timings are laboratory observations, not field SLOs. No host investigation is required.
- Last audit: zero high/critical, one known moderate UUID advisory with inspected Apollo callers unaffected; revisit before hosted release.
- Preserve MIT/upstream notices. No paid resources, invented media rights or global Docker cleanup.
