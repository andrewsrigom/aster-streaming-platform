# Handoff

## Resume point

P06-R01 / Phase 06 remains IN_PROGRESS on feat/p06-media-pipeline; PR 23 is ready. Full Phase 00–14 goal remains active. Released main is f36f9aa7043dc1fe7b6394a0a800e4e842bf6865 (Phases 00–05).

Head 9723032 passed full protected CI 33153640859. Confirmation found a new rights/access race and stale guide. Current correction holds the policy barrier through current approval/restricted SQL registration, restores only rejected new grants, preserves prior grants and records bounded uncertain-failure recovery. Focused 27/27, source 51/51 and real S3 race/rejection tests pass. [Current evidence](../evidence/phase-06/rights-access-confirmation.md). Finish final storage/docs closeout and one coherent commit/push; require new exact-head protected CI and confirmation, not another ready transition.

Initial PR head 459607b407d1b6f0fd63b5416d06a9fc34b4b36d / CI 33151304060 is not release proof. Initial review found partial-object exposure; CI found the standalone probe's obsolete migrations 1–3 expectation. Both are corrected locally. [Access evidence](../evidence/phase-06/publication-access.md) records the real storage test and retained migration. Candidate source/confirmation/protected release still must close.

## Exact next actions

1. Current correction passes focused 27/27, full source 51/51, final real S3 fixture and documentation/security 10/10. Local confirmation is recorded in its evidence; no source/media change remains before publication.
2. Commit with normal hooks, push the existing PR branch once and request confirmation of this blocking-boundary correction. Require exact-head protected CI, no rerun of the old head and no bypass.
3. Squash only after checks/review pass, fetch clean main and verify the exact post-merge CI.
4. Mark P06-R01 done and start Phase 07 (Playback owner, product player and fresh-volume Docker playable demo). No other active work item.

The unsupported ACL experiment is not retained in code. Exact-prefix bucket policy is the supported path; a private conditional-create control lock serializes grants. Ambiguous failures keep the barrier until operator recovery fences publishers/private writer. Read the recovery section before deleting any control lock. No automatic S3 lifecycle deletion or hosted multi-writer claim.

## Retained runtime

Project aster-p04-development: actual Big Buck Bunny is PUBLISHED, title 00000000-0000-4000-8000-000000080001, version 9, rights revision 4, publication c2929850-d3a3-4e30-945f-688d639d2c68. Original review 2 and all immutable source/processing/audit remain.

Bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects / 95496764 bytes under aster-media-published/publications/HASH/. Policy now grants only that complete prefix. All 209 anonymous HEADs, CORS, Range, negative private/listing/other-prefix checks and Web 200 pass after restriction. No media or editorial bytes changed. The migration barrier was removed successfully.

HLS attempt 68e41f87-ca12-44ff-96d3-8a9e66d67795; artwork attempt 7674df29-2a04-4055-bcc8-cef60449520f. Full checksums/manifests are in [publication evidence](../evidence/phase-06/publication.md) and [browser evidence](../evidence/phase-06/browser.md). Do not re-download or re-encode unchanged media.

Retained schema is 0007. Additive 0008 is tested but must be applied before replace/rollback. Serving Catalog remains image sha256:25d7222f4118115d8bb034bd573401714b9ac7078a5621ff7d6b98bd8e80f860. Media origin is loopback 9001, edge-only, storage read-only; private writer remains concurrency one. Web/Router remain 3000/4000.

## Execution environment

Windows Codex, repository through WSL UNC. WSL command launch is unreliable; do not restart or diagnose host/CPU. Use the existing aster-p06-tooling:git Docker image with canonical repo mount, UID 1002, bounded resources. Full source gate uses pnpm check:source --concurrency=2 and pids-limit 256; this limits test scheduling, not a benchmark. Native Docker and Windows Node can run built-in-only supervisors. Native Windows Git credential helper can push; local commits use Docker Git and normal hooks.

## Do not do yet

Do not merge before corrected exact-head CI/confirmation or start Phase 07 before the documented transition. Preserve all retained volumes/media, user Windows processes and existing app. No broad Docker prune/reset, no new film encode or unchanged browser/CPU benchmark. Native Git may show spurious UNC executable-mode changes; Docker Git is authoritative for Linux modes. Never create/use a codex/ branch.
