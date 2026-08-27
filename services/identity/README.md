# Local Identity API

Status: implemented, locally tested over HTTP with real PostgreSQL; Phase 02 release is pending. This is a local-only Federation v2 subgraph, not hosted authentication, a Router or a browser application.

## Run

From the repository root:

```sh
docker compose --project-name aster --file infra/compose/compose.yml --profile runtime up --build --wait --wait-timeout 120
docker compose --project-name aster --file infra/compose/compose.yml exec -T identity node --input-type=module < tools/verify-local-identity.mjs
```

The second command is a POSIX/WSL smoke check: sign in, create/select/list/delete its synthetic profile, sign out. It prints no credentials and requires one free profile slot plus journal capacity. No host Node/pnpm or hosted account is needed. The one-shot initializer applies pending SQL; the runtime uses a separate restricted login. Normal `down` preserves data; do not reset Docker to fix a failed migration.

Native PowerShell can pipe the same script to the container:

```powershell
Get-Content -Raw tools/verify-local-identity.mjs | docker compose --project-name aster --file infra/compose/compose.yml exec -T identity node --input-type=module
```

## HTTP contract

Send a JSON object to `http://127.0.0.1:3100/graphql`, containing one named `query` and optional `variables`/`operationName`. Every request, including sign-in, requires exact `Origin: http://127.0.0.1:3100`, `X-Aster-CSRF: 1`, and `Content-Type: application/json`. The Host must match; no CORS, forwarding or public identity headers are accepted. GET, query strings, duplicate headers, ambiguous cookies, batches and APQ extensions are rejected.

`demoSignIn` issues `aster_local_session` through Set-Cookie only: host-only, HttpOnly, SameSite=Strict, Path=/, absolute 30-minute expiry. The guarded loopback HTTP mode intentionally does not use Secure or a __Host- name. Never copy this policy to a hosted deployment. Credentials are never GraphQL fields. Failed/unknown sign-in commits issue no cookie; failed logout does not pretend revocation succeeded.

## Operations

| Operation | Behavior |
|---|---|
| `me` | Safe account ID and absolute expiry; null when unauthenticated |
| `profiles` | Owned profile list and this session's activeProfileId |
| `profile(id)` | Owned profile or null; foreign and missing are indistinguishable |
| `activeProfile(id)` | Resolves only an owned ID that is selected in this session |
| `demoSignIn` / `signOut` | Server-controlled synthetic identity / durable revocation |
| `createProfile(input)` | UUID mutationId plus displayName, locale and maturity |
| `updateProfile(input)` | UUID mutationId, profileId, expectedVersion and preferences |
| `deleteProfile(input)` | UUID mutationId, profileId and expectedVersion |
| `selectProfile(id)` | Owner-authorized session selection, not a permission grant |

Profile uses a Federation `@key(fields: "id")`. Entity representations are untrusted; only valid Profile IDs are accepted and non-key fields are ignored. One bounded, authorized list snapshot serves request-scoped DataLoader batches, preserving order/missing entities without cross-request caching. Apollo receives mutable transport copies, not frozen domain rows. The SDL is checked against the [schema artifact](../../evidence/phase-02/identity-schema.graphql).

Mutation payloads return `code` and `correlationId`, plus safe result metadata. Codes: COMPLETED, UNAUTHENTICATED, INVALID_INPUT, NOT_FOUND, CONFLICT, LIMIT_EXCEEDED, BACKPRESSURE, UNAVAILABLE, CANCELLED, INDETERMINATE. Query errors carry sanitized fixed messages/codes and generated correlation IDs; never raw database or validation causes. Do not automatically retry an uncertain write. Profile retries reuse the original UUID and identical normalized input within the documented receipt window.

## Bounds and recovery

- 64 KiB HTTP body; 16 KiB document; 2048 parser tokens; depth 8; 16 aliases; 128 expanded fields; cost 512, with list multiplier 16.
- Input depth 8, 256 nodes and arrays of at most 16. One named operation and one root mutation field. No subscriptions, introspection, multipart/incremental output or landing page.
- Eight executing requests, no waiting queue, one process-local token bucket (64 burst, eight/second); 429 includes Retry-After. Three-second request deadline propagates cancellation. Work ignoring cancellation retains its admission slot until it settles; late cookies are refused.
- Five profiles by default, eight sessions/account. Owner-side SQL, locks, optimistic versions, deletion, receipt/audit retention and 128-event outbox backpressure are specified in [the migration guide](migrations/README.md).
- Restart invalidates previous ephemeral signatures, not accounts/profiles. Sign in again. Redis is not session authority. Runtime readiness rejects administrative credentials or missing product tables; migrations run separately.
- Structured operation records contain generated correlation/trace IDs, fixed outcome labels and measured duration. They are not exported distributed traces or an SLO. Apollo usage/schema reporting and inline trace output are disabled. Phase 04/12 own routing and distributed telemetry.
- Phase 08 activates outbox delivery/acknowledged cleanup. Do not delete pending facts to bypass capacity. This API has no email/signup/recovery, operator role or hosted identity bypass.

## Verification

```sh
pnpm exec turbo run build --filter=@aster/identity
pnpm --filter @aster/identity integration:subgraph
```

The isolated fixture verifies empty/repeated bootstrap, migration serialization, unknown versions, non-admin startup, actual login/profile/session paths, duplicate/concurrent limits, foreign-owner reads/writes/entities, rollback/deadlines and restart. It deletes only its own fixture resources. Focused transport tests additionally cover CSRF, sanitization, abuse and non-cooperative cancellation. See [Phase 02 evidence](../../evidence/phase-02/README.md).

Dependencies retain their own notices. [ADR-0014](../../docs/adr/0014-apollo-federation-license-policy.md) accepts Apollo's Elastic-2.0 internals and tslib's 0BSD; Aster-authored source remains MIT.

