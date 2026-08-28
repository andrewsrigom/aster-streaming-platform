# Handoff

## Resume point

P08-R06 / Phase 08 is IN_PROGRESS on local feat/p08-history based on main 4082c3a463b50ba4397f080e1b81bc15e03bf140. PR 26 is merged; P08-R01 is DONE with exact main push 33182876541 passing. [Merge checkpoint](../evidence/phase-08/progress-candidate.md). Full Phase 00–14 goal remains active.

## Exact next actions

1. Publish PR 27's locally accepted ENG-R04 correction on feat/p08-history. Original c512c9d has successful CI 33184567740 but blocking confirmation 5052590545 / thread PRRT_kwDOUEkeis6dN9km. ADR-0031's focused/SQL/Docker and applicable candidate gates now pass: [checkpoint](../evidence/phase-08/history-visibility.md). One coherent correction commit/push; no local blocker remains.
2. Resolve the addressed thread and request confirmation of this changed blocking boundary. Preserve protected CI/merge and exact post-merge requirements. No predecessor PR 26 rerun/review is needed; its main push 33182876541 passes.
3. Current trust/runtime/read behavior changed, so use the new history-visibility evidence. Unchanged media/browser/host experiments remain unnecessary. Retained demo data is untouched.
4. Watchlist source is preserved in UNAPPLIED stash ced886f6094d1b07b53e52400ef188d3d5ac5c86 on feat/p08-watchlist. Restore it once only after R06 is locally accepted/frozen; preserve newer memory, renumber its watchlist ADR to 0032 and reuse ADR-0031's Catalog port. Its 74 tests passed and real SQL verifier compiles, but that verifier has not run. Generated watchlist dist is recoverably held in node_modules/.aster-watchlist-build-Nf4hxEOV/engagement-dist. All older stashes/autostashes are already applied; never reapply those.
5. Only one later dependent may be IN_PROGRESS after history is frozen and WAITING_EXTERNAL. Rebase onto the corrected predecessor before publication; do not publish watchlist before history's protected merge/post-merge. Candidate tooling is 4 GiB / 2 GiB Node heap, Turbo concurrency two. Then R08 batching, R09 events/deletion and R11 player reporting/resume.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is Catalog 0008 / Playback 0001. Backup: C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Prior images: aster-p07-rollback:{web,router,catalog}. Web now runs review image f29a1ebe; Catalog runs 4429f8e0. Playback/Router remain the released backend. Both updated owners are healthy; affected browser proof passes. Database/media containers and immutable film data were not recreated. Disposable aster-p07-playable-proof cleanup checked 13 containers, seven volumes and two networks and left zero resources; the separate review PostgreSQL fixture also left zero resources.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL launch is unreliable; do not restart or diagnose it. aster-p06-tooling:git supports the canonical mount, UID 1002 and bounded resources. Set CI=true for pnpm commands to match the completed installation's virtual-store setting; do not reinstall repeatedly or disable dependency verification. pnpm install used the existing WSL store/cache with normal registry policy checks. Native Docker/Windows Node run built-in supervisors; workspace dependency imports need Linux tooling (native Windows cannot resolve these pnpm links). Native Git credentials push; Docker Git commits with normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim Phase 08 completion or browser saving. The federated proof cleaned all its containers, trust volumes and networks. Preserve retained demo/media and user processes. No broad Docker reset or media encode. Docker Git is authoritative for Linux modes; never use a codex/ branch.
