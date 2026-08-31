# ADR-0046: Enforce a source-owned GraphQL demand budget

- Status: Accepted
- Date: 2026-08-31
- Owners: Platform and bounded-context owners
- Related requirements: P13-R03, P13-R04, P13-R05, P13-R10
- Supersedes: none
- Superseded by: none

## Context

Aster's hosted operation surface is exact and finite under ADR-0045. Apollo
Router Core already rejects requests above 32 KiB, 2,000 parser tokens,
recursion 32 or 512 recursive selections and bounds execution, concurrency and
subgraph response bytes. Introspection, APQ, client batching, sandbox, homepage
and subgraph error detail are disabled. Owners independently reject excessive
pagination and inputs.

Those controls do not prove that a newly reviewed operation has a safe semantic
shape. A shallow document can repeat aliases or roots; nested lists multiply
work; and equal-looking fields can drive very different PostgreSQL, Redis or
federated owner work. Native Router operation limits and demand control are
GraphOS-plan-integrated features. Current Apollo documentation lists them across
GraphOS plans, including a rate-limited Free tier, but activation still adds an
account/key and hosted control-plane contract that local reproducibility cannot
require. Silently omitting semantic controls is not acceptable either.

Federation v2.9 standardizes `@cost` and `@listSize`. These schema annotations
are useful source contracts independently of whether native Router demand
control is activated later.

## Decision

Upgrade all five subgraph Federation links together to v2.9 and import `@cost`
and `@listSize`. Owners annotate every root resolver and entity contribution
that performs owner work with a finite integer weight. Every list selected by a
trusted operation has an owner-backed `assumedSize`. A direct list may also use
`slicingArguments` when a schema argument safely controls that list. The source
analyzer deliberately requires metadata on the selected list itself instead of
inferring a bound through an arbitrary response wrapper.

The annotation is an estimate, not authorization or a replacement for the owner
runtime maximum. A metadata change and its owner limit change ship together.

Composition analyzes the exact current and retained link-ready bodies used by
trusted admission against the composed public schema. For each operation it
deterministically records:

- type, name and exact SHA-256 ID;
- maximum selection depth;
- alias count, root-field count and expanded selection count;
- maximum list expansion after variable/default resolution;
- recursively weighted static cost.

Fragments are expanded through a bounded acyclic traversal. Conditional
directives do not discount worst-case work. A variable always uses the annotated
owner maximum because a client can override its operation default. A positive
literal slicing value can lower the estimate but never exceed that maximum.
Multiple slicing arguments use the largest value. Numeric work uses safe
integers and fails on overflow. Slicing names must be unique field arguments;
the Federation default requiring exactly one supplied slicing argument is
honored. A cursor-wrapper `sizedFields` contract is rejected until Aster has a
concrete operation that needs and tests it.

The initial policy is source-controlled in the Router package and calibrated
from every current operation with explicit headroom, never generated from live
traffic. It permits at most depth 12, eight aliases, four roots, 256 selections,
512 maximum list expansion and weighted cost 2,048. The analyzer uses the same
2,000-token parser ceiling as Router. Scalar fields retain standard cost zero and
unweighted composite fields cost one. Owner-backed entity work uses weights four
through eight, read roots four through twenty and mutation roots twelve
through twenty-four, with a mutation base of ten. List size multiplies the work
below that list. Composition fails when metadata is absent or contradictory, a
reference is unknown, an operation/profile cardinality differs from the trusted
manifest or any bound is exceeded. The generated versioned demand manifest is
part of the atomic schema artifact set and is checked for staleness.

Hosted enforcement is the conjunction of two build/runtime facts:

1. only exact trusted name/hash pairs are admitted before planning; and
2. every admitted pair was required to pass the source-owned demand analyzer.

Audit mode remains local/integration only. It may execute ad hoc operations but
does not claim semantic hosted protection; network/parser, execution, owner and
concurrency limits still apply there. Phase14 may enable native Router demand
control after account/provider selection and measured equivalence, but it must
not weaken this source contract.

## Consequences

### Positive

- A new client operation cannot enter hosted admission without a reviewed,
  reproducible shape/list/cost profile.
- Standard Federation metadata keeps owner work visible in the schema.
- Local demo and clean CI need no GraphOS credential or network control plane.
- One finite artifact teaches and proves calibration rather than asserting a
  magic complexity number.

### Negative

- The source analyzer must track the used Federation cost/list semantics and is
  not a substitute for Router query-plan-aware actual-cost telemetry.
- Owner weights and sizes require review when resolver work changes.
- Local audit deliberately permits unprofiled documents; it cannot be exposed as
  a hosted production mode.

### Security and privacy

Build failures identify only an operation name, schema coordinate and finite
rule. Generated profiles contain reviewed operation names/hashes and numeric
budgets, never variables, identifiers, user data or live request samples.
Runtime telemetry exposes finite outcome/band vocabulary only; raw cost, query,
hash and variables do not become metric labels or public errors. Owner-side
authorization remains mandatory.

## Alternatives considered

### Activate native Router demand control immediately

Deferred. It is technically relevant and may be enabled in Phase14, but it adds
GraphOS account/key and availability/plan terms to a demo that must reproduce
offline. The source analyzer also supplies deterministic review before runtime.

### Rely only on trusted operations

Rejected. A reviewed hash can still describe a newly added abusive shape unless
review has an executable budget.

### Use only depth

Rejected. Aliases, repeated roots and list multiplication can be expensive while
remaining shallow.

### Hard-code list sizes in the analyzer

Rejected. Owner-backed Federation metadata keeps schema work and runtime bounds
reviewable together and remains compatible with native demand control.

## Validation

Unit fixtures cover fragments, cycles, aliases, repeated roots, variable/default
pagination, nested list multiplication, mutations, missing/conflicting metadata
and overflow. Composition tests require one profile per exact trusted hash and
stale-artifact rejection. Owner schema tests retain their runtime maxima.
Protected CI sends oversized, token-heavy, batched and introspection requests to
the pinned Router, proves sanitized early rejection and then completes the
canonical playable journey.

## Migration and rollback

Publish all five Federation link/metadata changes, analyzer and complete artifact
set atomically. No public field, database, Redis, event or media migration occurs.
Rollback restores the item64 SDLs, Router tooling/image and ten-artifact set.
If a later operation needs more budget, first optimize or document its measured
owner work; raise the narrow bound and profile in one reviewed release.

## Sources

- [Apollo Federation cost and list-size directives](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives#customizing-demand-controls)
- [Apollo Router demand control](https://www.apollographql.com/docs/graphos/routing/security/demand-control)
- [Apollo Router request limits](https://www.apollographql.com/docs/graphos/routing/security/request-limits)
- [Apollo Router query batching](https://www.apollographql.com/docs/graphos/routing/performance/query-batching)
