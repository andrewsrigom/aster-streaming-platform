# Work Item: Align core-journey reading paths and examples

- Status: IN_PROGRESS
- Owner: Repository documentation
- Phase: 14
- Requirement IDs: P14-R17
- Created: 2026-09-02
- Updated: 2026-09-02

## Outcome

A reader can move through eight core Aster journeys from requirement to code,
adverse test, evidence, operations, and a bounded executable check. Source
comments identify rationale or unusual failure behavior without narrating code.

## Current behavior

Item73/P14-R16 is verified through PR64 squash main `5be75bd`, exact tree
`455857a`, and exact-main workflow `33626869266`. The capability index maps
individual capabilities, and capability-specific guides contain commands and
examples, but no compact path connects the eight P14-R17 journeys. Two browser
storage comments state conditions without making the preserved fallback
rationale explicit. Other comments in the representative slices already state
invariants or non-authoritative observer boundaries.

## Proposed behavior

Add one concise core-journey guide. Each journey will name what to notice, link
the requirement, representative source, adverse test, evidence, and operations,
and provide a root-relative command that exercises synthetic local behavior.
Link the guide from the repository entry points and clarify the two ambiguous
browser-storage comments. Do not change executable behavior.

## Boundaries

- Owning context: repository documentation; each linked bounded context retains
  its existing behavior and data ownership
- Affected services/packages: documentation and comment text in `@aster/web`
- Authoritative data: none changed
- Read models/caches: none changed
- Trust boundaries: example commands must not require credentials, external
  media, personal data, or mutable hosted resources; historical rights payloads
  must not be represented as safe replay inputs
- External dependencies: pinned local Node.js/pnpm toolchain and existing tests

## Invariants

- The guide covers exactly public browse, rights-safe publication, playback,
  profile progress, Discovery degradation, GraphQL admission, dependency
  recovery, and telemetry-led diagnosis.
- Each journey links requirement, source, adverse test, evidence, and operations
  rather than duplicating their contracts.
- Executable checks are bounded, synthetic, credential-free, and start at the
  repository root after the frozen install.
- The deliberately unresolved draft remains non-publishable, and historical
  media/publication payloads remain explicitly non-replayable.
- Comments explain why a boundary exists or how failure is contained; they do
  not restate local syntax.
- Product behavior, public contracts, schemas, events, persistence, cache,
  rights, media, telemetry, dependencies, and deployment remain unchanged.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| A linked requirement, source, test, evidence, or operations path drifts | Documentation validation rejects the broken local link | None; repository check only |
| A focused example exposes a regression | The command exits nonzero with the existing test diagnostic | Existing test output only |
| A Catalog example depends on rights or historical state | The guide points to the bounded synthetic test and labels the payload as non-replayable | None |
| Browser storage is unavailable | Playback uses defaults or skips preference persistence without interruption | Existing behavior; no new telemetry |

## Data and contracts

- Schema/migration: none
- GraphQL: none
- Events: none
- Cache: none
- Compatibility: documentation links and comments only; executable behavior is
  unchanged
- Retention/deletion: no data or evidence deletion

## Security and privacy

- Authorization: no change; example tests retain owner checks
- Input limits: no change; examples exercise existing bounded fixtures
- Sensitive data: examples use synthetic values and no credentials, personal
  data, signed URLs, or external media
- Abuse cases: misleading rights replay, stale links, accidental network or
  hosted mutation, and narration-comment churn are explicitly excluded

## Implementation steps

1. Record item73's exact-main verification and activate item74.
2. Run documentation tests and the selected Web source suite before editing.
3. Add the eight journey paths with bounded commands and explicit rights/example
   boundaries.
4. Link the guide from the README, documentation map, capability index, and
   complete file inventory.
5. Clarify only the selected browser-storage comments; retain already useful
   rationale comments.
6. Execute all eight documented checks, documentation/repository-memory/static
   checks, and `pnpm check:changed`.
7. Record evidence and repository memory; publish one candidate for one review
   and one confirmation.

## Tests

- Domain: the existing Catalog, Playback, Engagement, Discovery, Router, and
  runtime adverse tests used by the examples
- Application: selected source tests for all eight journeys
- Integration: no new integration; existing checked-in phase evidence remains
  linked
- Contract: documentation link validation and the capability-index contract
- Browser: Web source tests cover the comment-only player boundary; no browser
  behavior changes
- Performance/failure: no benchmark claim; existing dependency recovery and
  diagnostic-exercise tests remain the bounded examples

## Evidence

- Commands: exact pinned-environment commands and raw output will be retained in
  `evidence/phase-14/p14-r17-core-journey-reading-paths.txt`
- Raw artifact path: `evidence/phase-14/p14-r17-core-journey-reading-paths.txt`
- Acceptance result: all eight documented examples pass 178 focused tests in
  total; Web source tests pass 119/119 before and after; documentation tests
  pass 37/37 and validation covers 252 documents, 2,955 headings, 1,796 links,
  four status claims, and eleven capability rows with zero violations;
  repository-memory tests pass 13/13; ESLint, Prettier, architecture validation,
  and the affected-scope candidate gate pass. The gate completes 16/16 tasks
  with one cached task in 47.823 seconds. Initial exact source `1402157`, tree
  `176c757`, repeats the gate 16/16 with six cached tasks in 37.612 seconds.
  Corrected exact source `a43247b`, tree `561ff0e`, passes 16/16 with twelve
  cached tasks in 1.949 seconds.
  Initial review discussions `3914109519` and `3914109534` identified omitted
  client-disposal and GraphQL execution/limiter/batching/query-count checks. The
  corrected examples and corrected-source gate pass. Evidence head `0e10a85`,
  tree `1bf3362`, passes protected workflow `33631634720`; both discussions are
  resolved. Confirmation review `5089816369` found one evidence-order defect,
  now corrected. Final exact-head protected acceptance remains; another review
  is outside the stopping rule because the correction changes no executable or
  public boundary.
- Iteration gate: `pnpm docs:test`, `pnpm docs:check`, `pnpm ai:check`, the Web
  source suite, and each documented focused example
- Candidate gate: `pnpm check:changed`
- Heavyweight repeat triggers: executable application behavior, public contract,
  rights workflow, adapter, runtime configuration, media, browser interaction,
  telemetry shape, or deployment change
- Review stopping rule: one complete initial review and one confirmation; an
  additional round requires a new blocker in requirements, ownership, security,
  availability, data, or a public contract

## Rollback or recovery

Revert the guide, entry-point links, and comment wording. No schema, data, cache,
media, provider, credential, process, or hosted state needs recovery.

## Documentation updates

- `README.md`
- `docs/00-start-here/CORE_JOURNEY_READING_PATHS.md`
- `docs/00-start-here/CAPABILITY_INDEX.md`
- `docs/00-start-here/DOCUMENTATION_MAP.md`
- `docs/00-start-here/FILE_INDEX.md`
- `docs/quality/CODE_READABILITY.md`
- `evidence/phase-14/README.md`
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and
  `.ai/HANDOFF.md`

## Completion checklist

- [x] Requirements satisfied
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [x] Remaining risks recorded
