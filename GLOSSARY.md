# Glossary

**Aster**

The video-on-demand product defined by this repository.

**Asset**

A source or generated media file, such as a master video, HLS segment, subtitle, poster, or thumbnail.

**Bounded context**

A business boundary with its own model, language, rules, and data ownership.

**Catalog title**

The editorial representation of a film, including metadata, artwork, rights, and publication state.

**Circuit breaker**

A stateful resilience policy that temporarily blocks calls to a failing dependency.

**Continue-watching**

A read model of recent, resumable playback progress for a viewer profile.

**DataLoader**

A request-scoped batching and memoization mechanism used to avoid repeated backend reads during one GraphQL operation.

**Deadline**

The latest time by which an operation must finish. Deadlines include time already spent upstream.

**Degraded mode**

Useful behavior that remains available when an optional dependency is unavailable.

**Domain event**

A versioned statement that a business fact occurred.

**Engagement**

The bounded context that owns watchlists, playback progress, and viewing history.

**Entity representation**

The minimal reference used by Apollo Federation to resolve an entity across subgraphs.

**Error budget**

The amount of unreliability permitted by an SLO during its measurement window.

**Fencing token**

A monotonically increasing value used by a durable resource to reject stale lock holders.

**HLS**

HTTP Live Streaming, an adaptive media delivery format based on playlists and segments.

**Hydration**

The browser process that attaches React behavior to server-rendered output.

**Idempotency key**

A stable identifier that allows repeated delivery or retry without repeating an effect.

**Invariant**

A rule that must remain true across valid state transitions.

**N+1**

A query pattern where one initial read triggers one additional read per returned item.

**Outbox**

A database table written in the same transaction as domain state so events can be published reliably after commit.

**Playback session**

A short-lived authorization and telemetry context for watching a published title.

**Profile**

A viewer identity within an account, owning preferences and engagement state.

**Read model**

A data shape optimized for a query and derived from authoritative state.

**Redis lease**

A time-limited ownership claim used for coordination. It is not a durable lock unless the protected resource validates freshness.

**Rendition**

A generated media variant with a defined resolution, bitrate, codec, and packaging format.

**Request coalescing**

Combining concurrent requests for the same missing value so only one recomputation runs.

**SLI**

A measured indicator of service behavior, such as successful request ratio or latency.

**SLO**

A target for an SLI over a defined window.

**Stale-while-revalidate**

Serving a recently expired cached value while one worker refreshes it.

**Subgraph**

A GraphQL schema and resolver service contributing to the federated supergraph.

**Supergraph**

The composed GraphQL schema exposed through Apollo Router.

**Trusted operation**

A GraphQL operation known and approved by the service, usually identified by a hash.

**Viewer**

The person using a profile to browse and watch content.
