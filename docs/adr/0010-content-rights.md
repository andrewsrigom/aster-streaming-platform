# ADR-0010: Make Rights Verification a Publication Invariant

- Status: Accepted
- Date: 2026-08-25
- Related requirements: CAT-R01–R07, MED-R01

## Context

A downloadable film can have conditions that vary by work, version, asset, music, trademark, or license. Treating licensing as a README note allows invalid publication and missing attribution.

## Decision

Catalog owns a structured rights record and state. A title cannot enter rights-reviewed or published states without an approved record containing exact source, license, attribution, modification permissions, evidence, and review metadata.

Media processing requires an approved record. Publication rechecks current rights state. Dispute or expiry retires the title.

Creative Commons assets are not wrapped in incompatible technical restrictions.

## Consequences

### Positive

- Rights become enforceable product data.
- Attribution can be generated consistently.
- Takedown and dispute handling are explicit.
- Processing work is not spent on unapproved sources.

### Negative

- Every title requires manual evidence review.
- License differences complicate a uniform catalog.
- Rights state becomes part of operational availability.

## Alternatives considered

### Blanket approval of a source site

Rejected because individual works and assets can differ.

### Documentation-only attribution

Rejected because it cannot enforce publication behavior or generate title-specific UI.

## Revisit triggers

No relaxation is planned. New license families require policy review and potentially new rights fields.
