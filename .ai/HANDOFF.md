# Handoff

## Resume point

P07-R04 / Phase 07 is IN_PROGRESS on feat/p07-player, rebased on released main f2d99d254263baac532ef36edba0ab2c99d20dc3. P07-R01 is DONE: PR 24 protected CI, confirmation, squash and exact post-merge pass. [Release](../evidence/phase-07/backend-release.md). Full Phase 00–14 goal remains active.

## Exact next actions

1. Publish the player/demo candidate and finish protected review/release. Local gate passes 64/64, audit has zero high/critical and Web has 45 passing unit tests. Real generated demo frame/captions/accessibility/direct origin and startup/replay pass; final Web image is 66116c9ec0db10dacfb4501753311ce0e3cea098552d4512bad7c1179f33027b. [Player evidence](../evidence/phase-07/player.md). No CPU/film benchmark loop. Whole-workspace lint needs a 2 GiB Node heap in the 4 GiB tooling container; run the same affected task list with Turbo concurrency two, not a host diagnostic.
2. Backend PR 24 and its exact post-merge CI passed; no pending backend review/rebase. Initial player stash 2e85504b is already restored, not pending. Main and origin/main point to f2d99d2.
3. Backend has 248 owner tests, source 54/54, corrected candidate 64/64, real SQL and connected runtime acceptance. Both affected startup/cleanup proofs pass with zero resources. [Correction evidence](../evidence/phase-07/backend-review.md). Do not repeat unchanged SQL/film/runtime for prose. Exact released-base schema compatibility passed.

P07 work was restored and rebased successfully. Stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef is only an older recovery copy, not pending work to apply.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is Catalog 0008 / Playback 0001. Backup: C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Prior images: aster-p07-rollback:{web,router,catalog}. Catalog/Playback/Router use corrected proof images; Web runs final player image 66116c9e. Only retained Web/Router/origin were briefly stopped for conflicting demo ports; all are restored. Database/media containers and immutable film data were not recreated. Disposable aster-p07-playable-proof cleanup checked 13 containers, seven volumes and two networks and left zero resources.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL command launch is unreliable; do not restart or diagnose host/CPU. Existing aster-p06-tooling:git Docker image supports canonical repo mount, UID 1002 and bounded resources. Full source gate uses pnpm check:source --concurrency=2 and pids-limit 256. Native Docker/Windows Node handle built-in-only supervisors. Native Git credentials can push; local commits use Docker Git and normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim protected player/phase release before CI/review/merge. Preserve retained volumes/media, Windows processes and existing app. No broad Docker prune/reset, new film encode or unchanged browser/CPU benchmark. Docker Git is authoritative for Linux executable modes. Never create/use a codex/ branch.
