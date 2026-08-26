# System Overview

## Architectural intent

Aster separates product ownership into five bounded contexts while exposing one application API through Apollo Federation v2. Media bytes follow a separate delivery path through object storage and a CDN.

The initial implementation is distributed enough to exercise real contracts and failure boundaries, but it avoids creating infrastructure without a product reason.

## Context view

```mermaid
flowchart TB
    Viewer[Viewer]
    Operator[Content operator]
    Web[Aster web application]
    API[Aster supergraph]
    IdP[Identity provider]
    MediaSource[Approved media source]
    MediaWorker[Isolated media worker]
    Catalog[Catalog]
    Storage[Object storage]
    CDN[CDN]
    Telemetry[Telemetry platform]

    Viewer --> Web
    Operator --> Web
    Web --> API
    Web --> IdP
    API --> IdP
    Operator --> MediaSource
    Catalog --> MediaWorker
    MediaSource --> MediaWorker
    MediaWorker --> Storage
    MediaWorker --> Catalog
    Web --> CDN
    CDN --> Storage
    API --> Telemetry
    Web --> Telemetry
```

## Container view

```mermaid
flowchart LR
    subgraph Client
      Web[Next.js web]
    end

    subgraph Edge
      CDN[CDN]
      Router[Apollo Router]
    end

    subgraph Subgraphs
      Identity[Identity and Profiles]
      Catalog[Catalog]
      Playback[Playback]
      Engagement[Engagement]
      Discovery[Discovery]
    end

    subgraph Async
      Broker[Kafka-compatible broker]
      MediaWorker[Media worker]
      OutboxRelays[Outbox relays]
    end

    subgraph Data
      Pg[(PostgreSQL)]
      Redis[(Redis)]
      Objects[(S3-compatible storage)]
    end

    subgraph Observability
      Collector[OpenTelemetry Collector]
      Metrics[Prometheus]
      Traces[Tempo]
      Logs[Loki]
      Dashboards[Grafana]
    end

    Web --> Router
    Web --> CDN
    Router --> Identity
    Router --> Catalog
    Router --> Playback
    Router --> Engagement
    Router --> Discovery

    Identity --> Pg
    Catalog --> Pg
    Playback --> Pg
    Engagement --> Pg
    Discovery --> Pg

    Identity --> Redis
    Catalog --> Redis
    Playback --> Redis
    Engagement --> Redis
    Discovery --> Redis

    Identity --> OutboxRelays
    Catalog --> OutboxRelays
    Playback --> OutboxRelays
    Engagement --> OutboxRelays
    Discovery --> OutboxRelays
    OutboxRelays --> Broker
    Broker --> Identity
    Broker --> Catalog
    Broker --> Playback
    Broker --> Engagement
    Broker --> Discovery
    Broker --> MediaWorker

    MediaWorker --> Objects
    CDN --> Objects

    Web --> Collector
    Router --> Collector
    Identity --> Collector
    Catalog --> Collector
    Playback --> Collector
    Engagement --> Collector
    Discovery --> Collector
    MediaWorker --> Collector
    Collector --> Metrics
    Collector --> Traces
    Collector --> Logs
    Dashboards --> Metrics
    Dashboards --> Traces
    Dashboards --> Logs
```

## Request paths

### Catalog page

```text
browser
→ Next.js server rendering
→ Apollo Router
→ Catalog subgraph
→ Redis cache
→ PostgreSQL on miss
→ composed response
→ HTML and Apollo snapshot
→ browser hydration
```

### Profile home

```text
browser
→ Apollo Router
→ parallel fetch plans
   → Catalog editorial rails
   → Engagement continue-watching
   → Discovery computed rails
→ partial or fallback response according to field semantics
```

### Playback start

```text
browser
→ Playback mutation
→ bounded current-publication check at Catalog, using a local projection only as an optimization
→ short-lived playback session
→ manifest URL
→ browser requests media through CDN
```

Video segments never flow through the GraphQL router or Node.js subgraphs.

If Catalog cannot confirm current publication state before the request deadline, Playback fails closed and does not issue a new session. Existing short-lived sessions follow their expiry policy.

### Progress update

```text
player
→ Engagement mutation
→ authorization
→ idempotency and monotonic sequence check
→ PostgreSQL transaction
→ outbox event
→ response
→ asynchronous projections and analytics
```

### Media publication

```text
approved rights record
→ source acquisition
→ immutable original
→ FFmpeg probe
→ rendition generation
→ HLS packaging
→ technical validation
→ immutable publication version
→ Catalog publication transaction
→ cache invalidation event
```

## Deployment units

Initial units:

- `web`
- `router`
- `identity-subgraph`
- `catalog-subgraph`
- `playback-subgraph`
- `engagement-subgraph`
- `discovery-subgraph`
- `media-worker`
- `outbox-relay` per context or a shared executable configured per owner
- local observability stack

Shared packages provide cross-cutting adapters and contracts. They do not contain shared domain models.

## Consistency model

- Account/profile ownership: strong within Identity.
- Title lifecycle and rights: strong within Catalog.
- Playback session creation: strongly checks a current publication view.
- Progress ordering: strong per profile and title.
- Watchlist mutation: strong and idempotent.
- Home rails: eventual and allowed to be stale within documented limits.
- Cross-context projections: eventual through events.
- Telemetry: best effort with bounded buffering.

## Availability priorities

1. Published media delivery
2. Playback-session creation
3. Catalog/title reads
4. Progress writes
5. Profile selection
6. Continue-watching
7. Search and home personalization
8. Administrative media workflows

Optional discovery behavior must not consume the availability budget of playback.

## Current versus scale-out architecture

The initial release may run all PostgreSQL schemas in one cluster, all Redis keyspaces in one deployment, and all services in one region. Ownership remains logical and enforced by credentials and code boundaries.

The scale-out documents describe evolution triggers. They are not claims about the initial deployment.
