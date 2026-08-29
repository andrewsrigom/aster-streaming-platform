# Handoff

## Resume point

P09-R01 is released through PR33 exact candidate `fc353c3`, protected run
33238473742, resolved review, squash main `0bdcb27` and exact-main run
33239191134. Search/projection evidence remains under `evidence/phase-09`.

P09-R03 is active on dependent `feat/p09-home-rails`, based on frozen precursor
PR35 exact `8002594`. Rails, fallback, owner composition, telemetry, real SQL/runtime
and the initial54/54 gate pass. Confirmation discussions3886014605/606 found
database fan-out and rollout blockers. Fan-out now uses one transaction per home
request with one readiness pool reservation; Discovery83/83 passes. PR35 stages
ordered migrations1–2 or1–3 in readiness and old init without applying migration3;
its corrected75/75 plus42/42 pass. Migration3/publication wait for precursor exact
main. Full Phase00–14 goal remains active.

## Exact next actions

1. Finish PR35 confirmation review, protected merge and exact-main CI.
2. Rebase this branch onto its squash and prove migration3 old/new readiness.
3. Repeat affected SQL/runtime/candidate gates and update PR34 once.
4. Resolve both discussions, require remediation confirmation/protected CI, then
   squash/exact-main and activate P09-R10.

## Evidence boundaries

The precursor evidence is in `home-rails-compatibility.txt`. Initial [SQL](../evidence/phase-09/home-rails-postgres.txt)
and [runtime](../evidence/phase-09/home-rails-runtime.txt) evidence retain failures,
corrections and zero residue. Pool/fan-out and mixed-version changes require those
two affected repeats after final rebase. Browser/media/CPU evidence is unaffected.

## Execution environment

Use native WSL Git and pinned Node 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Add it to PATH, install before
setting `pnpm_config_verify_deps_before_run=error`, and use
`CI=true NODE_OPTIONS=--max-old-space-size=1536`. Run commands through
`wsl --distribution Ubuntu-20.04 --user andrews --exec` with bounded deadlines.

Windows Git credential manager works with command-scoped
`safe.directory=//wsl.localhost/Ubuntu-20.04/home/andrews/personal/portfolio-2026/aster-streaming-platform`.
Never create or use `codex/` branches.

## Do not do yet

Preserve all retained media, databases, credentials, pending events and deletion
fences. The retained project is not a P09 acceptance target. No WSL/Docker restart,
global cleanup, unrelated-process action, CPU/memory loop, unchanged heavyweight
proof or film encode. Use only UUID-labelled disposable fixtures and exact cleanup.
