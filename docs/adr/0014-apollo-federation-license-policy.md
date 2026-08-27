# ADR-0014: Apollo Federation Dependency License Policy

- Status: Accepted
- Date: 2026-08-27
- Owners: Repository owner; Identity and Profiles
- Related requirements: P02-R09, P02-R10, P04-R01
- Authorization: repository owner explicitly authorized proceeding with this license on 2026-08-27

## Context

ADR-0003 and the technology baseline select Apollo Federation v2 with @apollo/subgraph. Current npm metadata identifies @apollo/subgraph 2.14.4 as MIT, but it requires @apollo/federation-internals 2.14.4 under Elastic-2.0. The matching @apollo/composition 2.14.4 package also uses Elastic-2.0. The earlier dependency-review allowlist excluded that license.

The exact upstream source for npm gitHead b95c124ca8376e66ae12fc0b1fbc394ee2c8c58e confirms the internal package license. The owner authorized the proposed use after the restrictions and dependency scope were explained.

## Decision

Use the unmodified Apollo Federation dependencies under their Elastic License 2.0 terms; Aster-authored source remains MIT. Add only the reviewed SPDX identifier to dependency review without bypassing vulnerability, scope, notice or license-expression checks. Keep the exact dependency graph and distributed notices in release evidence. This authorization does not approve arbitrary new products using the same license or future hosted arrangements.

The upstream terms restrict offering substantial functionality of that software as a hosted/managed service, prohibit license-key circumvention and require retaining/distributing license notices. This decision does not claim legal clearance for every future deployment. A future hosted offering, package modification or redistribution change must be reviewed for its actual use. The owner's subsequent standing authorization permits agents to resolve compatible licensing choices and record required ADR/policy changes without a new permission pause; it does not waive upstream restrictions or other resource/security boundaries.

## Alternatives and boundaries

- Preserve the accepted Apollo architecture and explicitly review its license: selected with owner authorization.
- Retain the current license allowlist and change the Federation implementation: requires an owner-approved technology/ADR revision; do not silently replace the selected @apollo/subgraph runtime.
- Revert to Federation v1 or omit composition: would not satisfy the accepted v2/verification requirements.
- Exempt packages from license checking or describe the transitive graph as MIT-only: rejected.

## Validation after authorization

The complete installed graph also adds tslib 2.8.1 under 0BSD. Its [versioned upstream license](https://raw.githubusercontent.com/microsoft/tslib/v2.8.1/LICENSE.txt) permits the intended use, modification and redistribution. Apply the owner's standing authorization to add this exact SPDX identifier without a new pause; retain the upstream file in packaging. No change to Aster's MIT license is needed.

Verify exact dependencies/peers on pinned Node/GraphQL, complete licenses and notices, audit, schema composition, protected CI and package output. Authorization alone is not a passing compatibility or release result. Phase 14 still owns hosted deployment decisions.

## State when accepted

At acceptance, P02-R03 through P02-R08 were locally verified at 5a263e8 and the tested cookie boundary was not yet wired. Subsequent runtime acceptance is recorded in [Phase 02 evidence](../../evidence/phase-02/README.md); the licensing decision itself is not proof of implementation or release.

## Sources

- [Exact upstream license](https://raw.githubusercontent.com/apollographql/federation/b95c124ca8376e66ae12fc0b1fbc394ee2c8c58e/LICENSE).
- [Exact federation-internals manifest](https://raw.githubusercontent.com/apollographql/federation/b95c124ca8376e66ae12fc0b1fbc394ee2c8c58e/internals-js/package.json).
- Author-published metadata: pnpm view @apollo/subgraph@2.14.4 dependencies license; pnpm view @apollo/federation-internals@2.14.4 license gitHead; pnpm view @apollo/composition@2.14.4 license gitHead.
- Repository policy: .github/workflows/ci.yml dependency-review allow-licenses; AGENTS.md autonomous execution policy; skills/agent.md stop conditions.
