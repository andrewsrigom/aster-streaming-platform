# Handoff

## Resume point

P09-R01 is released through PR33 exact candidate `fc353c3`, protected run
33238473742, resolved review, squash main `0bdcb27` and exact-main run
33239191134. Search/projection evidence remains under `evidence/phase-09`.

P09-R03 is active on dependent `feat/p09-home-rails`, rebased on precursor squash
main `583c835`. Rails, fallback, owner composition, telemetry, real SQL/runtime
and the initial54/54 gate pass. Confirmation discussions3886014605/606 found
database fan-out and rollout blockers. Fan-out now uses one transaction per home
request with one readiness pool reservation; Discovery83/83 passes. PR35 stages
ordered migrations1–2 or1–3 in readiness and old init without applying migration3;
its corrected75/75 plus42/42, clean confirmation and protected run33243983340 pass.
PR35 merged as583c835; exact-main run33244657936 passed. Discovery88/88, real
mixed readiness and repeated runtime pass with cleanup0. Migration3/publication
is unblocked. Final candidate passes54/54,39 cached, in48.761s.
PR34 exact0d1a7ef passed protected run33245434181; remediation confirmation then
found partial-log classification and stale parallel wording in ADR-0036. Both are
corrected locally; focused Discovery89/89 and the final54/54 affected candidate
in47.708s pass.
Exact8650670 passed protected run33246333963. Final confirmation found only the
GraphQL architecture excerpt default20/schema default10 mismatch; fixed locally.
Full Phase00–14 goal remains active.

## Exact next actions

1. Update PR34.
2. Reply to and resolve discussion3886202415.
3. Require closeout confirmation/protected CI, then
   squash/exact-main and activate P09-R10.

## Evidence boundaries

The precursor evidence is in `home-rails-compatibility.txt`. Initial [SQL](../evidence/phase-09/home-rails-postgres.txt)
and [runtime](../evidence/phase-09/home-rails-runtime.txt) evidence retain failures,
corrections and zero residue. Pool/admission and mixed-version changes received both
affected repeats; source object IDs remained exact after the final squash rebase.
The later log classifier and ADR prose are covered by focused/candidate gates and
cannot affect SQL, media or binary runtime behavior. The latest correction changes
only a non-authoritative architecture excerpt. Browser/media/CPU evidence is unaffected.

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
