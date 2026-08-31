# Handoff

## Resume point

Phases00–12 are released. P12-R10 final source
`b646e496d0946262a688f34a118a896f6c40ebda`, tree
`789007d5f48d4a16c0a1b47b8e2554e1ee0e294a`, passed protected run
`33346575787` attempt 2 and clean confirmation. PR51 squash main
`2b77a32f43a87fcdfc5032faf856f369de183998` retained the tree; exact-main run
`33348247619` passed every required job.

Item64 (P13-R01/R02/R12) is the sole `IN_PROGRESS` item on
`feat/p13-trusted-operations`, based exactly on that main. Its active plan is
`.ai/CHANGE_PLAN.md`.

## Current behavior

- The 25 reviewed operations generate one deterministic Apollo manifest and one
  finite Rhai matcher; the Router image packages both.
- `main.rhai` validates explicit environment/mode configuration and binds every
  operation name to its exact raw-document SHA-256 before planning.
- Local/integration audit remains explicit. Staging/production require enforce;
  enforce rejects missing, unknown and altered documents with a sanitized error.
- Telemetry exposes only `matched`, `unknown` or `missing`; Web's 19 documents
  exactly match the generated manifest.
- Focused tests and the affected candidate gate pass 49/49 tasks, 35 cached, in
  52.315 seconds. The real pinned-Router proof is intentionally pending CI.

## Accepted design and implementation

- ADR-0045 records a source-owned Apollo manifest plus Apollo Router Core Rhai
  enforcement; no GraphOS/plan-protected PQL feature is activated.
- `persisted-query-manifest.json` and `trusted-operations.rhai` come from the
  same parsed operations used by composition.
- Admission matches exact operation name plus SHA-256 of the received raw query.
  Name and query are required.
- `ASTER_ENV` and `ASTER_ROUTER_TRUSTED_OPERATIONS_MODE` are explicit.
  `audit` is valid only in local/integration; staging/production require `enforce`.
  Missing/invalid configuration fails Router startup.
- Emit only finite `matched`, `unknown` or `missing` result labels; never emit query, hash or variables.
- Local development stays in explicit audit mode; CI contains one disposable
  enforce-mode real-Router proof.
- Both generated artifacts are packaged; APQ remains disabled.

## Exact next actions

1. Commit the coherent implementation candidate and record its exact source/tree.
2. Publish once and open one PR for item64.
3. Require protected CI to load the generated module in Apollo Router 2.17.0,
   prove canonical/altered/unknown/missing behavior, all three metric labels,
   the playable demo and exact cleanup.
4. Complete the initial blocker review and one confirmation review; remediate
   only a requirement, security/privacy, availability or public-contract blocker.
5. Squash merge, verify exact-main CI, close item64 and activate item65.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Runtime boundary

The local Docker daemon was unavailable at the last bounded host check. Do not
restart WSL/Docker or loop on host diagnostics. Focused source gates can run
locally; protected CI owns the first required real Router/container proof if the
daemon remains unavailable. Preserve retained media, databases and unrelated
projects.

## Do not do yet

Do not implement the later shape/cost/rate/N+1/authorization slices concurrently.
Do not add GraphOS credentials, a paid plan, APQ registration, a new proxy/service,
hosted resources or client IDs presented as authorization. Phase14 owns hosted
provider and deployment decisions.
