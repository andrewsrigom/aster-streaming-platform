# Handoff

## Resume point

P08-R08 PR 29 is IN_PROGRESS on feat/p08-engagement-fields for the test-only CI watchdog correction below. P08-R07 is DONE after protected reviews/CI and exact main push 33195546036. R09 is parked, not lost; the new stash below has not been restored. Full Phase 00–14 goal remains active.

## Exact next actions

PR 29 is active for a test-only CI correction: the old Identity diagnostic execFile watchdog killed its child at five seconds. The diagnostic-only 30-second outer budget passes all ten composition tests; production deadlines and R08 behavior are unchanged. Publish this coherent correction once, require fresh protected CI and final-head confirmation, then rebase feat/p08-event-delivery and restore its new stash 8212c15d42e15d77e7fa5725c651c9d6bc4adbaf exactly once. That stash is NOT restored yet and contains eleven-test-passing event core, ADR-0034 and the active R09 plan. Older stashes remain already restored. Never reinstall or repeat unchanged SQL/Docker solely for this test edit.

1. R08 local acceptance passes: 98 Engagement tests, nine composition tests, real SQL, full isolated Docker and 67/67 candidate tasks. [Checkpoint](../evidence/phase-08/engagement-fields.md) and source hashes are authoritative. No repeat of unchanged heavy checks.
2. R08 is based on main 9a7ab087034d69589a8388d62f5973cb9950b2da; do not repeat its old rebase. Existing production source hashes and composition remain valid. Publish only the watchdog correction, then collect its exact protected CI/final confirmation. No R07 work remains.
3. Once the corrected R08 is frozen WAITING_EXTERNAL, rebase feat/p08-event-delivery onto it and restore new stash 8212c15 exactly once. Reconcile its memory with the current PR head; continue R09 locally without publishing before R08 merge/post-merge. R11 player reports/resume follows.
4. All recovery stashes are already restored, latest 416c574be8e3d14154943308efc1ed1f017683d3. Never reapply. Ignored build backups remain recoverable.
5. Docker attempt one stopped during build before assertions; one cache-assisted attempt passed, project 1cade285-e5b3-4ec1-aec5-6bcca92520be, and cleaned all thirteen containers/eight trust volumes/two networks. No CPU/WSL/media experiment or retained upgrade.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is Catalog 0008 / Playback 0001. Backup: C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Prior images: aster-p07-rollback:{web,router,catalog}. Web now runs review image f29a1ebe; Catalog runs 4429f8e0. Playback/Router remain the released backend. Both updated owners are healthy; affected browser proof passes. Database/media containers and immutable film data were not recreated. Disposable aster-p07-playable-proof cleanup checked 13 containers, seven volumes and two networks and left zero resources; the separate review PostgreSQL fixture also left zero resources.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL launch is unreliable; do not restart or diagnose it. aster-p06-tooling:git supports the canonical mount, UID 1002 and bounded resources. Set CI=true for pnpm commands to match the completed installation's virtual-store setting; do not reinstall repeatedly or disable dependency verification. pnpm install used the existing WSL store/cache with normal registry policy checks. Native Docker/Windows Node run built-in supervisors; workspace dependency imports need Linux tooling (native Windows cannot resolve these pnpm links). Native Git credentials push; Docker Git commits with normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim Phase 08 completion or browser saving. The federated proof cleaned all its containers, trust volumes and networks. Preserve retained demo/media and user processes. No broad Docker reset or media encode. Docker Git is authoritative for Linux modes; never use a codex/ branch.
