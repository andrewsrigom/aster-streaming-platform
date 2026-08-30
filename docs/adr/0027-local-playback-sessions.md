# ADR-0027: Local owner-validated playback sessions

- Status: Accepted
- Date: 2026-08-28
- Owners: Playback and Catalog
- Requirements: P07-R01, P07-R02, P07-R03, P07-R09
- Superseded in part: ADR-0040 replaces only the private Catalog read's `no retry` clause

## Context

Catalog owns current rights, active publication and validated delivery references. Playback must obtain a current owner decision, not import Catalog tables or trust a stale projection. Calling back through the same concurrency-limited public Router while it waits for Playback risks exhausting its request slots. ADR-0017 also forbids one owner impersonating Router to another.

## Decision

Keep the supergraph as the public application API. Add a bounded internal Catalog GraphQL publication batch field and its return type with Federation v2 `@inaccessible`; public clients cannot select them. This directive shapes the public schema, not authorization: Catalog additionally requires a separate read-only Playback-to-Catalog credential and the exact fixed operation before resolving the field. Normal Router requests cannot select this owner-only field even at the subgraph. At most twenty title IDs are read in one request, preserving order/nulls and using existing current published/rights/artwork/validation checks. Public Catalog metadata remains unchanged.

The local initializer will create a distinct random 256-bit file credential for that read path, mounted only into Catalog and Playback. It is not either owner's Router credential. Playback also receives its own separate Router-to-Playback credential. Extend existing exact Host/Origin, bounded-header/body, constant-time comparison and private-file protections; reject duplicate credentials, public identity claims and arbitrary operations. Use fixed private Catalog endpoint/operation, bounded response parsing and deadline/cancellation. [ADR-0040](0040-deadline-bound-safe-read-retries.md) now permits one deadline-bound retry only for selected transient failures of this safe read; every trust, rights and mutation rule here remains. No recursive public Router request, cross-context SQL or new intermediary service. Hosted service identity/TLS remains Phase 14.

Playback records an anonymous session only after that owner response passes its own response/URL checks. Session IDs and correlation IDs are generated server-side; a caller cannot supply a manifest, approval or profile identity. The first slice is explicitly anonymous and has no Identity/Engagement/Discovery dependency. Profile binding, when added during Phase 07, must come from Identity verification, never a free-form profile argument.

Local session lifetime is fifteen minutes, capped by the earliest current film/artwork rights expiry. The owner check must be no more than two seconds old at creation and cannot be future-dated; clocks/IDs are injected for deterministic tests. This is a conservative local clock/deadline policy, not a globally synchronized-clock guarantee. Persist the publication ID, Catalog version/check time, expiry and minimal request correlation in Playback's own PostgreSQL schema; no media credentials or unnecessary viewer data.

The local store has 4096 total slots, enforced by a unique bounded SQL column. A singleton owner row serializes admission within the bounded transaction; it is not a distributed throughput claim. Keep session audit for twenty-four hours after expiry and prune at most sixty-four eligible rows per creation. Full capacity rejects new sessions without eviction of live/recent records. This finite local policy may limit sustained daily throughput; hosted sizing belongs to Phase 14. SQL rechecks expiry and the two-second Catalog snapshot window at insertion. Runtime has no session UPDATE, schema/role administration or access to another context. An acknowledged COMMIT alone yields success; ambiguous commits are returned as indeterminate and never retried automatically. Rollback normally stops the new service and retains the additive schema; destructive down migration is only for an explicitly disposable or approved backup/recovery target.

Use only canonical credential-free HTTPS references, plus the existing exact loopback publication namespace when local delivery is explicitly configured. Do not fetch media in the session service or add tokens/DRM to openly licensed films. Expiry governs session/control-plane use; it does not revoke previously delivered or cacheable CC media URLs. A fresh session requires a new current Catalog read. There is no distributed transaction across owners: later retirement prevents new owner approvals, while already-issued sessions follow their short expiry policy.

## Verification and recovery

Require negative current-state/source/expiry/URL checks, missing entities, bounded batching, no cross-request authorization cache, timeout/cancellation, rejected forged read credentials, public-schema exclusion, protected operation compatibility, and real PostgreSQL/Router owner boundaries before declaring the slice verified. Catalog's minimal projection and session-domain tests alone are not a running Playback service or a playable demo.

Rotate local credentials by recreating their exact disposable mounts and restarting the affected consumers together. Keep old Router artifacts for rollback; stop only the new Playback service if its slice fails. Preserve Catalog/media and use additive isolated Playback migrations with documented forward/backward behavior. No hosted resources or paid dependencies are introduced.

## Sources

- [Apollo Federation inaccessible directive](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives#inaccessible): supported from Federation v2; excluded from the API schema but retained in the supergraph. Current pinned composition/runtime compatibility remains a required check.
- [Existing local Router trust](0017-local-router-trust.md), [data ownership](0004-data-ownership.md) and [media delivery](0006-media-delivery.md) remain unchanged invariants.
