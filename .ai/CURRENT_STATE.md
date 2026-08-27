# Current State

Last updated: 2026-08-27

## Active phase

**Phase 04 — Federated Supergraph**

Status: **IN_PROGRESS** on feat/p04-supergraph.

## Verified

Phases 00–03 are released at main 135484183253ede7a6b6436f737794bfee2049d8. [Phase 03 release](../evidence/phase-03/release.txt).

Phase 03 has complete [acceptance](../evidence/phase-03/README.md): 94 Catalog tests, clean-source 52/52 tasks, real Docker/HLS/SQL proof, author confirmation, protected CI and post-merge CI. PR 20 merged the exact accepted head 9abf65e; both runs passed on attempt 1 with no bypass. No real-film approval exists.

## Current work

P04-R01/R04/R05/R08/R10 schema delivery is locally verified; [evidence](../evidence/phase-04/composition.txt). P04-R02 with R03/R06/R07/R09 is IN_PROGRESS. Real Apollo Router 2.17.0 now fronts private Identity/Catalog, with separate file-backed transport credentials, owner-validated sessions, bounded traffic and optional sanitized traces. Focused trust/config/session tests (41) and platform/reset policy tests (35) pass. Real partial failure, revocation, capacity, trace privacy, client cancellation and bounded shutdown pass locally. Final packaging, consolidated candidate gates, clean-source acceptance and release remain open; no Phase 04 PR has been published.

## Not implemented

Web UI, real-film worker/delivery/playback, engagement/discovery and hosted release. No playable VOD demo or approved film exists. Local Router implementation does not establish complete hosted GraphQL protection.

## Next outcome

Finish P04-R02 candidate packaging/evidence, initial and confirmation review, clean-source full gates and protected Phase 04 publication. Do not start the web phase before this runtime acceptance.

## Current risks

- The former dependent branch is rebased onto the released squash; no gate bypass or duplicate pipelines.
- Composition/known-operation checks do not establish runtime routing, trust or allowlisting.
- Preserve MIT and third-party notices. No compatible-license permission pause; no invented media rights.
- Only bounded synthetic data and owned temporary resources; retained demo remains unchanged.
