# Handoff

## Resume point

Start READY P04-R02 on feat/p04-supergraph, now based on released main 135484183253ede7a6b6436f737794bfee2049d8. P04-R01/R04/R05/R08/R10 schema delivery is locally verified: five deterministic artifacts, twelve operations, nine tests, clean-source generation and 55/55 candidate gates. No Phase 04 PR exists; publish the coherent phase only after runtime acceptance.

## Predecessor

Phase 03 is released: PR 20, protected run 33090966906 and post-merge run 33091716358 passed on attempt 1. Source trees of its accepted candidate and squash are identical. Full evidence is in evidence/phase-03/release.txt. Local main was fast-forwarded and inspected clean before the dependent rebase.

## Next outcome

Write the P04-R02 plan, then implement actual Apollo Router with P04-R03/R06/R07/R09: private subgraph topology, trusted propagation, bounded traffic/telemetry and partial-failure proof. Preserve Identity's durable session/authorization and Catalog reader isolation. Use existing generated SDL, not runtime introspection or a new aggregation service.

## Runtime investigation runway

- Official Router release API returned v2.17.0, published 2026-07-24. This is an investigated candidate, not a selected/pulled image. Verify exact image digest, authoritative license and required free/core feature support before adopting it.
- Expected paths: infra/router for runtime configuration, apps/router for narrow Router hooks, infra/compose and existing owner transports for private topology/trust; one bounded local integration driver under tools.
- Identity currently requires the exact loopback Host/Origin and CSRF policy and rejects forwarding/identity headers. A separate verified Router trust mode needs an ADR; do not disable these checks or treat a public account/profile header as authority.
- Preserve cookie-only issuance/revocation through Router responses. Viewer credentials go only to their owner, not arbitrary subgraphs; local Router service trust must have a separate purpose/source.
- The mixed ViewerAndTitle operation deliberately has nullable roots. Test a real subgraph failure without claiming composition itself proves partial availability. Required Router trace/query-plan evidence still does not exist.
- Do not implement the web application before this phase's runtime acceptance.

## Evidence and limits

Clean detached source at 5553683394a681d750d7aef401cfb76cdb02b0cf: frozen offline install, forced eleven-package build (zero cache, 17.504 s), nine tests and read-only schema check pass. Rebased candidate gate: 55/55 tasks, 41 cached, 21.568 s. Later closeout is documentation-only; fingerprints in evidence/phase-04/composition.txt bind measured source. The clean temporary worktree was removed.

## Do not do yet

No hosted resources, paid feature dependency, direct public subgraph API, operator identity shortcut, film acquisition/approval or playback claim. No broad Docker cleanup. Retained Identity/status/Redis/PostgreSQL demo containers remain healthy and unchanged.
