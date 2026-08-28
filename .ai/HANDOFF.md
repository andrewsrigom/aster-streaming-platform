# Handoff

## Resume point

P07-R01 / Phase 07 is IN_PROGRESS on feat/p07-playback, based on released main 4083ea65edcf750bf4ba3e253654a529b72cd105. Phases 00–06 are released; [PR 23 and exact protected/post-merge evidence](../evidence/phase-06/release.md). No further Phase 06 review/pipeline request. Full Phase 00–14 goal remains active.

## Exact next actions

1. Current Catalog projection, protected private GraphQL read, bounded consumer, anonymous session rules and PostgreSQL persistence are implemented. Affected suite 233/233, real PostgreSQL boundaries/migrations and strict/static/schema checks pass. [Evidence](../evidence/phase-07/README.md). No public Playback mutation or running service/Compose integration yet.
2. Implement the Playback subgraph/runtime and connected owner/session journey. [ADR-0027](../docs/adr/0027-local-playback-sessions.md) requires independent Router-to-Playback and Playback-to-Catalog credentials, never shared Router authority or recursive public calls. Existing helpers use /run/aster-playback-catalog/catalog.key; Compose initializer/mounts still need wiring.
3. New sessions use isolated migration 0001, 4096 SQL slots, 24-hour post-expiry audit and at most 64 expired deletions per admission. SQL parameters are explicitly typed; tests verify exact capacity and recovery. Do not repeat unchanged PostgreSQL/film tests unless later work invalidates them. Player/demo follow the complete backend candidate.

P07 work was restored and rebased successfully. Stash 2b0341cbb5604f007fc2206edaf8b37b9c9b1cef is only an older recovery copy, not pending work to apply.

## Retained runtime

Project aster-p04-development: Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes. Exact-prefix policy, anonymous HEADs, CORS, Range, private/listing/other-prefix rejection and Web 200 pass. [Publication](../evidence/phase-06/publication.md), [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is 0007. Additive 0008 is tested but must be applied before replace/rollback. Serving Catalog remains image sha256:25d7222f4118115d8bb034bd573401714b9ac7078a5621ff7d6b98bd8e80f860. Media origin is loopback 9001, edge-only, storage read-only; private writer remains concurrency one. Web/Router remain 3000/4000.

Uncertain publication grants retain their recovery barrier. Read the publication recovery procedure and fence publishers/private writer before changing it. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Execution environment

Windows Codex, repository through WSL UNC. WSL command launch is unreliable; do not restart or diagnose host/CPU. Existing aster-p06-tooling:git Docker image supports canonical repo mount, UID 1002 and bounded resources. Full source gate uses pnpm check:source --concurrency=2 and pids-limit 256. Native Docker/Windows Node handle built-in-only supervisors. Native Git credentials can push; local commits use Docker Git and normal hooks. Do not overlap Git writes.

## Do not do yet

Do not claim a running Playback API from in-memory tests or publish an incomplete backend slice. Preserve retained volumes/media, Windows processes and existing app. No broad Docker prune/reset, new film encode or unchanged browser/CPU benchmark. Docker Git is authoritative for Linux executable modes. Never create/use a codex/ branch.
