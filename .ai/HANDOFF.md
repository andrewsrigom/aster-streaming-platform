# Handoff

## Resume point

P08-R06 / Phase 08 is IN_PROGRESS on local feat/p08-history based on main 4082c3a463b50ba4397f080e1b81bc15e03bf140. PR 26 is merged; P08-R01 is DONE with exact main push 33182876541 passing. [Merge checkpoint](../evidence/phase-08/progress-candidate.md). Full Phase 00–14 goal remains active.

## Exact next actions

1. Publish the coherent history candidate. Predecessor PR CI 33181780482 and main push 33182876541 for 4082c3a463b50ba4397f080e1b81bc15e03bf140 pass; no PR 26 rerun/review or extra commit is needed.
2. History/continue-watching is locally complete: 60 Engagement tests, 25-row SQL/query plans, real federated pages/metadata/completion/retirement/authorization and final 40/40 affected tasks against main. The predecessor's post-merge condition is satisfied. Then initial/confirmation review and protected merge/post-merge, batching only blockers.
3. No production source changed during the test-only predecessor correction or identical-tree squash rebase. Reuse real SQL/Docker evidence; generated manifest and source hashes remain identical. Do not rerun unchanged media/browser/host experiments.
4. Autostash a281042, d4320f6 and all older recovery stashes are already applied. Never reapply them. Candidate tooling is 4 GiB / 2 GiB Node heap, Turbo concurrency two.
5. Once history is frozen and WAITING_EXTERNAL, activate only P08-R07 on its dependent local branch. Planned next: P08-R07 durable idempotent watchlist, current Catalog visibility and finite owned pagination; P08-R08 batched fields; P08-R09 relay/consumers/deletion; P08-R11 browser reporting/resume. Keep existing private owner credentials purpose-separated; no Playback-session workaround for watchlist.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is Catalog 0008 / Playback 0001. Backup: C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Prior images: aster-p07-rollback:{web,router,catalog}. Web now runs review image f29a1ebe; Catalog runs 4429f8e0. Playback/Router remain the released backend. Both updated owners are healthy; affected browser proof passes. Database/media containers and immutable film data were not recreated. Disposable aster-p07-playable-proof cleanup checked 13 containers, seven volumes and two networks and left zero resources; the separate review PostgreSQL fixture also left zero resources.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL launch is unreliable; do not restart or diagnose it. aster-p06-tooling:git supports the canonical mount, UID 1002 and bounded resources. Set CI=true for pnpm commands to match the completed installation's virtual-store setting; do not reinstall repeatedly or disable dependency verification. pnpm install used the existing WSL store/cache with normal registry policy checks. Native Docker/Windows Node run built-in supervisors; workspace dependency imports need Linux tooling (native Windows cannot resolve these pnpm links). Native Git credentials push; Docker Git commits with normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim Phase 08 completion or browser saving. The federated proof cleaned all its containers, trust volumes and networks. Preserve retained demo/media and user processes. No broad Docker reset or media encode. Docker Git is authoritative for Linux modes; never use a codex/ branch.
