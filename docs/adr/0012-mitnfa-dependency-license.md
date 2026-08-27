# ADR-0012: Recognize MITNFA in Dependency License Review

- Status: Accepted
- Date: 2026-08-26
- Owners: Aster repository governance and shared dependency infrastructure
- Related requirements: P00-R06, P01-R07
- Supersedes: None
- Superseded by: None

## Context

P01-R07 exact-pins the AWS S3 client behind `@aster/object-storage-s3`. Its resolved runtime graph includes `bowser@2.14.1` through `@aws-sdk/core@3.977.9`. The package manifest declares MIT, while the complete distributed license text contains the no-false-attribution condition identified by SPDX as `MITNFA`. GitHub's dependency graph therefore classifies the package as `MIT AND MITNFA`.

Protected pull-request run `33023269145` passed source quality, the high-severity vulnerability audit, documentation, repository memory, security, and classification. Dependency review correctly blocked because the existing reviewed allowlist contained `MIT` but not `MITNFA`. The low OpenSSF Scorecard annotations are informational and are not the cause of the failure.

SPDX publishes `MITNFA` as the “MIT +no-false-attribs license.” It retains the MIT permission grant and notice requirement and adds a condition for distributions modified outside documented configuration mechanisms: materially altered functionality must not leave the original author's bug-reporting contacts as if the original author remained responsible. Aster consumes the package unmodified as a transitive dependency and does not relicense it.

The pinned dependency-review action validates compound dependency expressions against simple allowed SPDX identifiers. For `MIT AND MITNFA`, both `MIT` and `MITNFA` must therefore appear in the allowlist; adding the compound expression itself would be ignored by the pinned action.

Authoritative references:

- [SPDX MITNFA identifier and text](https://spdx.org/licenses/MITNFA.html)
- [Bowser v2.14.1 license](https://github.com/bowser-js/bowser/blob/v2.14.1/LICENSE)
- [GitHub dependency-review configuration](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action)
- [Pinned action license-expression evaluation](https://github.com/actions/dependency-review-action/blob/a1d282b36b6f3519aa1f3fc636f609c47dddb294/src/licenses.ts)

This record documents repository policy and engineering interpretation; it is not legal advice.

## Decision

Add only the SPDX identifier `MITNFA` to the dependency-review allowlist. Continue to require every license in a compound `AND` expression to be individually allowed. Keep vulnerability checks, all dependency scopes, the immutable action pin, and every existing license restriction unchanged.

Treat third-party MITNFA code as separately licensed material. Preserve its copyright and license notice in distributions. Do not modify Bowser in place. If Aster later patches, forks, bundles, or materially alters it, repeat the license review and ensure redistributed bug-reporting contacts cannot falsely attribute responsibility to the original author.

## Rationale

The identified condition is narrow, explicit, and compatible with the current unmodified transitive use. Recognizing its SPDX identifier is more transparent than exempting Bowser from license checks, and it avoids replacing an already bounded S3 adapter solely to bypass a reviewed third-party notice.

The allowlist remains fail-closed for every unreviewed identifier. A future dependency using MITNFA still remains subject to vulnerability, maintenance, runtime, removal, and exact graph review; license membership alone never selects a package.

## Consequences

### Positive

- Hosted review can evaluate the complete `MIT AND MITNFA` expression without suppressing Bowser.
- The repository records the additional redistribution condition instead of treating the manifest's shorter MIT label as complete.
- The policy remains reusable and SPDX-based rather than package-name based.

### Negative

- The global allowlist now accepts another permissive SPDX identifier, so reviewers must continue inspecting the exact dependency and its use rather than treating allowlist membership as approval.
- A future modified or bundled Bowser distribution requires explicit notice and attribution-owner review.

### Operational

- CI keeps license checking enabled for runtime, development, and unknown scopes.
- The repository policy validator and adverse test reject removal or silent drift of `MITNFA`.
- Protected exact-head run `33023896325` passed Dependency review and the stable aggregate at remediation head `f8aa6f8`; the decision is enforced without a package exemption.

### Security and privacy

- No permission, token, secret, runtime input, logging surface, or network boundary changes.
- High-severity vulnerability review and informational OpenSSF reporting remain unchanged.

## Alternatives considered

### Exempt only Bowser from license review

Not selected. `allow-dependencies-licenses` would skip license evaluation for the package entirely and could hide a later license change under the same package identity.

### Replace the AWS SDK or S3 adapter

Not selected. The resolved condition is compatible with unmodified use, while replacement would change the client, dependency graph, cancellation behavior, streaming semantics, and previously completed evidence without reducing a demonstrated operational risk.

### Rely only on the package manifest's MIT field

Not selected. The distributed license file is more complete, and the protected dependency graph correctly reports the stricter compound expression.

## Validation

- The checked workflow must contain the exact reviewed allowlist with `MITNFA`.
- The CI-policy test must fail when `MITNFA` is removed.
- Documentation, repository-memory, secret, CI-policy, and affected candidate gates must pass locally.
- A new protected pull-request run for the exact remediation head must pass Dependency review and the stable `CI required` aggregate.

## Revisit triggers

Revisit this decision if Bowser's license text or GitHub classification changes, Aster modifies or forks Bowser, packaging strips third-party notices, another identifier is combined with MITNFA, an advisory changes the dependency posture, or the AWS SDK removes the transitive dependency.

## Migration

Add `MITNFA` to the workflow and its repository validator, record the transitive path and notice duty, run the local affected gate, then publish one remediation commit to the existing pull request. Rollback removes the identifier only after the dependency graph no longer contains any accepted MITNFA dependency or a replacement path has passed its owning gates.
