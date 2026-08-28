# Work Item: Owner-validated playback sessions

Historical pre-release plan. The [backend release record](backend-release.md) supersedes its waiting status.

- Status: WAITING_EXTERNAL
- Owner: Playback owns sessions; Catalog owns publication eligibility and delivery references
- Phase: 07
- Requirement IDs: P07-R01, P07-R02, P07-R03, P07-R09
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Create a short-lived anonymous playback session through the supergraph only after a bounded current Catalog check. Return a CDN-compatible reference without proxying media or depending on optional personalization.

## Current behavior

Phases 00–06 are released. PR 23 final head 37a9a398428f52fdc35942eeb690745d22812736 passed protected CI; squash 4083ea65edcf750bf4ba3e253654a529b72cd105 passed exact post-merge CI 33156505851. [Release evidence](../phase-06/release.md). This local branch is rebased on released main.

The public Playback mutation, current private Catalog read, anonymous session rules, isolated PostgreSQL store and Docker runtime are implemented. Affected suite 248/248, source 54/54, exact-release schema compatibility, actual runtime-role/migrator checks and the disposable connected Router journey pass. [Evidence](README.md). Candidate governance/protected review/release remain; player/demo is the next slice. [ADR-0027](../../docs/adr/0027-local-playback-sessions.md) fixes trust and finite local persistence policy.

## Proposed behavior

Continue from tested core 9ab840a: expose createPlaybackSession(titleId) with a nullable session and finite result code, generated correlation ID, manifest reference and expiry. Add Playback's bounded Apollo/Express transport, lifecycle/readiness, local migration runner and Docker image using the existing pinned packages. Compose the additive schema/known operation, wire independent Router-to-Playback and Playback-to-Catalog file credentials, and prove the connected path. No profile argument, media proxy, optional dependency or new framework. Backend-first integration remains separate from subsequent player/demo acceptance.

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

- Authorization: current Catalog owner read; anonymous playback remains independent of Identity. Verified profile binding is deferred to the owning personalization requirement, never an arbitrary profile argument.
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
- Journey: actual Router/owner/session requests in the disposable fixture at this slice; browser/HLS/player acceptance in the next slice.
- Performance/failure: bounded deadlines/concurrency and negative delivery references, not an unchanged host benchmark.

## Evidence

- Commands: affected build/unit/type/lint during iteration; affected-scope gate at candidate.
- Raw artifact path: evidence/phase-07/ when the first focused checks run.
- Acceptance result: backend requirements locally verified by the linked source/SQL/connected-runtime checks; protected release and full Phase 07 acceptance remain pending.
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
- [x] Real owner read, persistence and Federation mutation verified
- [x] Failure/abuse boundaries pass
- [x] Evidence and documentation current
- [ ] Predecessor released and this candidate passes protected gates

## Frozen candidate

P07-R01 waits only on PR 24 protected CI, initial/confirmation review and squash/post-merge release. Exact head 566f6bba5882e297d0cf326fbf9bb931bbd705ee; released base 4083ea65edcf750bf4ba3e253654a529b72cd105. Final changed-scope gate 64/64 and all named local backend acceptance pass. Rollback above remains valid; no retained runtime was changed. One dependent local P07-R04 item may proceed from this exact head, but cannot publish or release first. Any predecessor correction requires rebase and affected revalidation before dependent publication.
