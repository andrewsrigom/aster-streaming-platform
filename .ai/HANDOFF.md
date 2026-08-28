# Handoff

## Resume point

P08-R01 / Phase 08 is IN_PROGRESS on feat/p08-progress, already rebased on main 854592e5ff1213a306b45d61a547ad4f2a2d9395. P07-R04 is DONE: protected CI 33170527302, confirmation 5452439397, squash and post-merge 33171284170 pass. [Release](../evidence/phase-07/release.md). Full Phase 00–14 goal remains active.

## Exact next actions

Priority: PR 26 confirmation 5453879542 passes corrected 736bcdac. CI 33180440040 failed an unchanged Catalog attestation test: fixed command time precedes SQL registration across a second boundary. Correct only the controlled fixture clock, prove real SQL and the affected candidate gate, then publish once and finish protected merge/post-merge. Production source and rights checks remain unchanged. P08-R06 code, 60-test result, rebased SQL and passing full federated read proof are preserved in exact stash d4320f6f84043fc92c2ffc687a075f087e377753 on feat/p08-history. Rebase and restore that stash once after predecessor; all older stashes were already restored. Generated history output was moved recoverably to node_modules/.aster-history-build-ab8d4499-900a-44fd-8571-325e28bad87c to exclude stale tests from this predecessor gate.

1. Finish P08-R01 candidate quality, evidence and protected review/release. Domain/SQL/private owner reads/Engagement GraphQL/Docker are implemented. [Federated runtime proof](../evidence/phase-08/federated-runtime.txt) passed all scenarios and removed its exact project; no retained state changed.
2. The current backend provides recordProgress, not player save/resume, watchlist, paginated reads or broker relay. Keep those as the next explicit Phase 08 items.
3. Main/origin/main remains 854592e; current PR head is 736bcdac. Only d4320f6 is unrestored; never reapply an older stash. Candidate gates use 2 GiB Node heap, 4 GiB tooling and Turbo concurrency two. No CPU/film loop or closed PR 25 polling.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is Catalog 0008 / Playback 0001. Backup: C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Prior images: aster-p07-rollback:{web,router,catalog}. Web now runs review image f29a1ebe; Catalog runs 4429f8e0. Playback/Router remain the released backend. Both updated owners are healthy; affected browser proof passes. Database/media containers and immutable film data were not recreated. Disposable aster-p07-playable-proof cleanup checked 13 containers, seven volumes and two networks and left zero resources; the separate review PostgreSQL fixture also left zero resources.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL launch is unreliable; do not restart or diagnose it. aster-p06-tooling:git supports the canonical mount, UID 1002 and bounded resources. Set CI=true for pnpm commands to match the completed installation's virtual-store setting; do not reinstall repeatedly or disable dependency verification. pnpm install used the existing WSL store/cache with normal registry policy checks. Native Docker/Windows Node run built-in supervisors; workspace dependency imports need Linux tooling (native Windows cannot resolve these pnpm links). Native Git credentials push; Docker Git commits with normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim Phase 08 completion or browser saving. The federated proof cleaned all its containers, trust volumes and networks. Preserve retained demo/media and user processes. No broad Docker reset or media encode. Docker Git is authoritative for Linux modes; never use a codex/ branch.
