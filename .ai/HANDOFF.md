# Handoff

## Resume point

P07-R01 / Phase 07 is IN_PROGRESS on feat/p07-playback, based on released main 4083ea65edcf750bf4ba3e253654a529b72cd105. Phases 00–06 are released; [PR 23 and exact protected/post-merge evidence](../evidence/phase-06/release.md). No further Phase 06 review/pipeline request. Full Phase 00–14 goal remains active.

## Exact next actions

1. Core commit 9ab840abd236c49eca6195f1b8c36627609891ad has a coherent uncommitted API/runtime/Compose successor. Affected suite 248/248, full source 54/54, actual restricted-role PostgreSQL/migration checks and the disposable federated Docker journey pass. [Evidence](../evidence/phase-07/README.md). Do not reimplement this completed local boundary.
2. Finish candidate governance/changed-scope checks, source hashes and a coherent commit, then one PR with protected CI and initial/confirmation review. No Phase 07 push/PR yet at this checkpoint. Local main ref is stale f36f9aa; explicit schema compatibility against released 4083ea65 already passed. Generated manifest d4b22c951a4ec16709271439036fcac27a00198f7e1f8d6a6ee1587052161ddd.
3. Start the accessible HLS player/demo after backend acceptance or the explicit frozen WAITING_EXTERNAL checkpoint. Migration 0001, 4096 SQL slots, 24-hour post-expiry audit and bounded cleanup are verified. [ADR-0027](../docs/adr/0027-local-playback-sessions.md) and the [session runbook](../services/playback/README.md) define separate Router and private Catalog credentials. Do not repeat unchanged PostgreSQL/film/runtime experiments for prose changes.

P07 work was restored and rebased successfully. Stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef is only an older recovery copy, not pending work to apply.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is 0007. Additive 0008 is tested but must be applied before replace/rollback. Serving Catalog remains image sha256:25d7222f4118115d8bb034bd573401714b9ac7078a5621ff7d6b98bd8e80f860. Media origin is loopback 9001, edge-only, storage read-only; private writer remains concurrency one. Web/Router remain 3000/4000.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL command launch is unreliable; do not restart or diagnose host/CPU. Existing aster-p06-tooling:git Docker image supports canonical repo mount, UID 1002 and bounded resources. Full source gate uses pnpm check:source --concurrency=2 and pids-limit 256. Native Docker/Windows Node handle built-in-only supervisors. Native Git credentials can push; local commits use Docker Git and normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim player/phase completion from the backend runtime proof or claim the retained app was upgraded. Preserve retained volumes/media, Windows processes and existing app. No broad Docker prune/reset, new film encode or unchanged browser/CPU benchmark. Docker Git is authoritative for Linux executable modes. Never create/use a codex/ branch.
