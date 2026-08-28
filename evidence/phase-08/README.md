# Phase 08 progress implementation

P08-R01 is IN_PROGRESS on feat/p08-progress. This checkpoint implements the progress domain and application orchestration, not a running service or durable save feature. PostgreSQL, private owner transports, subgraph, relay and player integration remain planned.

## Implemented core

Engagement owns the (profile, title) aggregate. Sequence does not reset with a new playback session. Exact receipt replay returns the original result, including after a newer update or the old session's expiry; current Identity authorization is still required. Conflicting payloads and stale sequences do not write. Newer deliberate seeking may move the saved position backward. Positions clamp without collapsing distinct request digests.

Default policy: opening min(30 seconds, 5% observed duration), completion max(95% duration, duration minus 30 seconds). Reports use integer milliseconds, duration up to twelve hours, and bounded client clock skew/delivery age. These rules also make the six-second playable sample resumable. Progress is not viewing proof or access authority.

Application ports require current owned-profile authorization and title-bound Playback context before new writes, outside the transaction. Acknowledgement requires the transaction result; state, receipt and v1 outbox intent share the callback. Cancellation, finite snapshots, profile-deletion tombstones, receipt/outbox bounds and ambiguous-commit replay are covered. Credentials, account and playback-session IDs are absent from the event payload; validated correlation/trace propagate to owner reads and events.

## Evidence and limitations

Node 24.19.0, pnpm 11.24.0, TypeScript 6.0.3 in the bounded Linux tooling container; base main 854592e5ff1213a306b45d61a547ad4f2a2d9395. [Source hashes](core-source.sha256) identify this later uncommitted checkpoint. [Focused output](core-tests.txt): strict build, 25 domain/application tests, scoped ESLint and architecture boundaries. Test transactions are controlled fakes proving orchestration/rollback intent, not PostgreSQL locking, actual durability or deployed authorization. Real SQL and network evidence must precede exposure.

The new workspace reuses existing exact TypeScript/Node types; no runtime dependency was added. Frozen installation and existing supply-chain policies pass. Local pnpm uses the same CI-mode virtual-store setting as its successful install; missing offline metadata was fetched normally, not bypassed or allowlisted.

Next: record private owner-read trust plus retention/limits, implement the isolated migration/repository, prove synchronized real-PostgreSQL concurrency and commit behavior, then wire the federated runtime. No whole-workspace candidate/protected release is claimed for this incomplete item.
