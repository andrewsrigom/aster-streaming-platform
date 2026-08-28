# Handoff

## Resume point

P08-R08 is IN_PROGRESS on feat/p08-engagement-fields. P08-R07 is DONE: PR 28 is squash-merged as 9a7ab087034d69589a8388d62f5973cb9950b2da, tree-identical to reviewed head 05fbead7c8d3345bbd44d4e0685f10e7581bda29. Protected CI 33193355470, clean initial review 5455665142, clean confirmation 5455734225 and exact main push 33195546036 pass. R08 local acceptance is complete; publish once and freeze WAITING_EXTERNAL before activating R09. Full Phase 00–14 goal remains active.

## Exact next actions

1. R08 local acceptance passes: 98 Engagement tests, nine composition tests, real SQL, full isolated Docker and 67/67 candidate tasks. [Checkpoint](../evidence/phase-08/engagement-fields.md) and source hashes are authoritative. No repeat of unchanged heavy checks.
2. R08 is committed and already rebased onto origin/main 9a7ab087034d69589a8388d62f5973cb9950b2da; do not repeat the rebase or restore any stash. Source checkpoint 35c1f8964831d5658f418533b8763569bd14b494 is tree-identical to the original 95f3725 candidate; every source hash and explicit schema baseline against 9a7ab08 pass. Use current HEAD after memory-only closeout. R07 exact main push 33195546036 is successful; publish R08 once. No R07 review or pipeline work remains.
3. R08 needs its own initial/confirmation review, protected CI, squash and exact post-merge. Once frozen WAITING_EXTERNAL, activate R09 relay/deletion (also R10/R12), then R11 player reports/resume.
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
