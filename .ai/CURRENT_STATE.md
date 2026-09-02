# Current State

Last updated: 2026-09-02

## Active phase

**Phase 14 — Reference Quality, Capacity Validation, and Hosted Release**

Status: **IN_PROGRESS**. Phases00–13 are released. The credential-free
reference track P14-R13–R18 is active under ADR-0048. Hosted P14-R01–R12 remains
planned and requires explicit owner authorization for providers, credentials,
paid resources, and public endpoints.

Items69/P14-R14,70/P14-R15,71–73/P14-R16, and74/P14-R17 are verified. Item75/
P14-R18 is the sole `IN_PROGRESS` item on `docs/reference-acceptance`, worktree
`/tmp/aster-reference-acceptance`, from exact PR65 squash main `2b6054a`.

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
- Item74 final head `903f50e`, tree `3e905e`, passed protected workflow
  `33633680649` on attempt 2 after attempt 1's isolated `docker info` timeout.
  Every discussion is resolved. PR65 squash main `2b6054a` retains the exact
  tree, and exact-main workflow `33636042474` passed every applicable job.

The authoritative Phase14 chronology is in
[`evidence/phase-14/README.md`](../evidence/phase-14/README.md). No hosted
deployment, production capacity, or broader media rights are claimed.

## Current work

Item75 closes only `reference-fresh-acceptance`. It follows the public reader
path from a new exact-main checkout: pinned install, capability navigation,
focused adverse test, evidence and operations lookup, anonymous playable Docker
journey, replay-safe initialization, and exact project-scoped cleanup. The
fresh-clone bootstrap, navigation, 16 focused tests, complete 73-task gate, and
high-severity audit pass. Protected runs `33643437047` and `33644727686` pass,
and initial review discussions `3915333547` and `3915333560` are resolved.
Confirmation review `5091322369` found fail-open cleanup inspection and missing
absent-target/pre-install proof in discussions `3915467273` and `3915467277`.
Corrected head `894fef9` passes protected run `33646820741`; those discussions
are resolved. Blocker-boundary review `5091554514` then found that preflight
inventory failures could be mistaken for an empty namespace and that the exact
README bootstrap omitted tracked Git-hook configuration in discussions
`3915666140` and `3915666152`.

Clone `/tmp/aster-reference-reader-boundary-20260902` is proved absent and
empty, configures `.githooks`, and passes the frozen install, navigation, 16
focused tests, a clean complete 73-task gate in `52.379s`, and the high-severity
audit. The transcript retains one earlier media timing failure, its focused 2/2
pass, and one overlapping Next.js build-lock rejection as non-accepted attempts.

The latest runner rejects endpoint/configuration overrides, accepts only an
inspected local Linux daemon, and pins direct Docker/Compose operations plus
the context verifier's subprocess to context `default`. Before teardown is
armed, every label and physical-prefix inventory must succeed and be empty. A
hostile `DOCKER_HOST` and an unlabeled prefixed fixture are refused; the fixture
is preserved and then removed by its exact synthetic name. Literal project
`aster-reference-pinned-20260902` passes healthy startup, browser playback 1/1
in `10.5s`, replay, checked teardown, independent zero label-and-prefix residue,
and retained-resource comparison. The current runner SHA-256 is `cba64582`.

Head `7a3279a`, tree `1e16cf8`, passes protected run `33653251535`; prior
discussions are resolved. Review `5092157759` found only stale Docker-pending
prose in the change plan (`3916199051`). That text now records the passing
result. No executable or blocking boundary changed, so the review stopping rule
requires no further round or heavyweight repeat. Final text checks pass 9/9
tasks in `36.892s`. Publication, discussion resolution, merge, and exact-main
acceptance remain.

A rejected cleanup attempt expanded a nested-shell project variable to empty
and removed 13 unused volumes from the existing `aster` project. Their Docker
data cannot be recovered without an external backup. The stopped broker
container plus `aster_broker-data` and `aster_identity-event-trust` remain; no
replacement volume was created. The accepted repeat preserved those remaining
resources and used a new literal project name throughout.

## Ordered reference-quality runway

1. item68 — P14-R13 reference-first runway: verified;
2. item69 — P14-R14 capability index: verified;
3. item70 — P14-R15 readability guardrails and inventory: verified;
4. item71 — P14-R16 Catalog and Playback reading slices: verified;
5. item72 — P14-R16 Identity, Engagement, and Discovery reading slices:
   verified;
6. item73 — P14-R16 Router, Web, and tooling reading slices: verified;
7. item74 — P14-R17 rationale comments, executable examples, and reading paths:
   verified;
8. item75 — P14-R18 fresh-checkout and Docker reference acceptance: active.

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

- P14-R18 is not verified until the public reader path passes from a fresh
  checkout with exact project-scoped Docker cleanup and protected release.
- Hosted P14-R01–R12 remains planned and inactive.

## Runtime and recovery

Use WSL Git and the complete Node.js24.19.0 distribution at
`/home/andrews/.local/share/node-v24.19.0-linux-x64/bin`, which includes
Corepack and provisions pnpm11.24.0. Never use a branch beginning with
`codex/`.

Item75 changes verification notes and repository memory only. Run its source
and Docker acceptance from one new temporary clone with a unique explicit
project name. Inspect ownership before scoped cleanup. Preserve retained data,
media, unrelated Docker projects, credentials, images, package caches, and host
processes.

## Current risks

- A fresh-clone proof can accidentally inherit package/build state or Docker
  resources and stop being reproducible.
- Cleanup can target unrelated local data if the project name or ownership is
  not exact.
- The generated sample can be mistaken for licensed third-party content.
- Reference-track status can be mistaken for hosted release status.
- The rejected cleanup incident removed 13 local `aster` volumes. Recreating
  empty names would hide rather than recover their former data.

The guardrails require exact commit/tool versions, synthetic bounded checks,
unique Docker ownership, zero owned residue, explicit media limitations, and no
hosted claim.

## Next outcome

Finish item75/P14-R18: publish the stale-status text correction, resolve
discussion `3916199051`, require final protected CI, merge, and verify exact
main. Do not request another review round or repeat unaffected heavyweight
evidence for this prose-only correction.
