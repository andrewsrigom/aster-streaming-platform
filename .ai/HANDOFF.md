# Handoff

## Resume point

P08-R11 IN_PROGRESS, unpublished on feat/p08-player-progress, base7fe10ed9251c5e2c9d6f08d32ce3d93a29f627cc. PR30 passed protected CI33211565625 and clean confirmation5457863408, then squash-merged. R09/R10/R12 is DONE after successful exact main push33212852513. Full Phase00–14 goal remains active.

All historical stashes/checkpoints, including4e83d8455b9f7c7fe73a50d6ecc4194b6906a32c,1643f0b7fa5b82d3f0ba3828414d4e3c92a107d1,fec057f and8212, were restored. Never reapply them. Git diff proved the frozen c48 and squash trees identical before moving the unpublished branch without changing its index/worktree.

## Exact next actions

1. Source candidate is accepted: [70/70 canonical checks](../evidence/phase-08/player-library-candidate.txt) and [50 focused tests](../evidence/phase-08/player-library.txt), Web build/types/lint and exact-main composition pass. Do not repeat unchanged source/host checks; move to the real personalized demo. Browser source compiles, but the journey has not run.
2. Actual Controls/profile lifecycle, resume/status, library/history/continue/watchlist and lazy title controls are wired. Apollo owns remote data; one immutable watchlist intent permits at most two explicit attempts. Pages replace at most20 entries per view; no offline queue.
3. Execute apps/web/test/browser/engagement.spec.ts against a fresh isolated full demo, not the retained project. ASTER_ENGAGEMENT_DEMO=true is required; it refuses a pre-existing profile collection. It covers save/resume, completion/history, watchlist, profile isolation, save-transport failure with continuing media, sign-out and accessibility. Resolve actual timing/focus findings.
4. Merged Compose config has been validated read-only:21 required services,only named volumes,no bind mounts or top-level configs. Exact project isolation and cleanup still need inspection before starting. Candidate command combines infra/compose/compose.yml, playable.yml and events.yml with --profile runtime, then up --build --wait --wait-timeout180 web identity engagement broker-init. Existing overlays should suffice. Preserve the Phase07 web-only anonymous command. Verify clean startup/replay/cleanup, document it and wire the accepted journey into proportional CI. No retained migration or film re-encode.
5. PR30 exact main push33212852513 passed (GitHub runs API confirms event=push/head7fe10ed/status=completed/conclusion=success). Publish R11 only after its own acceptance, with one initial and one confirmation review, protected CI, expected-head squash and exact main push. Phase08 closeout and Phase09 prerequisites follow.

## Evidence boundaries

Protected CI33211565625 now passes the complete corrected event supervisor, including real SQL/Kafka, signed deletion, quarantine/replay, outage recovery, bounded shutdown and cleanup. The earlier local wrapper exited1 on its obsolete SIGTERM assertion; do not rewrite it as success. Earlier70/70 and SQL/Kafka observations remain supporting evidence. events-source.sha256 describes the original checkpoint; test-only deltas are in events-ci.txt. No unchanged heavy event/SQL/CPU/media repeat.

Player tests use real Apollo with fake HTTP/media/clocks. The browser journey is authored, not executed; running demo remains Phase07. Current manifest db64ea697175ae84e0058af339c160fbbd85098d1965643cb92d5ee2631d881b adds PlayerProgress and WatchlistMembership. Existing library documents remain unchanged.

## Execution environment

Native WSL Git; pinned Node24.19.0/pnpm11.24.0 at /mnt/c/Users/andre/.cache/aster-node-24.19.0. Add to PATH; executable pnpm shim exists. Node SHA256 bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12. Windows Node20 is unsuitable. Use CI=true NODE_OPTIONS=--max-old-space-size=1536 and pnpm_config_verify_deps_before_run=error.

Canonical gate: runQualityGate(['--changed'],limited), spawn adapter appending --concurrency=2 --continue=always --output-logs=errors-only. Keep inventory/deadline/cancellation. Native commands through wsl --distribution Ubuntu-20.04 --user andrews --exec; bounded waits and focused tests during edits.

Windows Git credential manager works with command-scoped safe.directory=//wsl.localhost/Ubuntu-20.04/home/andrews/personal/portfolio-2026/aster-streaming-platform. No global safe.directory change or codex/ branches.

## Retained runtime

Project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008/Playback0001, no Phase08 upgrade. Big Buck Bunny title00000000-0000-4000-8000-000000080001, version9/rights4/publication c2929850-d3a3-4e30-945f-688d639d2c68; bundle3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d,209objects/95496764bytes. Watch HTTP200 confirmed; no new decoding claim.

Preserve backup C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump and rollback tags aster-p07-rollback:web,router,catalog. Preserve media, databases, audit, pending events and deletion fences.

## Do not do yet

No WSL/Docker restart, global cleanup, unrelated-process action, CPU/memory loop, unchanged heavy proof or retained film encoding. Repository bind-mount integration previously failed: do not retry unchanged or restart WSL. Direct WSL Docker and exact disposable tmpfs fixtures work. Inspect isolation/start/cleanup for the new demo instead of changing retained data. General event-overlay reset remains refused pending reviewed R11 integration. No paid resources or invented media rights.
