# Handoff

## Resume point

Phases 00–10 are released locally. PR40 exact
`6d748734e36dad419e6c9f377281a82a121ec917` passed protected run33281516077,
resolved review and squash-merged without bypass as
`eed82291c29e43d985cb6b0fa08d8c21be32c133`. Both commits have tree
`4282bfeaef6ef3182d3f584a460a86b449da312d`; exact-main run33282217705 passed.
Phase10 release evidence is under `evidence/phase-10/`.

P11-R01 is active on `feat/p11-dependency-policies`, based on that exact release.
The worktree intentionally contains the current Phase11 candidate and repository
memory changes.

Implemented locally:

- ADR-0040 replaces only ADR-0027's one-attempt clause for the fixed safe read.
- `DEPENDENCY_POLICY_REGISTRY.md` covers nineteen current operation classes and
  distinguishes application retry, reconnect, durable redelivery and user retry.
- `@aster/runtime` owns an overall-deadline safe-read executor, per-attempt
  deadlines, remaining-budget admission, equal jitter, finite attempts and
  finite observations.
- Playback publication reads use 1,500/650/100-ms budgets and max two attempts.
- Discovery snapshot/export reads use 2,000/850/100-ms budgets and max two
  attempts.
- Only HTTP502/503/504, EAI_AGAIN, ECONNRESET and incomplete/aborted streams are
  transient. Timeout is terminal. HTTP500, 4xx, redirects, invalid headers/body,
  malformed owner data and local capacity do not retry.
- Both logical operations retain the existing concurrency permit. Web and Router
  still do not retry these operations.
- Per-attempt metrics use finite `catalog`/`read` attributes.

Focused gates pass: runtime88/88, telemetry12/12, Playback38/38 and
Discovery107/107. The affected candidate passes53/53 with19 cached in69.098
seconds. Exact implementation `96e399b` has tree `d66004c`; evidence is under
`evidence/phase-11/`.

PR41 initial review at `d5498e0` produced one P2 discussion, `3888089399`: the
Playback guide contradicted the new safe-read retry. The local batched
remediation updates Playback and Discovery retry ownership plus stale Phase10
status in Catalog, Redis architecture and the feature catalog. Runtime behavior
is unchanged.

Confirmation discussion `3888100550` found a new blocking boundary at
`2543581`: a smaller upstream deadline could abort work but its remaining budget
was not visible to the retry gate. The local remediation registers repository
deadline lineage, returns the monotonic minimum parent/child budget, creates that
lineage in Playback transport/application, and adds deterministic parent-budget
tests. Runtime90/90 and Playback38/38 pass.

Corrected exact source `af4951a07f538029e32e855e693bdeb0428ad5b8` has tree
`e306bcc365782edf157b1448f18fe220831bd43c`. Its affected candidate passes53/53
with19 cached in128.838 seconds; Phase11 evidence is updated to that source.

## Exact next actions

1. Commit the corrected evidence/state checkpoint and push the frozen head once.
2. Reply to/resolve discussion3888100550 and require exact-head protected CI.
3. Run its permitted confirmation under the recorded stopping rule.
4. Record release evidence and merge only after exact-head gates pass.

## Evidence boundaries

The real local HTTP tests cover the changed wire/cleanup path through ephemeral
Node servers. Router configuration, PostgreSQL, Redis, broker, media and browser
behavior did not change, so their heavyweight evidence does not repeat unless a
later change crosses that boundary. Protected CI will still execute its required
repository runtime lanes.

## Execution environment

Use native WSL Git and pinned Node24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4` and bounded
deadlines. Never create or use `codex/` branches.

The local Docker daemon remains unavailable and is unnecessary for this
candidate. Do not restart WSL/Docker or repeat host CPU/memory diagnostics.

## Do not do yet

Do not add circuit breakers, public failure injection, game-day tuning or Phase13
GraphQL calibration inside P11-R01. Do not retry unsafe writes, authorization,
rights/publication decisions or unknown transaction outcomes. Do not add Router
or Apollo Client retry, a new service, package or infrastructure dependency.
