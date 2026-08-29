# Handoff

## Resume point

P09-R01 is released through PR33 exact candidate `fc353c3`, protected
run33238473742, squash main `0bdcb27` and exact-main run33239191134.

P09-R03 is active. PR34 candidate `7d31678` locally verifies home rails, but its
confirmation review found database fan-out and no migration-3 readiness overlap.
The fan-out correction is preserved locally on `feat/p09-home-rails` commit
`2211983` above rails commit `6ab80f6`; it must rebase after this precursor changes.
The current branch `fix/p09-discovery-schema-compatibility` stages the
released search binary to accept only ordered migrations1–2 or1–3 before
migration3 is applied. PR35 confirmation also found the old init preflight
rejected marker3; the correction tolerates it without applying an unknown script.
Discovery75/75 and focused static gates pass. Full Phase00–14 goal remains active.
The corrected affected candidate passes42/42,26 cached, in47.204s.

## Exact next actions

1. Commit/publish the corrected precursor and resolve its confirmation review
   through protected PR.
2. Squash merge and confirm exact-main CI before migration3.
3. Rebase `feat/p09-home-rails`, add real mixed-version readiness proof, repeat
   affected gates and update PR34 once.
4. Resolve both review discussions, require remediation confirmation/protected CI,
   then squash/exact-main and activate P09-R10.

## Evidence boundaries

Protected CI33211565625 now passes the complete corrected event supervisor, including real SQL/Kafka, signed deletion, quarantine/replay, outage recovery, bounded shutdown and cleanup. The earlier local wrapper exited1 on its obsolete SIGTERM assertion; do not rewrite it as success. Earlier70/70 and SQL/Kafka observations remain supporting evidence. events-source.sha256 describes the original checkpoint; test-only deltas are in events-ci.txt. No unchanged heavy event/SQL/CPU/media repeat.

P09 search release evidence is in `evidence/phase-09/search-release.md`. The
compatibility trigger/correction is in `home-rails-compatibility.txt`. This
precursor changes only readiness/init predicates and docs, so it does not repeat
unchanged Docker/media/search runtime. PR34 must repeat actual migration3 SQL and
readiness after rebase.

## Execution environment

Native WSL Git; pinned Node24.19.0/pnpm11.24.0 at /mnt/c/Users/andre/.cache/aster-node-24.19.0. Add to PATH; executable pnpm shim exists. Node SHA256 bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12. Windows Node20 is unsuitable for source/builds; it was used only to execute compatible pinned Windows Playwright in C:/Users/andre/AppData/Local/Temp/aster-p07-browser-c14b6d12/p08 against isolated Chrome. Private failure traces stay there; never publish session-bearing traces. Use CI=true NODE_OPTIONS=--max-old-space-size=1536 and pnpm_config_verify_deps_before_run=error.

Canonical gate: runQualityGate(['--changed'],limited), spawn adapter appending --concurrency=2 --continue=always --output-logs=errors-only. Keep inventory/deadline/cancellation. Native commands through wsl --distribution Ubuntu-20.04 --user andrews --exec; bounded waits and focused tests during edits.

Windows Git credential manager works with command-scoped safe.directory=//wsl.localhost/Ubuntu-20.04/home/andrews/personal/portfolio-2026/aster-streaming-platform. No global safe.directory change or codex/ branches.

## Retained runtime

Project aster-p04-development: Web3000/Router4000/origin9001, Catalog0008/Playback0001, no Phase08 upgrade. Big Buck Bunny title00000000-0000-4000-8000-000000080001, version9/rights4/publication c2929850-d3a3-4e30-945f-688d639d2c68; bundle3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d,209objects/95496764bytes. Watch HTTP200 confirmed; no new decoding claim.

Preserve backup C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump and rollback tags aster-p07-rollback:web,router,catalog. Preserve media, databases, audit, pending events and deletion fences.

## Do not do yet

No WSL/Docker restart, global cleanup, unrelated-process action, CPU/memory loop, unchanged heavy proof or retained film encoding. Repository bind-mount integration previously failed: do not retry unchanged. Direct WSL Docker works without host binds. The general reset remains intentionally limited to its old fixed checkpoint; personalized demo cleanup uses its exact project and all three Compose files. No paid resources or invented media rights.
