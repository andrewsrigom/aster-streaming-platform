# Work Item: Owner-validated playback sessions

- Status: IN_PROGRESS
- Owner: Playback owns sessions; Catalog owns publication eligibility and delivery references
- Phase: 07
- Requirement IDs: P07-R01, P07-R02, P07-R03, P07-R09
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Create a short-lived anonymous playback session through the supergraph only after a bounded current Catalog check. Return a CDN-compatible reference without proxying media or depending on optional personalization.

## Current behavior

Phases 00–06 are released. PR 23 final head 37a9a398428f52fdc35942eeb690745d22812736 passed protected CI; squash 4083ea65edcf750bf4ba3e253654a529b72cd105 passed exact post-merge CI 33156505851. [Release evidence](../evidence/phase-06/release.md). This local branch is rebased on released main.

Catalog's current-publication projection/private GraphQL read, bounded HTTP consumer, anonymous Playback rules and PostgreSQL persistence are implemented. Affected suite 233/233 and real PostgreSQL expiry/concurrency/retention/role/migration checks pass, with strict builds, lint, architecture, unused-code and exact-main schema compatibility. [Evidence](../evidence/phase-07/README.md). Playback's public mutation, runtime, Compose and player remain planned. [ADR-0027](../docs/adr/0027-local-playback-sessions.md) fixes trust and finite local persistence policy.

## Proposed behavior

First implement Catalog's minimal current-publication projection and Playback's session rules with deterministic tests. Then connect the bounded owner read, Playback-owned PostgreSQL session persistence and the additive Federation mutation. Use the existing transport/runtime/telemetry packages, not another framework. Record the local service-read trust decision in an ADR before wiring credentials or transport.

## Boundaries

- Owning context: Catalog authorizes current publication; Playback creates and expires its own session.
- Affected services/packages: Catalog, new Playback owner, Router composition and local Compose.
- Authoritative data: separate Catalog and Playback PostgreSQL schemas/roles.
- Read models/caches: no cached projection can authorize a new session; no Redis dependency.
- Trust boundaries: browser input, owner GraphQL response, media URL policy, request cancellation and local service credentials.
- External dependencies: existing pinned Node/TypeScript/Express/Apollo/PostgreSQL; no paid or hosted resource.

## Invariants

- No cross-owner SQL, shared domain imports, caller-provided manifest/approval/profile authority, or recursive request through the same public Router.
- Only a current published, validated, rights-approved reference can create a session.
- Session ID is audit identity, not an S3 credential or DRM token.
- Media bytes bypass Node and GraphQL.
- Anonymous sessions do not depend on Identity, Engagement or Discovery.
- Phase 06 must release before this branch is published.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Missing/retired/disputed/expired Catalog title | No session | Bounded rejection code |
| Catalog deadline, invalid response or cancellation | Fail closed, no session write | Unavailable/cancelled code |
| Stale owner snapshot or rights expire before issuance | Reject or cap expiry to current authorization | Rejection code |
| Session-store capacity/timeout | Reject, no automatic mutation retry | Bounded store result |
| Optional personalization outage | Anonymous creation remains independent | Separate optional outcome |

## Data and contracts

- Schema/migration: additive Playback-owned sessions with expiry, bounded retention/capacity and audit context; no Catalog write changes.
- GraphQL: additive session mutation and minimal owner publication query; exact SDL/operation compatibility and request-scoped batching before publication.
- Events: no relay or durable progress; Phase 08 owns those behaviors.
- Cache: none needed to authorize; retain no cross-request rights authority.
- Compatibility: public Catalog metadata response remains unchanged; private owner facts stay out of that projection.
- Retention/deletion: 4096 total SQL slots; retain audit 24 hours after expiry, prune at most 64 eligible rows per admission, never evict active/recent sessions. Preserve media/Catalog audit.

## Security and privacy

- Authorization: current Catalog owner read; verified Identity may bind a profile in the later player slice, never an arbitrary profile argument.
- Input limits: exact identifier input, bounded batch/body/deadlines and finite admission.
- Sensitive data: no credentials, IP address, cookie or full media URL in telemetry.
- Abuse cases: stale projections, URL substitution/SSRF, spoofed owner credentials, alias/batch amplification, cancelled late writes and session-capacity exhaustion.

## Implementation steps

1. Project current Catalog publication independently of public metadata; test all existing eligibility gates and expiry.
2. Model bounded session identity/expiry and fail-closed application ports with deterministic clocks/IDs.
3. Record local owner-read trust/consistency ADR; implement the fixed GraphQL lookup and isolated Playback persistence.
4. Compose the Playback subgraph, operation limits, telemetry and Docker runtime.
5. Verify real owner checks/store/migrations/failure isolation and public contract; publish only after predecessor release.
6. Continue player/control/telemetry and clean Docker-only playable demo as subsequent coherent slices.

## Tests

- Domain: publication binding, lifecycle/rights/artwork expiry, URL policy, session ID/expiry and bounded snapshot age.
- Application: no write on unavailable/invalid/stale Catalog, cancellation, capacity and optional-service independence.
- Integration: real PostgreSQL role/migration/session behavior and Catalog/Playback/Router requests.
- Contract: additive composition, protected operation compatibility and N+1 batch counts.
- Browser: session API journey at this slice; actual HLS/player acceptance in the next slice.
- Performance/failure: bounded deadlines/concurrency and negative delivery references, not an unchanged host benchmark.

## Evidence

- Commands: affected build/unit/type/lint during iteration; affected-scope gate at candidate.
- Raw artifact path: evidence/phase-07/ when the first focused checks run.
- Acceptance result: planned; no Phase 07 acceptance claimed yet.
- Iteration gate: cheapest changed-owner domain/application tests and strict build.
- Candidate gate: source, composition, changed real-dependency/runtime tests, docs/security and exact protected CI.
- Heavyweight repeat triggers: schema, SQL, transport, packaging or player changes that invalidate their respective evidence; unchanged film/CPU work is not repeated.
- Review stopping rule: collect one initial round and one confirmation; extend only for an explicit requirement/security/data/availability/public-contract blocker.

## Rollback or recovery

The predecessor is released. Before deployment, stop only the new Playback service and keep old Router/schema artifacts available; preserve Catalog/media. Migration 0001 is additive and normally retained on application rollback; destructive down applies only to disposable/explicitly approved recovery targets. Up/down/up and unrelated-data preservation pass in the isolated fixture. No retained schema was changed.

## Documentation updates

Update current state/queue/handoff at this dependent-start checkpoint, then consolidate evidence at meaningful tested candidates. Add the trust ADR before transport and a concise session runbook with the completed vertical slice.

## Completion checklist

- [x] Current publication and session rules implemented
- [ ] Real owner read, persistence and Federation mutation verified
- [ ] Failure/abuse boundaries pass
- [ ] Evidence and documentation current
- [ ] Predecessor released and this candidate passes protected gates
