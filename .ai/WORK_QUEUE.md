# Work Queue

Only one item may be `IN_PROGRESS`. One coherent predecessor may be
`WAITING_EXTERNAL` only under the repository operating contract.

## Released baseline

Items1–67 and Phases00–13 are `DONE`. Their detailed progression remains in
Git history, `.ai/SESSION_LOG.md`, the phase specifications and
`evidence/phase-00/` through `evidence/phase-13/`.

The latest release is Phase13:

- final result checkpoint `db17bca`, tree `41650b4`;
- protected run `33486901296` and clean final review;
- PR57 squash main `83cb510` with the same tree;
- exact-main run `33489232182`;
- authoritative record: `evidence/phase-13/release.md`.

## Active and ready work

| Order | Work item | Requirement | Status |
|---:|---|---|---|
| 1 | Select and record the source-code license | P00-R01 | DONE |
| 2 | Reconcile Phase00 traceability and public-repository workflow | P00-R08 | DONE |
| 3 | Define the engineering demonstration and repository governance | P00-R11 | DONE |
| 4 | Select and pin Node.js and pnpm | P00-R03 | DONE |
| 5 | Initialize Git policy, workspace and deterministic ignores | P00-R02 | DONE |
| 6 | Add source-quality and commit checks | P00-R04 | DONE |
| 7 | Validate links, terminology and status claims | P00-R05 | DONE |
| 8 | Add CI, security and dependency review | P00-R06 | DONE |
| 9 | Add contribution governance and templates | P00-R07 | DONE |
| 10 | Create and protect the public repository | P00-R07 | DONE |
| 11 | Integrate repository-memory checks | P00-R08 | DONE |
| 12 | Document bootstrap, check, demo and cleanup commands | P00-R09 | DONE |
| 13 | Verify a clean checkout and close Phase00 | P00-R10 | DONE |
| 14 | Select local platform versions and resource bounds | P01-R01 | DONE |
| 15 | Add project-scoped destructive local reset | P01-R02 | DONE |
| 16 | Validate startup configuration and secret classes | P01-R03 | DONE |
| 17 | Implement redacted structured logging and trace correlation | P01-R04 | DONE |
| 18 | Select the HTTP adapter and transport boundary | P01-R11 | DONE |
| 19 | Calibrate risk-proportionate affected-scope verification | P00-R06 | DONE |
| 20 | Implement lifecycle, health and graceful shutdown | P01-R05 | DONE |
| 21 | Define telemetry and runtime metrics | P01-R06 | DONE |
| 22 | Implement narrow dependency adapters | P01-R07 | DONE |
| 23 | Compose readiness, deadlines and the Identity skeleton | P01-R08 | DONE |
| 24 | Prove the runtime against real local dependencies | P01-R09 | DONE |
| 25 | Publish local profiles and close Phase01 | P01-R10 | DONE |
| 26 | Select identity/session trust and local assertion | P02-R01 | DONE |
| 27 | Resolve accounts and durable revocable sessions | P02-R02 | DONE |
| 28 | Implement owned profiles, deletion and outbox | P02-R03 | DONE |
| 29 | Expose Identity GraphQL and authorization/concurrency proof | P02-R09 | DONE |
| 30 | Model rights review, attribution and publication lifecycle | P03-R01 | DONE |
| 31 | Persist rights revisions and review provenance | P03-R02 | DONE |
| 32 | Implement operator publication and retirement transactions | P03-R06 | DONE |
| 33 | Implement published browse/detail and Catalog GraphQL | P03-R05 | DONE |
| 34 | Verify HLS publication and the Catalog runtime | P03-R04 | DONE |
| 35 | Compose Identity/Catalog schemas and known operations | P04-R01 | DONE |
| 36 | Run Router with private subgraphs and partial-failure proof | P04-R02 | DONE |
| 37 | Implement public SSR, hydration and accessible Web shell | P05-R01 | DONE |
| 38 | Approve a source and deliver the media pipeline | P06-R01 | DONE |
| 39 | Create owner-validated playback sessions | P07-R01 | DONE |
| 40 | Deliver the accessible HLS player and playable demo | P07-R04 | DONE |
| 41 | Record monotonic owned playback progress | P08-R01 | DONE |
| 42 | Read owned history and continue-watching pages | P08-R06 | DONE |
| 43 | Add idempotent owned watchlist | P08-R07 | DONE |
| 44 | Batch federated engagement fields per request | P08-R08 | DONE |
| 45 | Relay outboxes and verify consumer recovery | P08-R09 | DONE |
| 46 | Integrate player reports/resume and close Phase08 | P08-R11 | DONE |
| 47 | Build the Discovery projection and search | P09-R01 | DONE |
| 48 | Compose home rails, fallbacks and telemetry | P09-R03 | DONE |
| 49 | Integrate public/private Web discovery and close Phase09 | P09-R10 | DONE |
| 50 | Implement rights-safe Catalog caching | P10-R01 | DONE |
| 51 | Implement bounded Discovery stale-while-revalidate | P10-R04 | DONE |
| 52 | Add operation limiters and close Phase10 | P10-R08 | DONE |
| 53 | Register dependency policies and bounded safe retries | P11-R01 | DONE |
| 54 | Add operation-scoped circuit breakers | P11-R05 | DONE |
| 55 | Add a private controlled failure laboratory | P11-R08 | DONE |
| 56 | Run failure game days and close Phase11 | P11-R10 | DONE |
| 57 | Standardize telemetry context and privacy | P12-R01 | DONE |
| 58 | Export golden signals and product outcomes | P12-R03 | DONE |
| 59 | Complete bounded browser playback telemetry | P12-R11 | DONE |
| 60 | Define executable SLIs, SLOs and budgets | P12-R05 | DONE |
| 61 | Provision the local operational overview | P12-R12 | DONE |
| 62 | Implement multi-window burn-rate alerts | P12-R07 | DONE |
| 63 | Diagnose three failures and close Phase12 | P12-R10 | DONE |
| 64 | Generate trusted operations and safe schema delivery | P13-R01 | DONE |
| 65 | Enforce GraphQL demand controls | P13-R03 | DONE |
| 66 | Enforce execution, rate and cache controls | P13-R06 | DONE |
| 67 | Prove query counts and owner authorization; close Phase13 | P13-R07 | DONE |
| 68 | Record Phase13 release and establish the reference-first Phase14 runway | P14-R13 | DONE |
| 69 | Publish the capability-to-code/test/evidence/operations index | P14-R14 | DONE |
| 70 | Define readability guardrails and a bounded prioritized findings inventory | P14-R15 | DONE |
| 71 | Refactor representative Catalog and Playback reading slices | P14-R16 | DONE |
| 72 | Refactor representative Identity, Engagement and Discovery reading slices | P14-R16 | DONE |
| 73 | Refactor representative Router, Web and repository-tooling reading slices | P14-R16 | DONE |
| 74 | Align rationale comments, executable examples and core-journey reading paths | P14-R17 | DONE |
| 75 | Run fresh-checkout/Docker acceptance and verify the reference track | P14-R18 | IN_PROGRESS |

## Item68 — verified

### Outcome

Make the current direction unambiguous without changing executable behavior:
Phase13 is released; local reference quality is the immediate Phase14 track;
hosted capacity/release remains planned and separately activated.

### Acceptance

- ADR-0048, Phase14 requirements, public roadmap and repository memory agree.
- The exact Phase13 review, merge and exact-main evidence is linked.
- No text claims hosted availability, hosted capacity or broader media rights.
- Repository-memory, documentation, formatting and changed-scope gates pass.
- Protected review, merge and exact-main acceptance complete.

## Item69 — verified

### Outcome

Create one maintained capability index that lets a reader move from product
behavior to its requirement, owning context, representative implementation,
focused adverse test, evidence and operational guidance.

### Coverage

- Identity and Profiles
- Catalog
- Playback
- Engagement
- Discovery
- Apollo Router and GraphQL controls
- Web and accessibility
- media processing and delivery
- resilience and degraded modes
- observability and diagnosis
- repository verification and local Docker workflows

### Acceptance

- Each entry identifies one authoritative owner and concrete paths.
- Links resolve and status labels distinguish planned, implemented, verified
  and released behavior.
- The index is useful without duplicating full specifications or evidence.
- A repository check prevents indexed paths from silently disappearing.

PR60 merged as exact-main commit `b3f409b` with the reviewed tree. Protected
pull-request acceptance passed and every discussion is resolved. Exact-main run
`33598493566` passed on attempt 2 after attempt 1 hit the known TraceQL
diagnostic-search timeout and completed scoped cleanup.

## Item70 — verified

### Outcome

Define repository-owned readability rules and inventory concrete problems
before changing implementation code.

### Acceptance

- Findings name the reader problem, owning context, affected behavior and proof.
- Priorities favor misleading names, obscured invariants and difficult control
  flow over cosmetic preference.
- Rules reject narration comments, speculative abstractions and bulk rewrites.
- The inventory selects bounded slices for items71–74.

PR61 final head `6de5a1d`, tree `448be36`, passed protected workflow
`33602958653` after one initial review, one confirmation, and three resolved
repository-memory findings. PR61 squash main `3858bcb` retains the exact tree;
exact-main workflow `33603027919` passed.

## Item71 — verified

### Outcome

Make the Catalog operator-command flow and Playback session failure boundary
readable through explicit domain names and visible phases while preserving all
public behavior.

### Acceptance

- Private names state command decisions, lifecycle conversion, durable-write
  phases, dependency settlement, and uncertain-write boundaries.
- Catalog rights, audit, replay, capacity, event, receipt, transaction, and
  publication behavior remains unchanged.
- Playback owner lookup, deadline, cancellation, no-retry, expiry, and result
  behavior remains unchanged.
- Linked characterization tests and the affected-scope candidate gate pass.
- No public contract, schema, event, persistence, cache, media, telemetry, or
  deployment change is introduced.

PR62 final head `c03745d`, tree `07641d9`, passed protected workflow
`33609186840` on attempt 2 with every review discussion resolved. PR62 squash
main `34a32c4` retains the exact tree, and exact-main workflow `33612201728`
passed every applicable job.

## Item72 — verified

### Outcome

Make the Identity profile transaction, Engagement progress write, and Discovery
home-rail assembly readable through explicit domain names and visible phases
while preserving all public behavior.

### Acceptance

- Private names expose Identity credential/session/owner/mutation phases,
  Engagement owner/replay/playback/write phases, and Discovery independent rail
  selection/fallback/result phases.
- Authorization, expiry, replay, capacity, versioning, atomic outbox,
  cancellation, uncertain-commit, fallback, partial-status, and telemetry
  behavior remains unchanged.
- Linked characterization tests and the affected-scope candidate gate pass.
- No public contract, schema, event, persistence, cache, media, telemetry, or
  deployment change is introduced.

PR63 final head `7d573a6`, tree `18c0931`, passed protected workflow
`33619298315`; its sole review discussion is resolved and corrected-head
confirmation is clean. PR63 squash main `f7b0aad` retains the exact tree, and
exact-main workflow `33620771727` passed every applicable job.

## Item73 — verified

### Outcome

Make Router demand analysis, the Web player session flow, and the repository
quality-gate lifecycle readable through explicit domain and process-ownership
names and visible phases while preserving all public behavior.

### Acceptance

- Private names expose demand-policy validation, list expansion, bounded metric
  accounting and recursive selection cost.
- Web names expose playback-control ownership, session-request state, GraphQL
  result translation, telemetry, recovery, and stale-player prevention.
- Tooling names expose child-process ownership, one-time settlement, timeout,
  graceful signal propagation, and forced termination.
- Linked characterization tests and the affected-scope candidate gate pass.
- No public contract, schema, event, persistence, cache, media, telemetry, or
  deployment change is introduced.

PR64 final head `90efa2b`, tree `455857a`, passed protected workflow
`33625208487`; its sole review discussion is resolved and corrected-head
confirmation is clean. PR64 squash main `5be75bd` retains the exact tree, and
exact-main workflow `33626869266` passed every applicable job.

## Item74 — verified

### Outcome

Give a reader one compact route through the eight core journeys and one bounded
executable check for each while keeping source comments rare and rationale-led.

### Acceptance

- Public browse, rights-safe publication, playback, profile progress, Discovery
  degradation, GraphQL admission, dependency recovery, and telemetry-led
  diagnosis each link requirement, representative source, adverse test,
  evidence, and operations.
- Every documented example is credential-free, bounded, synthetic, and run
  successfully from the repository root.
- Rights-dependent or historical Catalog examples are explicitly distinguished
  from safe checks and are not presented as replayable publication commands.
- Representative source comments explain rationale, invariants, unusual failure
  behavior, or external constraints instead of narrating syntax.
- Documentation, focused source, repository-memory, formatting, and
  affected-scope gates pass without a runtime or public-contract change.

The eight executable examples pass 178 focused tests in total. Web source
tests pass 119/119 before and after comment alignment. Documentation validation
covers 252 documents and 1,796 links with zero violations; documentation and
repository-memory tests pass 37/37 and 13/13. The affected-scope candidate gate
passes 16/16 tasks with one cached task in 47.823 seconds. Initial exact source
`1402157`, tree `176c757`, repeats the gate 16/16 with six cached tasks in
37.612 seconds. Corrected exact source `a43247b`, tree `561ff0e`, passes 16/16
with twelve cached tasks in 1.949 seconds. Protected review, merge, and
exact-main verification remain.

Initial review discussions `3914109519` and `3914109534` found two proof-path
gaps. Playback now runs its client-disposal source test, and GraphQL admission
now links and executes runtime policy, identity-aware limiting, request-scoped
batching, and query-count proofs. The corrected-source gate passes; protected
workflow `33631634720` passes on evidence head `0e10a85`, tree `1bf3362`, and
both discussions are resolved. Confirmation review `5089816369` found only a
non-chronological raw transcript. The transcript is reordered without changing
an executable or public boundary. Final head `903f50e`, tree `3e905e`, passed
protected workflow `33633680649` on attempt 2 after attempt 1's isolated
`docker info` timeout. Every discussion is resolved. PR65 squash main `2b6054a`
retains the exact tree, and exact-main workflow `33636042474` passed every
applicable job. The recorded review stopping rule is met.

## Items72–74 — scoped implementation work

Each item starts only after its predecessor releases. Every slice:

- names its requirement and owner;
- states the concrete reading problem;
- preserves public contracts, ownership, authorization and failure behavior;
- adds or cites characterization tests before refactoring;
- runs focused checks during iteration and the affected-scope candidate gate;
- updates the capability index and reading guidance with the same change.

## Item75 — active reference-track verification

From a fresh checkout, prove installation, capability navigation, a focused
test, the documented Docker reference journey, evidence lookup and exact
project-scoped cleanup. Verification notes must state verified local
capabilities, known limitations and all deferred hosted work.

Exact-main clone `2b6054a` passes the public bootstrap, proof navigation, 16
focused Playback checks, the complete 73-task gate, and high-severity audit.
Accepted project `aster-reference-final-20260902` passes healthy Docker startup,
the real browser journey 1/1 in `5.0s`, replay-safe seed/generated-media reuse,
exact cleanup, and zero owned residue. A rejected nested-shell cleanup removed
13 unused existing `aster` volumes; the loss and retained broker resources are
recorded, and empty replacements are forbidden. Local acceptance passes;
protected review, merge, and exact-main acceptance remain.

## Deferred hosted queue

Phase14 P14-R01–R12 is `PLANNED`, not `READY`. It can enter this queue only
after explicit owner authorization resolves provider selection, credentials and
resource creation. It includes hosted architecture, CI/CD, edge and origin
controls, representative load/spike/soak evidence, storage lifecycle,
backup/restore, rollback, security acceptance and operational readiness.

Local Docker proof does not satisfy those requirements.

## Execution boundaries

- Never create paid resources, credentials, public endpoints or hosted
  environments without owner authorization.
- Never assert unproven media rights.
- Preserve the five bounded contexts and authoritative data ownership.
- Use small reversible changes; do not combine two ambiguous work items.
- Repeat heavyweight evidence only when a later executable change can
  invalidate it.
