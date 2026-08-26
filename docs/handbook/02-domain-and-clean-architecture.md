# Domain Design and Clean Architecture

## Purpose

Architecture is useful when it protects product rules from transport, storage, and deployment choices. It becomes noise when every simple operation is wrapped in layers without a reason.

Aster uses DDD to establish language and ownership, and Clean Architecture to control dependencies inside each service.

## 1. Bounded context versus service

A bounded context is a model and language boundary. A service is a deployment boundary. They often align in Aster, but they are not synonyms.

Identity's `Profile` means an owned viewer identity. Engagement may reference a profile, but it does not redefine profile ownership. Catalog's `Title` owns publication and rights. Discovery ranks title references but does not own title truth.

The strongest boundary rule is data ownership:

> Only the owning context performs authoritative writes.

## 2. Layers

```text
domain
application
ports
adapters
```

### Domain

Contains rules that remain meaningful without PostgreSQL, Redis, GraphQL, or React.

Examples:

- whether a title can transition to `PUBLISHED`;
- whether a progress update is stale;
- whether a position counts as completed;
- whether an account can create another profile;
- how an attribution record is constructed from approved rights.

### Application

Coordinates a use case:

- load aggregate;
- authorize;
- call domain behavior;
- persist within a transaction;
- record outbox event;
- return a typed result.

### Ports

Describe required capabilities in domain language:

```ts
export interface ProgressRepository {
  find(
    profileId: ProfileId,
    titleId: TitleId,
    options: { signal: AbortSignal }
  ): Promise<PlaybackProgress | null>

  save(
    progress: PlaybackProgress,
    options: { transaction: Transaction }
  ): Promise<void>
}
```

### Adapters

Implement ports through PostgreSQL, Redis, broker, identity provider, object storage, GraphQL, or HTTP.

## 3. Example: progress aggregate

A useful aggregate protects ordering:

```ts
type RecordProgressCommand = {
  sessionId: string
  idempotencyKey: string
  sequence: number
  positionSeconds: number
  durationSeconds: number
  occurredAt: Date
}

type RecordProgressResult =
  | { status: "accepted"; progress: PlaybackProgress }
  | { status: "duplicate"; progress: PlaybackProgress }
  | { status: "stale"; progress: PlaybackProgress }
```

The domain should not know that PostgreSQL uses `ON CONFLICT`, that GraphQL uses a union, or that the player reports every fifteen seconds.

The application service decides transaction and idempotency flow. The database adapter enforces the same invariant durably under concurrency.

## 4. Aggregate boundaries

Use an aggregate when a consistency rule must hold in one transaction.

Examples:

- title and its publication state;
- profile and account profile limit coordination;
- progress for one profile-title pair.

Do not load a massive object graph merely because data is related. Credits, localizations, and artwork can have owner-controlled updates without making every title read a giant aggregate.

## 5. Value objects

A value object is useful when a primitive carries constraints or behavior:

- `PlaybackPosition`;
- `Runtime`;
- `Locale`;
- `LicenseReference`;
- `PublicationStatus`;
- `ProfileId`;
- `OperationCost`.

Avoid creating wrappers that add no validation, behavior, or clarity.

## 6. Domain events

A domain event states a fact after the aggregate changed:

```text
TitlePublished
ProgressRecorded
ProfileDeleted
```

It should not tell another context how to perform its work.

Bad:

```text
UpdateDiscoverySearchIndex
```

Better:

```text
TitlePublished
```

Discovery decides how that fact affects its projection.

## 7. Application result model

Expected outcomes should not become generic exceptions.

Examples:

- validation failure;
- stale update;
- profile limit reached;
- title not playable;
- rights not approved;
- conflict.

Unexpected infrastructure failures preserve cause internally and map to safe public errors at the transport boundary.

## 8. Transactions

The application use case owns transaction intent:

```text
authorize
→ load current state
→ decide domain transition
→ save aggregate
→ write outbox
→ commit
```

Do not call external services while holding locks. Gather required external facts before the transaction or use a durable workflow.

## 9. Avoiding architecture theater

Warning signs:

- one interface per class without alternate behavior or testing value;
- a repository around every table;
- a service per noun;
- generic `BaseEntity`, `BaseRepository`, or `BaseUseCase`;
- business decisions inside resolvers;
- shared domain entities across services;
- abstractions created for imagined future databases;
- events used to avoid a simple local function call.

The design should make a rule easier to find and test.

## 10. Aster implementation workflow

For a feature:

1. write the requirement and invariant;
2. name the owning context;
3. model the domain decision;
4. write pure tests;
5. define needed ports;
6. implement application orchestration;
7. implement adapters;
8. expose transport;
9. add boundary tests;
10. add telemetry and operational behavior.

This order is a guide, not a reason to delay thin vertical feedback. A small end-to-end slice should be completed early.
