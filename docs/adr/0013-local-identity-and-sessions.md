# ADR-0013: Local Identity Assertions and Owner-Validated Sessions

- Status: Accepted
- Date: 2026-08-27
- Owners: Identity and Profiles
- Related requirements: P02-R01–P02-R10, IDP-R01–IDP-R05

## Context

The local product needs one synthetic viewer and real profile ownership without a hosted account, password UI or another identity service. Phase 01 provides the runtime but no authentication. Phase 02 owns the identity and session decision; Phase 04 owns Router-to-subgraph trust and Phase 14 owns hosted identity deployment.

This ADR accepts a design, not a completed account/session feature. Implementation and evidence are tracked in [Phase 02 evidence](../../evidence/phase-02/README.md).

## Decision

Implement a local-only Aster identity adapter using a fixed-purpose ES256 JWT assertion and the narrow `jose` library. The source-owned issuer is `urn:aster:local-identity`, audience `aster:identity-session`, subject `aster-demo-viewer` and type `aster-local-session+jwt`. A request cannot select these values or grant roles. Signatures use a key pair with a non-exportable private key generated in memory at local startup; no private key or hosted secret is committed or persisted.

The browser session will combine that signed credential with an Identity-owned PostgreSQL record. Signature validity alone never authorizes a product operation. The record binds the unique session identifier and token digest to an account, absolute expiry and revocation. Every authenticated use checks the durable owner; Redis is not session authority. Use a 30-minute absolute lifetime without implicit renewal; sign-in creates a fresh session and sign-out revokes it idempotently. Session issuance/cleanup limits and transaction semantics belong to the persistence slice before exposure.

The local adapter requires all three: explicit `local` environment, affirmative local-demo opt-in and a canonical HTTP loopback origin. Hosted/integration environment selection cannot enable it by supplying only the opt-in. The future transport registers demo sign-in only through this guarded composition and accepts no identity/role input. Origin/Host and CSRF checks must run before issuing any credential. The guard cannot prove where an operator deployed a deliberately mislabelled local executable; hosted packaging/configuration must exclude local activation in Phase 14.

Before returning a validated assertion, require a verified ES256 signature, exact issuer/audience/type/subject, required issued-at/expiry/session ID, a valid UUID session ID, no future issued-at, positive lifetime no longer than 30 minutes, and unexpired credentials. Limit serialized tokens to 4096 bytes and concurrent crypto to eight operations without queueing. Reject unsupported protected-header key URLs/material and never fetch keys from a token. Cancellation suppresses results; bounded native crypto already running may finish while retaining its slot.

## Browser and federation contract

The transport slice will set a host-only `HttpOnly; SameSite=Strict; Path=/` cookie, never local/session storage, Apollo cache or Redux. Hosted cookies also require `Secure` and the `__Host-` prefix. The explicit loopback HTTP demo uses a distinct local cookie name; it is not a hosted TLS exception. Credentials never appear in GraphQL response bodies, URLs or logs. Sign-in, sign-out and other mutations require the declared origin, non-simple content type and CSRF protection, including unauthenticated sign-in.

Local JWTs are not operator credentials or Router-internal identity context. Phase 04 must define a separate trust source/purpose and prove forgery rejection. Phase 14 will select an OIDC provider and use authorization-code flow with PKCE/state/nonce through a maintained OIDC client, then map `(issuer, subject)` to the existing Aster account. It must validate upstream issuer, audience/authorized party, signature, expiry and flow-bound nonce; an upstream token cannot be substituted for an Aster session. No hosted OIDC login or remote JWKS fetch is implemented by this decision.

## Rationale and alternatives

| Option | Assessment |
|---|---|
| Local signed adapter and durable session owner | Selected: no external process/credential, real claim validation, explicit revocation and small context-owned boundary |
| Opaque cookie and PostgreSQL session only | Simpler crypto surface, but does not exercise the required signed-claim boundary; remains the replacement if JWT complexity provides no value after Federation integration |
| Better Auth or similar full account framework | Provides broader account/session features; not selected because the initial product excludes password, email and social-provider breadth and owns its profile model |
| Keycloak local identity server | Standards-based provider option; adds another process, configuration and resource/upgrade surface to the minimum local demonstration |
| Hosted-only OIDC provider | Appropriate hosted option, but credentials/availability cannot be prerequisites of the local demo |

`jose` supplies signing/verification, not a complete OIDC provider or login flow. Version 6.2.10 is the candidate exact pin: MIT, ESM, no runtime dependencies, registry unpacked size 258772 bytes. Verify the lock, Node 24 compatibility and audit before claiming this adapter implemented. `openid-client` 6.8.7 was evaluated as a maintained MIT OIDC client with a Node 20 baseline; it is not installed before an actual OIDC flow needs it.

## Consequences

- PostgreSQL outage fails authenticated product access closed. Public catalog/playback availability is owned by later contexts, not a reason to trust stale session state.
- Restarting the local signer invalidates old local credentials; sign in again. Durable accounts/profiles survive. This deliberately avoids storing a local signing secret and is not the hosted rotation design.
- JWT verification does not replace session lookup, owner authorization, CSRF, rate limits or expiry enforcement. The next slices must prove these before exposing authentication.
- Claims carry only a fixed synthetic subject and opaque session identifier, not email, profile preferences or privileges.
- The domain depends on validated identity vocabulary, not JOSE, Express, SQL or a provider SDK.

## Validation

Use real cryptographic tests for valid, malformed, expired, wrong-key, wrong-algorithm, wrong-issuer/audience/type/subject, missing claims, future issue time, excessive lifetime and oversized credentials. Test hosted activation rejection, saturation and cancellation. The persistence/transport slices must additionally prove revocation, unknown sessions, session fixation resistance, cross-account access, CSRF, concurrent limits, clean seed and database rollback. No browser/hosted interoperability is claimed by a unit test.

## Migration and revisit triggers

Adopt the adapter first without changing the released health-only startup. Wire owner-held account/session persistence next, then GraphQL and cookie transport. Rollback removes the unwired adapter without data loss; after persistence, revoke local sessions before removing the implementation. Revisit when selecting hosted identity, introducing multiple signer replicas, needing persistent sessions across restart or measuring unnecessary JWT overhead. Hosted signing-key persistence/rotation requires its own verified operational design.

## Sources

- [JOSE implementation and support](https://github.com/panva/jose), [OIDC client support](https://github.com/panva/openid-client).
- [JWT best current practices](https://datatracker.ietf.org/doc/html/rfc8725) and [OpenID Connect validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation).
- [OWASP session controls](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [CSRF controls](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [Better Auth](https://better-auth.com/docs/introduction), [Keycloak](https://www.keycloak.org/guides). Checked 2026-08-27; product-specific limits above are Aster decisions, not upstream defaults.
