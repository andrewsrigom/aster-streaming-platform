# Apollo Federation v2

## Purpose

Federation lets Aster expose one graph while each bounded context owns its fields and behavior. The important skill is not directive memorization. It is designing ownership so a query plan does useful bounded work.

## 1. Supergraph model

Each subgraph publishes a schema. Composition produces a supergraph schema and routing metadata. Apollo Router plans and executes operations across subgraphs.

```text
client operation
→ router validates and plans
→ parallel or sequential subgraph fetches
→ entity representations exchanged
→ response composed
```

The router does not eliminate network cost. A poor schema can create serial fetch chains and large representation sets.

## 2. Entities

Catalog owns `Title`:

```graphql
type Title @key(fields: "id") {
  id: ID!
  name: String!
  synopsis: String!
  publication: MediaPublication
}
```

Engagement contributes profile-specific fields:

```graphql
extend type Title @key(fields: "id") {
  id: ID! @external
  progress(profileId: ID!): PlaybackProgress
  inWatchlist(profileId: ID!): Boolean!
}
```

The Engagement entity resolver receives title representations and batches its owned data. It does not call Catalog again for fields already represented or owned there.

## 3. Keys

A key should be:

- stable;
- globally meaningful inside the graph;
- available to extending subgraphs;
- authorization-safe;
- efficient to batch.

Avoid mutable slugs as the sole key when a stable ID exists.

Multiple keys can support migration or alternate resolution, but each adds contract complexity.

## 4. Common Federation v2 directives

### `@key`

Defines an entity identity.

### `@external`

Marks a field owned elsewhere and used by an extending subgraph under applicable schema style.

### `@requires`

States that a contributed field needs additional entity fields.

Use it when the extending subgraph genuinely needs owner-provided values. It can add query-plan dependencies, so inspect the plan.

### `@provides`

Allows a field resolver to supply fields owned elsewhere in a specific path. Use sparingly; incorrect use can make ownership and freshness confusing.

### `@shareable`

Allows multiple subgraphs to resolve a value under Federation rules. Share only values that are semantically identical and consistently maintained.

### `@override`

Supports a controlled field-ownership migration. It is a rollout tool, not a permanent substitute for clear ownership.

### `@inaccessible`

Keeps supporting schema elements available for composition while hiding them from the public API.

Directive availability and syntax must match the selected Federation version and official documentation at implementation time.

## 5. Entity resolution and N+1

A naïve resolver:

```text
for each title representation
  query progress
```

creates N+1.

A request-scoped loader:

```text
loadMany(profileId, titleIds)
→ one bounded query
→ map by title ID
→ return in representation order
```

Authorization scope belongs in the loader key or loader instance. Never reuse one user's loader cache for another.

## 6. Query-plan reasoning

Consider:

```graphql
query Home($profileId: ID!) {
  home(profileId: $profileId) {
    rails {
      items {
        title {
          id
          name
          progress(profileId: $profileId) {
            positionSeconds
          }
        }
      }
    }
  }
}
```

Possible plan:

1. Discovery resolves ranked title references.
2. Catalog resolves title metadata.
3. Engagement resolves progress for title IDs.

Questions:

- Can Catalog and Engagement run in parallel after IDs exist?
- How many representations are sent?
- Is the rail item limit bounded?
- Does Engagement batch?
- Does each field recheck profile ownership efficiently?
- What happens when Engagement fails?
- Does nullability preserve the rest of the rail?

Query-plan inspection is part of schema review.

## 7. Nullability and partial failure

GraphQL null bubbling can turn one field failure into a larger null result.

Use non-null when absence is truly invalid for the contract. Do not mark optional dependency fields non-null merely for client convenience.

For a home rail, an optional `personalizationReason` can be nullable. A title's stable `id` should not be nullable.

Typed payloads help clients distinguish expected mutation outcomes without relying on exception text.

## 8. Ownership migration

A field move uses a staged sequence:

1. new owner can resolve equivalent field;
2. schemas compose with migration directive or temporary compatibility;
3. router traffic shifts according to supported mechanism;
4. telemetry compares results;
5. old owner stops resolving;
6. obsolete support fields are removed later.

Do not change ownership in one release without compatibility planning.

## 9. Router responsibilities

Aster uses the router for:

- public GraphQL edge;
- supergraph execution;
- request and operation limits;
- identity-context propagation;
- traffic shaping;
- subgraph deadlines;
- trusted-operation enforcement;
- telemetry.

Owner-side authorization and domain validation remain in subgraphs.

## 10. Federation review checklist

- one authoritative field owner;
- stable entity key;
- bounded representation count;
- request-scoped batching;
- owner-side authorization;
- inspected query plan;
- sensible nullability;
- dependency failure behavior;
- schema composition;
- known-operation compatibility;
- telemetry by operation and subgraph.
