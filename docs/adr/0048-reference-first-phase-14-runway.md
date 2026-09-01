# ADR-0048: Make reference quality the immediate Phase 14 runway

- Status: Accepted
- Date: 2026-09-01
- Owners: Repository architecture and product documentation
- Related requirements: P14-R13, P14-R14, P14-R15, P14-R16, P14-R17, P14-R18
- Supersedes: none
- Superseded by: none

## Context

Phases00–13 leave Aster as a broad, locally reproducible VOD implementation
with behavior, failure and operational evidence. The original Phase14 plan
moves directly to provider selection, representative capacity work and hosted
release. That work requires owner choices, credentials and potentially paid
resources. It is not necessary to validate the current product locally, and it
would make a public endpoint the immediate measure of progress.

The repository is also large enough that correctness alone does not make it a
good reference. A reader needs a reliable path from a capability to its domain
rule, application flow, adapter, public contract, adverse tests, measurements
and recovery guidance. Names, local organization and comments need systematic
review without turning the codebase into a style rewrite or hiding production-
shaped failure behavior.

## Decision

Phase14 has two explicitly separated tracks.

The reference implementation track is active first. P14-R13–R18 require:

- truthful roadmap and release-state navigation;
- a capability index linking requirements to representative code, tests,
  evidence and operations;
- repository-owned readability guardrails and a bounded inventory of concrete
  findings;
- behavior-preserving refactoring in small, owner-scoped vertical slices;
- comments and examples that explain rationale, invariants and failure behavior;
- fresh-checkout and Docker-based local reference acceptance.

The hosted capacity and release track remains P14-R01–R12. It is planned but
inactive until the repository owner explicitly activates provider selection and
authorizes credentials and resource creation. Its security, capacity, backup,
licensing, storage-lifecycle and rollback obligations are not waived or
relabelled as complete.

A verified reference checkpoint means the source can be navigated, reproduced
and verified locally from public documentation and recorded evidence. It does
not mean Aster is deployed, production capacity is known, an on-call service
exists, or media rights extend beyond their recorded sources.

Readability work follows these constraints:

- preserve the five bounded contexts and their data ownership;
- prefer domain vocabulary and explicit failure names over generic helpers;
- extract or rename only where a concrete reading or maintenance problem exists;
- keep comments for rationale, invariants, unusual failure behavior and external
  constraints rather than narrating statements;
- protect every refactor with existing or added characterization tests;
- avoid repository-wide mechanical rewrites and speculative abstractions;
- keep each work item independently reviewable and reversible.

## Consequences

### Positive

- Progress can continue without hosted credentials, paid resources or an
  irreversible provider choice.
- Readers gain a stable path from product behavior to implementation and proof.
- Refactoring is evaluated against behavior and ownership rather than subjective
  style preference.
- The eventual hosted track starts from better documented boundaries and local
  acceptance.

### Negative

- Phase14 can have a verified reference track while the overall hosted track
  remains planned, so status language must always name the track.
- Small behavior-preserving slices take longer than a single bulk cleanup.
- The capability index and reading guides become maintained public contracts.

### Security and privacy

Examples use synthetic identities and reviewed public fixtures. They never add
credentials, personal data, operator shortcuts or broad access. Local trust
modes remain explicitly unsuitable for public hosting. Readability changes
cannot weaken owner authorization, rights checks, input bounds, telemetry
privacy or cleanup rules.

## Alternatives considered

### Deploy first and improve readability afterward

Rejected as the immediate path. A public endpoint would add external cost and
security obligations without resolving how maintainers understand or verify the
system.

### Rename Phase14 hosted requirements

Rejected. P14-R01–R12 already have stable references throughout architecture,
operations and historical evidence. Keeping those identifiers avoids rewriting
history or obscuring deferred obligations.

### Perform one repository-wide cleanup

Rejected. It would create a large review surface, invalidate too much evidence
at once and encourage subjective changes without a demonstrated reader need.

## Validation

P14-R13 is accepted when the roadmap, specification, public status, Phase13
release evidence and repository memory agree and their validators pass. Later
requirements define capability-map coverage, readability inventory, scoped
characterization gates, guide-link validation and fresh local acceptance.

## Rollback

Revert the documentation decision and restore the former Phase14 description.
No runtime, data, schema, event, cache, provider or media state changes in this
decision.
