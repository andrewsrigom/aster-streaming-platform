# Current State

Last updated: 2026-09-02

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference track P14-R13–R18 is active under ADR-0048. Hosted P14-R01–R12 remains
planned and requires explicit owner authorization for providers, credentials,
paid resources, and public endpoints.

Items69/P14-R14,70/P14-R15, and71–73/P14-R16 are verified. Item74/P14-R17
is the sole `IN_PROGRESS` item on `docs/core-journey-reading-paths`, worktree
`/tmp/aster-core-journey-reading-paths`, from exact PR64 squash main `5be75bd`.

## Verified

- Phases00–13 retain their linked protected and exact-main acceptance evidence.
- Item68/P14-R13 is verified through PR58 squash main `e925504` and exact-main
  run `33495029876`.
- Item69's reviewed tree `f57a2e5` passed protected PR run `33596017500` on
  attempt 3. Every PR60 discussion is resolved. PR60 squash main
  `b3f409b15ce9da2889850b693b033f69fbd312cd` retains that exact tree.
- Exact-main run `33598493566` passed on attempt 2. Attempt 1's unchanged
  Catalog TraceQL diagnostic search timed out and completed clean project-scoped
  cleanup; the failed-only rerun passed Local platform and the aggregate gate.
- Item70 final head `6de5a1d`, tree `448be36`, passed protected workflow
  `33602958653`; all three discussions are resolved. PR61 squash main `3858bcb`
  retains the exact tree, and exact-main workflow `33603027919` passed.
- Item71 final head `c03745d`, tree `07641d9`, passed protected workflow
  `33609186840` on attempt 2; all three discussions are resolved. PR62 squash
  main `34a32c4` retains the exact tree, and exact-main workflow `33612201728`
  passed every applicable job.
- Item72 final head `7d573a6`, tree `18c0931`, passed protected workflow
  `33619298315`; its sole review discussion is resolved and the corrected-head
  confirmation is clean. PR63 squash main `f7b0aad` retains the exact tree, and
  exact-main workflow `33620771727` passed every applicable job.
- Item73 final head `90efa2b`, tree `455857a`, passed protected workflow
  `33625208487`; its sole review discussion is resolved and corrected-head
  confirmation is clean. PR64 squash main `5be75bd` retains the exact tree, and
  exact-main workflow `33626869266` passed every applicable job.

The authoritative Phase14 chronology is in
[`evidence/phase-14/README.md`](../evidence/phase-14/README.md). No hosted
deployment, production capacity, or broader media rights are claimed.

## Current work

Item74 closes only `journey-comments-examples`. The new core-journey guide
connects all eight required journeys to their requirement, representative
source, adverse test, evidence, operations, and a bounded executable check.
Repository entry points link the guide. The two ambiguous Web storage comments
now state the safe-default and non-authoritative persistence rationale; the
other representative comments already state invariants or observer boundaries.

All eight documented examples pass 142 focused tests in total. Documentation
tests pass 37/37 and validation covers 252 documents, 2,955 headings, 1,789
links, four status claims, and eleven capability rows with zero violations. Web
source tests pass 119/119 before and after. Repository-memory tests pass 13/13;
ESLint, Prettier, architecture validation, and the affected-scope candidate
gate pass. The gate completes 16/16 tasks with one cached task in 47.823
seconds. This is documentation and comment alignment only; protected review,
merge, and exact-main verification remain.

## Ordered reference-quality runway

1. item68 — P14-R13 reference-first runway: verified;
2. item69 — P14-R14 capability index: verified;
3. item70 — P14-R15 readability guardrails and inventory: verified;
4. item71 — P14-R16 Catalog and Playback reading slices: verified;
5. item72 — P14-R16 Identity, Engagement, and Discovery reading slices:
   verified;
6. item73 — P14-R16 Router, Web, and tooling reading slices: verified;
7. item74 — P14-R17 rationale comments, executable examples, and reading paths:
   active;
8. item75 — P14-R18 fresh-checkout and Docker reference acceptance.

The exact queue and activation states live in
[`WORK_QUEUE.md`](WORK_QUEUE.md).

## Verified local capabilities

The released local baseline includes:

- guarded sessions and profile ownership;
- rights-aware Catalog ingestion and publication;
- bounded federated GraphQL through Apollo Router;
- public server rendering and accessible HLS playback;
- durable progress, resume, watchlist, and viewing history;
- owner events, idempotent recovery, and explicit Redis degradation;
- search and independent home rails;
- structured telemetry, executable SLI/SLO rules, alerts, dashboards, and
  telemetry-led diagnosis;
- a Docker-only playable demonstration with project-scoped cleanup.

These are local repository claims backed by phase evidence, not hosted or
commercial-catalog claims.

## Not implemented

- P14-R17 is not verified until the eight journey paths, executable examples,
  rationale-comment audit, protected review, and exact-main gate pass.
- P14-R18 fresh-reference acceptance is planned.
- Hosted P14-R01–R12 remains planned and inactive.

## Runtime and recovery

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Never use a branch beginning
with `codex/`.

Item74 changes documentation and, when needed, comment text only. Run the eight
documented bounded checks, documentation/repository-memory checks, formatting,
and the affected-scope gate. Existing PostgreSQL, Redis, broker, media, browser,
and Docker evidence remains applicable because executable behavior is not
changing. Preserve retained data, media, unrelated Docker projects,
credentials, and host processes.

## Current risks

- A reading path can imply behavior or rights that its linked evidence does not
  prove.
- An example can look safe to replay when it is historical or rights-dependent.
- Excess comments can narrate syntax and make the important invariants harder
  to find.
- Reference-track status can be mistaken for hosted release status.

The guardrails require current links, synthetic bounded checks, explicit rights
warnings, rationale-only comments, and no runtime change.

## Next outcome

Complete item74/P14-R17: publish the eight core-journey reading paths, execute
their bounded examples, align the selected rationale comments, pass focused and
affected-scope gates, complete one review and one confirmation, merge, and
verify exact main.
