# ADR-0018: Browser-Only Local Profile Sessions

- Status: Accepted
- Date: 2026-08-27
- Owners: Web presentation, Platform transport, Identity and Profiles
- Related requirements: P05-R02, P05-R03, P05-R05, P05-R09, P05-R10

## Decision

Extend ADR-0017's local Router edge to exactly two origins: the existing diagnostic origin `http://127.0.0.1:4000` and Web `http://127.0.0.1:3000`. Host remains `127.0.0.1:4000`. Web requests require `Sec-Fetch-Site: same-site`; the diagnostic origin retains its same-origin/absent metadata rule. Both require JSON POST `/graphql`, the custom CSRF header and existing rejection of identity/forwarding claims. CORS uses these exact origins, credentials, POST and the two declared request headers; no wildcard or arbitrary loopback port. Router's CORS layer handles preflight without calling an owner. This is a local HTTP exception only, not hosted identity policy.

Router still replaces the origin for private owner transport, inserts separate private credentials, forwards cookies only to Identity, and accepts Set-Cookie only from Identity. Identity signature, durable session, profile ownership and revocation checks are unchanged. Web has no private credential or owner endpoint.

Public Catalog SSR continues to use a public-only Apollo client and positive response projection. Profile queries/mutations run only after browser interaction in a separate, non-persisted Apollo client. No identity data is preloaded into HTML. Closing the profile flow, session/profile changes, expiry and cross-tab invalidation discard the private client/cache and cancel its requests. A new client restores Identity's current session before rendering profiles. Redux coordinates only dialog/flow state; input drafts remain local and remote profiles remain in Apollo.

Use a minimal adapted shadcn/Radix modal for focus trapping, Escape and focus restoration. Only the required Dialog primitive is installed, alongside existing Button; do not add a component gallery. Pin Redux Toolkit 2.12.0, React Redux 9.3.0 and Radix Dialog 1.1.23 after current registry peer/license checks (all MIT; React 19 supported). No player state is invented before Phase 07.

## Failure and recovery

Web keeps strict source checking, exact optional properties and unchecked-index checks. Its compiler skips declaration-file validation only: RTK 2.12.0's published declarations produce six errors inside unused async-thunk/listener types with TypeScript 6.0.3 and the repository's exact-optional setting. No application error is suppressed and no vendor code is patched. Other packages retain declaration checking. Typed action/consumer tests and runtime/browser checks cover the APIs actually used. This trades detection of internal vendor declaration inconsistencies for using the upstream runtime; revisit on RTK/TypeScript upgrades and remove the override when those declarations pass. See [TypeScript's documented trade-off](https://www.typescriptlang.org/tsconfig/skipLibCheck.html).

All browser operations have a four-second deadline, finite request/response sizes and cancellation. Mutations have no automatic retry; after an uncertain result, refresh owner state before another attempt. Do not render stale profiles while restoring a changed session. The modal provides explicit loading, signed-out, empty, unavailable and retry states. Cancellation does not promise that an already-committed owner mutation was undone.

## Validation and rollback

Prove real browser preflight/cookie/session/profile flow, keyboard/focus behavior, wrong-origin/fetch-metadata rejection, cache replacement and late-response cancellation. These are required checks, not claims made by this ADR. Rollback removes the Web-origin allowance and profile UI without deleting Identity data. No migration is required.

## Sources

- [Apollo Router CORS](https://www.apollographql.com/docs/graphos/routing/security/cors).
- [Redux Toolkit with Next.js](https://redux.js.org/usage/nextjs).
- [Radix Dialog accessibility](https://www.radix-ui.com/primitives/docs/components/dialog).

Checked 2026-08-27; exact local runtime behavior must also pass browser acceptance.
