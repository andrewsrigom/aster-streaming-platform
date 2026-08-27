# Current State

Last updated: 2026-08-27

## Active phase

**Phase 03 — Catalog and Content Rights**

Status: **IN_PROGRESS**

## Verified

- Phases 00–02 are released. Phase 02 PR 19 squash `ec6386ca7add0f12ae748589be763d9e90ff0d6c` is the clean main base.
- Protected `33066484199` and exact post-merge `33066827332` pass every applicable job. Both verify 144 Identity tests, eleven real scenarios, packaged UID 1000, six metric families and the Docker local login/profile journey. Post-merge matrix: 158185 ms, cleanup 1012 ms, zero remaining.
- Executing-agent initial/confirmation reviews are complete; no independent approval claimed. No bypass, duplicate PR or repeated pipeline. [Release evidence](../evidence/phase-02/release.txt).
- The local Aster Docker demo remains healthy with retained data. No unrelated Docker/WSL resource was modified.

## Current work

P03-R01 on `feat/p03-catalog-rights`: pure Catalog rights completeness/approval, derived attribution and title lifecycle rules. 52 focused tests, scoped lint/typecheck and unused-code checks pass. The 25-pair transition matrix, expiry, wrong-title/stale media, reopening and bounded hostile inputs are covered. Initial review fixed hidden evidence fields and invalid retired linkage; confirmation passes. Candidate gate passes all 52 tasks (33 cached, 18.031 s), 52 Catalog tests and high/critical audit. Coherent local commit remains. [Evidence](../evidence/phase-03/catalog-domain.txt).

## Not implemented

- Catalog persistence, operator authorization, public browse/schema, real rights records and generated HLS fixture.
- Router, browser UI, media pipeline/playback, engagement/discovery, advanced Redis/resilience, distributed traces/SLOs and hosted release.
- No playable VOD demo or approved film exists.

## Next outcome

Commit the verified P03-R01 domain slice, then plan P03-R02 to implement Catalog persistence/operator policies and public queries under a new bounded plan. No remote PR for a domain-only slice. The official Big Buck Bunny source and index are reachable; no media downloaded or rights approved. Use the existing owner boundaries and Node/SQL/GraphQL infrastructure.

## Current risks

- Keep Aster MIT; ADR-0014 authorizes Elastic-2.0/0BSD dependencies and standing compatible licensing decisions. Do not repeat that permission pause. Preserve notices and exact terms.
- Audit passes high/critical with moderate uuid 9 GHSA-w5hq-g745-h8pq outside inspected Apollo v1/v4 call paths; recheck on upgrades.
- Local JWTs never grant operator/Router/hosted trust. Restart deliberately invalidates local sessions while durable data survives.
- Identity pending outbox caps at 128/account; no silent eviction. Phase 08 owns relay/cleanup.
- Catalog domain tests validate supplied reference consistency, not actual media bytes, operator identity or database concurrency.
- Rights approval precedes acquisition; missing pre-acquisition checksum is not itself missing permission. Share-alike delivery remains unsupported by the initial domain policy.
- Docker proof covers WSL/hosted Linux amd64 and Windows localhost access, not native Windows containers/macOS/arm64. Samples are not capacity/SLO guarantees.
- No broad reset/prune, unrelated changes, protection bypass or private motivation in docs. Dependabot PR 1 remains unrelated.
