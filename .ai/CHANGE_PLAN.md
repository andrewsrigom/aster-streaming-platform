# Work Item: Establish the Local Identity Trust Boundary

- Status: IN_PROGRESS
- Owner: Identity and Profiles
- Phase: 02
- Requirement IDs: P02-R01
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

Select the identity/session contract and implement the smallest local-only signed-assertion adapter with adverse tests. This establishes the credential boundary; account/session persistence and GraphQL integration follow as separate coherent slices.

## Current behavior

Phase 01 is released through PR 18 squash b0544c9. Protected run 33047330768 and exact post-merge run 33047629326 pass every applicable gate, Docker full-profile smoke and the real eight-scenario matrix. Identity currently exposes health only; no account, session or profile exists.

## Proposed behavior

ADR-0013 selects a server-controlled synthetic local identity, narrow JOSE verification and PostgreSQL-backed revocable browser sessions. Add an environment-guarded local signer and fixed-purpose assertion verifier. Preserve existing runtime startup until the owning account/session slice wires the adapter.

## Boundaries

- Owning context/data: Identity and Profiles; no shared authoritative entity.
- Paths: services/identity/src/domain, infrastructure/identity and focused tests; ADR/evidence and dependency lock.
- Trust: untrusted compact JWT versus configured issuer/key/audience; local-only activation; no public user/profile/role headers.
- Dependencies: candidate jose 6.2.10 (MIT, no runtime dependencies, ESM); exact lock and compatibility/audit required before acceptance.
- No hosted provider, new service, database schema, HTTP endpoint, UI or Router change.

## Invariants

- Local issuance requires explicit local environment, local opt-in and canonical loopback origin.
- Issuer, audience, subject and token purpose are source-owned, not request-controlled.
- Verify signature, fixed algorithm, required claims, expiry, issued-at, bounded lifetime and session identifier before returning a validated assertion.
- A validated assertion is not proof of an active database session; the next slice must check its owning durable session.
- Never return raw library errors or log tokens/keys. Bound input bytes and concurrent cryptographic work.
- Domain contracts import no crypto, framework, SQL or telemetry SDK.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Hosted or ambiguous local activation | Reject before generating keys | Sanitized configuration error |
| Malformed, forged, expired or misdirected assertion | Unauthenticated result without raw cause | Finite outcome; no endpoint metric yet |
| Cancelled request or saturated verification | Cancelled/unavailable result, no queued work | No secret-bearing detail |
| Local process restart | Old ephemeral-key assertions invalid; durable profile data unaffected | Session wiring will document sign-in again |

## Data and contracts

- No migration, GraphQL, event or cache in this slice.
- Planned session persistence: owner-held token digest, account link, absolute expiry and revocation; PostgreSQL required, Redis non-authoritative.
- Browser cookie and CSRF enforcement are required in the transport slice, not claimed by this adapter.
- Hosted OIDC provider, persisted signing keys and rotation remain Phase 14; Router internal-context trust remains Phase 04.

## Security and privacy

Read SECURITY.md and architecture/security/testing skills. Use synthetic fixed subject only. The local private key is ephemeral, non-exportable and never saved. Public inputs cannot select a subject, key, issuer or role. Native cryptographic work cannot be forcibly cancelled; retain its finite concurrency slot until completion and suppress any result after caller cancellation.

## Implementation steps

1. [completed] ADR-0013 and exact jose 6.2.10 metadata/lock/audit evidence recorded.
2. [completed] Domain contract, strict verifier and guarded local-only issuer implemented without changing runtime wiring.
3. [completed] 51 focused cases pass; 85 total Identity tests pass. Initial lint issues and saturation-test ordering were corrected.
4. [completed locally] All 49 canonical tasks pass (34 cached, 13.872 s), audit/diff checks and executing-agent confirmation pass. Evidence is in the named raw artifact. Commit this coherent checkpoint, then activate account/session work; group publication with a meaningful product candidate.

## Tests

- Domain: framework-free contract and strict identifier/lifetime rules.
- Adapter: real ES256 signing/verification, controlled clocks, hostile serialized tokens, local configuration guard.
- Integration: cryptographic library on pinned Node; no hosted protocol/database claim.
- Browser/media/load: not applicable; no endpoint or media behavior changes.

## Evidence

- Iteration gate: Identity build/typecheck and focused test file; targeted lint/format.
- Candidate gate: pnpm check:changed and registry audit.
- Complete gate: all named adverse cases, package/license compatibility and complete source gate.
- Raw artifact: evidence/phase-02/identity-boundary.txt.
- Heavyweight repeat triggers: when wiring runtime/Compose/session persistence, run affected real integration and Docker acceptance. Do not repeat Phase 01 containers for an unwired adapter or prose.
- Review stopping rule: one complete initial review and confirmation; further rounds only for demonstrated requirement/security/data/availability/public-contract blockers.

## Rollback or recovery

Remove the unwired adapter and its dependency; the released health-only runtime remains unchanged. No durable data or migration exists.

## Documentation updates

ADR-0013, decision navigation, Phase 02 evidence and concise repository memory; batch Phase 01 hosted closeout here, without an extra metadata-only PR.

## Completion checklist

- [x] Requirements satisfied for the local adapter/decision boundary
- [x] Tests pass
- [x] Evidence captured
- [x] Documentation current
- [x] .ai state updated
- [x] Remaining risks recorded
