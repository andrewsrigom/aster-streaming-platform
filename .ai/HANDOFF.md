# Handoff

## Resume point

P08-R07 / Phase 08 is IN_PROGRESS on local feat/p08-watchlist. P08-R06 is DONE: PR 27 is squash-merged at main 0401ae3e850add27ad73fe7be12a1672d5a73414. Protected CI 33190917857, clean final-head confirmation 5455176079 and exact main push 33191946442 pass; both review threads are resolved. The squash tree equals that reviewed tree. Full Phase 00–14 goal remains active.

## Exact next actions

1. Watchlist local acceptance passes: 84 Engagement tests, nine composition tests, real PostgreSQL migration/replay/concurrency/256-entry limits and the complete federated Docker proof. The candidate gate passes 47/47 tasks (26 cached, 4m48.539s). Sources and raw evidence are linked in [watchlist checkpoint](../evidence/phase-08/watchlist.md). Browser reports/resume, R08 batching and R09 relay/deletion remain separate.
2. Watchlist is committed and already rebased onto origin/main 0401ae3; do not repeat that rebase or restore any stash. Source checkpoint 238ae404b756d23c056848b6e67291d8ad57d936 preserves the original candidate tree; every executable source hash and composition against exact 0401ae3 pass. Use current HEAD for final publication metadata after memory-only closeout. History's exact main push 33191946442 passed. Publish feat/p08-watchlist, then require one initial/confirmation review, protected CI, squash merge and exact post-merge for watchlist.
3. All recovery stashes are already restored, latest 416c574be8e3d14154943308efc1ed1f017683d3. Never reapply. Ignored build backups are recoverable. Runtime attempt one hit its five-minute build deadline; the one cache-assisted attempt passed and cleaned thirteen containers/eight trust volumes/two networks, retained runtime untouched. Do not repeat it for docs/type-only/identical-tree changes.
4. After R07 is frozen WAITING_EXTERNAL and predecessor is DONE, activate R08 request-scoped Title/Profile batching; then R09 relay/deletion and R11 browser reports/resume. No CPU/WSL/media experiment or broad reset.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is Catalog 0008 / Playback 0001. Backup: C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Prior images: aster-p07-rollback:{web,router,catalog}. Web now runs review image f29a1ebe; Catalog runs 4429f8e0. Playback/Router remain the released backend. Both updated owners are healthy; affected browser proof passes. Database/media containers and immutable film data were not recreated. Disposable aster-p07-playable-proof cleanup checked 13 containers, seven volumes and two networks and left zero resources; the separate review PostgreSQL fixture also left zero resources.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL launch is unreliable; do not restart or diagnose it. aster-p06-tooling:git supports the canonical mount, UID 1002 and bounded resources. Set CI=true for pnpm commands to match the completed installation's virtual-store setting; do not reinstall repeatedly or disable dependency verification. pnpm install used the existing WSL store/cache with normal registry policy checks. Native Docker/Windows Node run built-in supervisors; workspace dependency imports need Linux tooling (native Windows cannot resolve these pnpm links). Native Git credentials push; Docker Git commits with normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim Phase 08 completion or browser saving. The federated proof cleaned all its containers, trust volumes and networks. Preserve retained demo/media and user processes. No broad Docker reset or media encode. Docker Git is authoritative for Linux modes; never use a codex/ branch.
