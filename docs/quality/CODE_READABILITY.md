# Code Readability

## Purpose

Aster is a reference implementation as well as an executable system. A reader
must be able to follow a capability from domain decision to failure behavior
without first decoding generic names, compressed control flow, or historical
comments.

These rules guide behavior-preserving work. They do not authorize architecture
changes, new abstractions, or repository-wide style rewrites.

## Executable baseline

The existing quality gate already enforces mechanical consistency:

- Prettier owns indentation, wrapping, and ordinary whitespace.
- ESLint and strict TypeScript reject unsafe or ambiguous constructs covered by
  their configured rules.
- Knip rejects unused exports and dependencies.
- Focused and affected-scope tests protect observable behavior.
- Architecture checks protect bounded-context and dependency direction.

Passing those checks is necessary, but it does not prove that names and control
flow explain the domain. The remaining rules are reviewable requirements.

## Review guardrails

### Name the domain decision

- Prefer a verb that states the decision or effect: `authorizeProfile`,
  `recordProgress`, `applyPublicationTransition`.
- Add the domain noun when a generic name such as `run`, `execute`, `process`,
  `result`, `value`, `current`, or `handle` would make the reader inspect the
  body to learn its role.
- Name booleans as facts or phase markers, especially when they affect retry or
  indeterminate-outcome behavior.
- Keep public contract names stable unless the contract itself is the approved
  subject of the work item.

### Expose control-flow phases

- Keep validation, authorization, dependency reads, durable writes, and result
  translation visually distinct.
- Extract a helper when it names a real domain step or removes the need to track
  unrelated states at once. Do not extract one-line wrappers only to shorten a
  function.
- Prefer explicit branches over nested conditional expressions when mapping
  failure or lifecycle states.
- Keep network work outside locked transactions and preserve the existing
  cancellation, deadline, idempotency, and uncertain-commit boundaries.

### Use layout to support reading

- Let Prettier decide mechanical formatting.
- Use one blank line between conceptual phases; do not separate every statement
  or combine unrelated phases into one visual block.
- Keep imports and adjacent type declarations grouped by ownership and purpose.
- Do not create formatting-only diffs outside the selected slice.

### Write rationale comments

Comments explain an invariant, ordering constraint, failure boundary, external
limitation, or removal condition. They do not narrate assignments, repeat a
function name, preserve review history, or compensate for a vague name.

### Make tests and examples readable

- Test names state actor, condition, and observable outcome.
- Fixtures and variables use their role when more than one actor, request,
  state, or result is present. Single-letter aliases are acceptable only for a
  tiny, unambiguous local scope.
- Examples use current domain vocabulary, synthetic data, bounded commands, and
  the same authorization and cancellation assumptions as production code.

### Keep refactors bounded

- Start from one concrete reader problem and one owning context.
- Cite characterization tests before changing names or structure.
- Preserve GraphQL, event, persistence, cache, media, authorization, telemetry,
  and failure contracts.
- Do not introduce a shared abstraction until at least two concrete use cases
  need the same policy and ownership is clear.
- Reject arbitrary readability scores, file-length limits, and bulk rewrites.

## Priority

- **P0:** a name or flow can hide a security, rights, ownership, retry,
  cancellation, or durable-write boundary.
- **P1:** the code is correct, but a reader must reconstruct multiple domain
  phases or translate generic vocabulary.
- **P2:** local test, comment, example, or layout friction that does not obscure
  a runtime invariant.

Priority is based on the reader problem, not line count or personal style.

## Bounded findings inventory

The source links are stable entry points. The selected item may touch adjacent
private helpers and tests only when needed to complete the same reading slice.

| ID | Priority | Owner | Reader problem | Behavior to preserve | Source and characterization proof | Planned item |
|---|---|---|---|---|---|---|
| catalog-command-flow | P0 | Catalog | Verified in item71: the former combined `planChange`, generic nested `execute`, and ambiguous lifecycle predicates are replaced by named draft, rights-withdrawal, rights-review, publication-decision, transaction, takedown, and activation phases. | [P03-R04](../specs/phase-03-catalog-rights.md#p03-r04), [P03-R06](../specs/phase-03-catalog-rights.md#p03-r06), and [P03-R10](../specs/phase-03-catalog-rights.md#p03-r10), including rights gates, audit, replay, reserved takedown capacity, and outbox ordering. | [Catalog command flow](../../services/catalog/src/application/commands.ts); [workflow characterization](../../services/catalog/test/catalog-workflow.test.ts) | 71 |
| playback-session-outcome | P0 | Playback | Verified in item71: `awaitDependencyOrAbort` names late dependency settlement, `sessionWriteStarted` names the indeterminate-write boundary, and explicit branches translate failure after the Catalog lookup and session write. | [P07-R01](../specs/phase-07-playback.md#p07-r01) and [P07-R10](../specs/phase-07-playback.md#p07-r10), including owner timeout, cancellation, no retry after write start, and expiry after acknowledgement. | [Playback session creation](../../services/playback/src/application/create-session.ts); [session characterization](../../services/playback/test/create-session.test.ts) | 71 |
| identity-profile-transaction | P0 | Identity and Profiles | Verified in item72: `runAuthorizedProfileTransaction`, `findOwnedProfile`, and `applyProfileMutation` expose credential/session validation, owner checks, replay, capacity, versioning, audit, outbox, and receipt phases. | [P02-R03](../specs/phase-02-identity-profiles.md#p02-r03), [P02-R05](../specs/phase-02-identity-profiles.md#p02-r05), and [P02-R10](../specs/phase-02-identity-profiles.md#p02-r10), especially wrong-account rejection, expiry, idempotency, and concurrent limits. | [Profile application flow](../../services/identity/src/application/profiles.ts); [profile characterization](../../services/identity/test/profiles.test.ts) | 72 |
| engagement-progress-write | P0 | Engagement | Verified in item72: dependency-snapshot, late-settlement, receipt-replay, admission, playback-context, and `progressWriteStarted` names expose the uncertain-commit boundary and durable phases. | [P08-R01](../specs/phase-08-engagement.md#p08-r01), [P08-R03](../specs/phase-08-engagement.md#p08-r03), [P08-R04](../specs/phase-08-engagement.md#p08-r04), and [P08-R09](../specs/phase-08-engagement.md#p08-r09), including stale ordering, duplicate replay, atomic outbox, and ambiguous commit. | [Progress recording](../../services/engagement/src/application/record-progress.ts); [progress characterization](../../services/engagement/test/record-progress.test.ts) | 72 |
| discovery-home-assembly | P1 | Discovery | Verified in item72: named fixed/genre selection, rail assembly, recent-content fallback, per-rail observation, and aggregate-result phases replace generic helpers and numeric selection indexes. | [P09-R03](../specs/phase-09-discovery.md#p09-r03), [P09-R05](../specs/phase-09-discovery.md#p09-r05), [P09-R08](../specs/phase-09-discovery.md#p09-r08), and [P09-R09](../specs/phase-09-discovery.md#p09-r09), including independent failure, safe fallback, partial status, and bounded telemetry. | [Home-rail assembly](../../services/discovery/src/application/home-rails.ts); [rail characterization](../../services/discovery/test/home-rails.test.ts) | 72 |
| router-demand-analysis | P0 | Router | Implemented in item73: demand rejection, policy validation, list detection, bounded metric accounting, recursive selection cost, and intermediate expansion/cost names expose each admission phase. Verification is pending. | [P13-R03](../specs/phase-13-graphql-performance-security.md#p13-r03), [P13-R04](../specs/phase-13-graphql-performance-security.md#p13-r04), and [P13-R05](../specs/phase-13-graphql-performance-security.md#p13-r05), including parser, depth, alias, list-expansion, and cost rejection. | [Demand analysis](../../apps/router/src/demand.ts); [demand characterization](../../apps/router/test/demand.test.ts) | 73 |
| web-player-session-flow | P1 | Web | Implemented in item73: `PlaybackControls`, `PlaybackSessionFlow`, `requestPlaybackSession`, and explicit session-failure/action-label phases name player ownership, one-request admission, telemetry, and recovery. Verification is pending. | [P07-R05](../specs/phase-07-playback.md#p07-r05), [P07-R07](../specs/phase-07-playback.md#p07-r07), and [P07-R10](../specs/phase-07-playback.md#p07-r10), including accessible controls, failure recovery, navigation cancellation, and no stale player. | [Web player](../../apps/web/features/playback/player.tsx); [browser playback characterization](../../apps/web/test/browser/playback.spec.ts) | 73 |
| quality-gate-lifecycle | P1 | Repository governance | Implemented in item73: spawn, one-time settlement, hard-timeout, graceful-request, forced-termination, and forced-exit timers have process-owned names. Verification is pending. | [P00-R06](../specs/phase-00-foundation.md#p00-r06), including exact task selection, bounded timeout, signal propagation, process-tree cleanup, and sanitized failure. | [Quality-gate runner](../../tools/run-quality-gate.ts); [runner characterization](../../tools/run-quality-gate.test.ts) | 73 |
| journey-comments-examples | P2 | Repository documentation | Rationale comments and executable examples exist near individual capabilities, but there is no compact reading path that connects the core journeys and explains which comments carry invariants rather than narration. | [P14-R17](../specs/phase-14-capacity-release.md#p14-r17), without new product claims, credentials, personal data, or invented media rights. | [Capability index](../00-start-here/CAPABILITY_INDEX.md); [documentation map](../00-start-here/DOCUMENTATION_MAP.md); [Catalog examples](../../services/catalog/examples) | 74 |

## Selected sequence

1. Item 71: Catalog command flow and Playback session outcome.
2. Item 72: Identity profile transaction, Engagement progress write, and
   Discovery home assembly.
3. Item 73: Router demand analysis, Web player session flow, and quality-gate
   lifecycle.
4. Item 74: rationale comments, executable examples, and core-journey reading
   paths after the representative source names are stable.

Each item closes only its listed findings. A newly noticed issue enters a later
bounded inventory update unless it blocks the active slice's requirement,
security, ownership, availability, or public contract.

## Verification and maintenance

For each refactoring slice:

1. run the linked characterization test before editing;
2. change names and structure without changing observable contracts;
3. run the cheapest focused checks while editing;
4. run the affected-scope candidate gate once the slice is coherent;
5. update this inventory and the capability index when the reading entry point
   changes.

Heavy Docker, browser, media, PostgreSQL, Redis, or broker evidence is repeated
only when the executable change can affect what that evidence measured.
