# ADR-0015: Local Catalog Operator Through an Explicit CLI Boundary

- Status: Accepted
- Date: 2026-08-27
- Owners: Catalog
- Related requirements: P03-R06, P03-R10
- Decision scope: reversible local Phase 03 implementation under AGENTS.md autonomy

## Context

Catalog requires editorial operators without expanding viewer accounts into an admin product. ADR-0013 explicitly excludes operator privileges from local viewer JWTs. A local command interface is an accepted Phase 03 deliverable; hosted operator identity belongs to Phase 14.

## Decision

Provide a local-only CLI process, activated only by explicit local environment and operator opt-in. The trusted composition root creates a non-serializable in-process authority reference with a fixed synthetic operator ID, finite lifetime and revocation. The owning application checks this authority on every command and before successful transaction completion. JSON input, headers, a copied object or a viewer credential cannot create that reference.

The operating-system user who can execute or modify this process and access local database credentials is the local operator. This is not isolation from malicious code in the same process, a hosted authentication provider, or a security sandbox. Never wire the authority factory to a public route; hosted packaging must exclude this local entry point. A deliberate mislabelled deployment is outside the local guard's protection.

Only Catalog credentials write Catalog data. Commands serialize by title, enforce current rights/media and record audit plus idempotency receipts. Publishing resolves an immutable Catalog-owned technical attestation by ID. The operator runtime can read, but cannot insert/update/delete, that attestation table; no command accepts arbitrary media objects or validated flags. P03-R04 will verify the generated fixture initializer; Phase 06 will verify the real worker/attestation handoff.

## Alternatives

- Reuse viewer JWT or accept an operator role in input: rejected; crosses the accepted trust boundary.
- Add a hosted identity provider or an admin web app now: unnecessary for local editorial operations, adds accounts/credentials outside this phase.
- Unrestricted SQL as the editorial interface: rejected; bypasses domain decisions and consistent audit.
- Explicit local process authority: selected; small, revocable, default-deny and independently testable.

## Operational limits

A command is bounded by input size, concurrency, one deadline and cancellation. No external request is made while holding a PostgreSQL lock. Audit and rights evidence are retained. Receipts last 24 hours with 64 entries/title; pending outbox has 128 entries/title. Both reserve their final slot for retirement so normal commands cannot exhaust takedown capacity; unrelayed facts are never evicted. Metadata audit preserves independent artwork reviews. Commands recheck publication eligibility before transaction success, including expiry during execution.

The safe hosted default is no operator entry point until Phase 14 supplies an authenticated and audited replacement. Local authorization tests do not prove hosted security.

## Verification

Reject missing, copied, foreign, viewer, expired and revoked authority; verify no persistent side effects. Prove command limits, sanitized failures, stale/replayed writes, publish/dispute serialization, atomic outbox and retirement under backlog. A successful metadata write is not media-rights verification.

## Sources

- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): least privilege, default deny and per-request enforcement.
- [PostgreSQL 18 locking](https://www.postgresql.org/docs/18/explicit-locking.html): transaction-scoped row locking.
- [Accepted viewer boundary](0013-local-identity-and-sessions.md), [rights invariant](0010-content-rights.md) and [transactional outbox](0007-events.md).
