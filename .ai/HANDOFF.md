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
`.ai/CHANGE_PLAN.md`. PR52 is open. Initial protected run `33350909056` failed
and its complete initial review produced four blockers. Their correction passed
protected run `33352310376`; confirmation then found one CI-classification gap.
That correction passed run `33354040239`; blocker-focused confirmation found
one same-name multi-version Web-test gap. Its correction passed run
`33355546182`; follow-up confirmation found byte-preservation and rollback gaps.
Source `5f4a315` corrected those gaps and protected run `33357231869` passed.
Discussion `3891772219` then found AST source locations still omit ignored bytes
at both wire boundaries.
The explicit-body evidence head `66fcab71` passed protected run `33359022739`,
and that discussion is resolved. Confirmation discussion `3891915868` then
found Router generator-only changes could skip the packaged platform proof.
Source `64fa64e`, tree `35817101`, corrected it. Protected run `33360643657`
attempt2 passed after attempt1's transient TraceQL indexing timeout and the
discussion is resolved. Blocker-focused discussion `3895588146` then found the
runtime verifier could select a retained `Browse` body with current variables.

## Current behavior

- The 25 reviewed operations generate one deterministic Apollo manifest and one
  finite Rhai matcher from the exact link-ready Apollo wire documents; the
  Router image packages both.
- `main.rhai` validates explicit environment/mode configuration and binds every
  operation name to its exact link-ready wire-document SHA-256 before planning.
- Local/integration audit remains explicit. Staging/production require enforce;
  enforce rejects missing, unknown and altered documents with a sanitized error.
- One explicit retained source permits at most two reviewed wire bodies per name
  during Router-first client rollout.
- Trust telemetry exposes only `matched`, `unknown` or `missing`; audit-mode SLI
  diagnostics preserve only finite known operation labels. All 19 actual Web
  `HttpLink` request bodies match the manifest.
- Corrected source `0e4a4b3d5742f2458d082b59bac1efedf1651783`, tree
  `61b325350149c9d5ba07b4ddc3c41cb324526984`, passes Router11/11, Web118/118,
  focused policy36/36 and the affected gate49/49 with35 cached in72.599 seconds.
  Protected run `33352310376` verifies the real pinned-Router proof, all owner
  runtimes and the playable demo. Confirmation discussion `3891493400` found
  that verifier-only changes could skip that lane. Source `b85230d`, tree
  `05532b63`, adds the verifier to the finite platform classifier; classifier
  12/12 and the affected gate49/49 with36 cached in50.442 seconds pass. Protected
  run `33354040239` passes. Discussion `3891588767` then found that Web tests
  retained only one hash per name. Source `effc7fd`, tree `0acdba2a`, indexes
  every version per name; Web119/119 and gate49/49 with35 cached in54.987 pass.
  Protected run `33355546182` passes. Discussions `3891672851`/`3891672854`
  then found retained-body reprinting and unsafe pre-union rollback after client
  exposure. Source `5f4a315`, tree `7c15d925`, preserves retained bytes and
  defines/tests the union Router rollback floor; Router11/11 and gate49/49 with35
  cached in53.095 seconds pass. Protected run `33357231869` passes. Discussion
  `3891772219` then found AST locations omit ignored leading/trailing bytes.
  Source `0bcdd68833c23f1ae61a1c07f5f93ac5d9d989e1`, tree
  `7ad2f2d88d5c2848265f6bbf568ba4168aee3562`, stores each retained wire body as
  one explicit versioned JSON string. Its regression proves leading whitespace,
  a leading comment, trailing newline/whitespace and their exact SHA-256.
  Router11/11 and the final gate49/49 with38 cached in45.499 seconds pass.
  Evidence head `66fcab71` passed protected run `33359022739`, including the
  packaged Router, integrations, diagnostics and playable demo; discussion
  `3891772219` is resolved. Confirmation discussion `3891915868` found
  `apps/router/` did not select platform CI. Source
  `64fa64e7650e422e4b1a4405555521afc95921bd`, tree
  `35817101dd1cb1126b2bddb2a2e9646938f760d0`, routes the complete Router package
  through the platform proof. CI policy38/38 and gate49/49 with36 cached in
  64.294 seconds pass. Run `33360643657` attempt2 passes every required job and
  discussion `3891915868` is resolved. Discussion `3895588146` found selection
  by name could choose the retained version. Source
  `2286c7f71a82011c2eb083cdf52de07dc7301f51`, tree
  `d253a5e8e69abf18c29e8dd432b3c4225958aa73`, joins the persisted entry to the
  unique current schema-manifest hash and fails closed otherwise. Platform92/92
  and gate49/49 with33 cached in98.949 seconds pass.

## Accepted design and implementation

- ADR-0045 records a source-owned Apollo manifest plus Apollo Router Core Rhai
  enforcement; no GraphOS/plan-protected PQL feature is activated.
- `persisted-query-manifest.json` and `trusted-operations.rhai` come from the
  same parsed operations used by composition after the Apollo link transform.
- Admission matches exact operation name plus SHA-256 of the received wire
  query. Name and query are required.
- `ASTER_ENV` and `ASTER_ROUTER_TRUSTED_OPERATIONS_MODE` are explicit.
  `audit` is valid only in local/integration; staging/production require `enforce`.
  Missing/invalid configuration fails Router startup.
- Emit only finite `matched`, `unknown` or `missing` result labels; never emit query, hash or variables.
- Local development stays in explicit audit mode; CI contains one disposable
  enforce-mode real-Router proof.
- Both generated artifacts are packaged; APQ remains disabled.

## Exact next actions

1. Commit the runtime-proof evidence checkpoint and push the correction once.
2. Require exact-head protected CI, including the real two-version-safe proof.
3. Answer and resolve discussion `3895588146`; confirm earlier threads remain
   resolved, then obtain the permitted blocker-focused confirmation.
4. Squash merge, verify exact-main CI, close item64 and activate item65.

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
