# Abandoned media scratch recovery

Source base `f3c5379`, branch `feat/p06-media-pipeline`, 2026-08-28. Requirements P06-R04/R10; [ADR-0023](../../docs/adr/0023-isolated-media-decoder.md). Catalog media tooling owns only disposable job scratch.

## Behavior

Candidate scratch volumes now include the non-reused run UUID. The new `pnpm media:cleanup PROJECT RUN_UUID` command defaults to inspection; `--apply` removes only the displayed stopped, expired run containers and their exact local tmpfs volumes. Every target must be at least 31 minutes old and match project/run/service/type/options. Foreign consumers, running/paused/restarting jobs, recent resources, unknown mounts and legacy/non-disposable volumes fail closed. Removal rechecks identity and uses no force; new jobs cannot inherit an old run's volume name. A partial cleanup is retryable by the same project/run.

The CLI has a 60-second overall deadline, eight-second Docker commands, two-container/two-volume collection bounds and bounded output parsing. It rejects remote context overrides and validates a local Unix/named-pipe Docker endpoint. Logs report only plan/removed identities and sanitized failure codes, not inspected environment/credentials.

## Evidence

Focused checks: `node --test tools/media/scratch-cleanup.test.mjs tools/run-media-candidate.test.mjs` passes 6/6, covering dry run, age/ownership/mount guards, cancellation, state changes, foreign consumers, interrupted cleanup/replay, invalid CLI/remote targets and Compose run naming.

[Real Docker fixture](scratch-docker.txt): `node tools/verify-media-scratch.mjs` passes on native Docker with Windows bundled Node. A unique `aster-scratch-ebf152cf` project created two labelled tmpfs volumes, a created owner container, an exited version-only container and a temporary foreign consumer. Real Compose expansion matched the new names. The real clock refused a young run; an explicitly controlled in-process test clock exercised the expired path without waiting 31 minutes. A foreign consumer blocked cleanup. Dry run left everything unchanged; apply removed only the two owned containers and volumes; replay found no resources.

No Docker image build/pull, source GET, film encoding, artwork generation, CPU diagnostic, retained-data mutation or serving restart occurred. The fixture used the existing pinned VersityGW executable only for `--version`. Initial lint required explicit Node/global imports; no production behavior was weakened. Confirmation added exact reinspection identity assertions and aligned the candidate project-name bound with recovery. Existing source/HLS/JPEG/SQL/rollback evidence remains valid; only scratch naming/cleanup changed.

[Source gate](scratch-source.txt): 51/51 tasks, 38 cached, 44.208 s. [Documentation/security](scratch-closeout.txt): 10/10 tasks, no cache, 7.001 s. [Source fingerprints](scratch-source.sha256) identify the exact changed implementation.

## Remaining phase work

Scratch recovery does not implement storage-prefix lifecycle garbage collection. Immutable originals/candidates and partial content-addressed publication copies remain retained for verified replay; automatic deletion would require publication/attempt fencing and a separate retention policy. Assess that remaining P06-R10 boundary explicitly rather than calling it implemented. Representative browser HLS playback and Phase 06 acceptance/release are also still open. Retained first film remains PUBLISHED at version 9 / rights revision 4; migration 0008 is still unapplied there.
