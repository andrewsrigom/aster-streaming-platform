# GraphQL Performance and Security

## Purpose

GraphQL allows clients to select shapes, which makes resource consumption part of the public contract. A secure graph bounds parsing, planning, execution, fan-out, dependency work, and result size.

No single limit is sufficient.

## 1. N+1

Example:

```graphql
query {
  titles(first: 100) {
    edges {
      node {
        id
        genres {
          name
        }
        progress(profileId: "...")
      }
    }
  }
}
```

Potential behavior:

```text
1 title query
100 genre queries
100 progress queries
```

DataLoader or set-based repositories reduce this:

```text
1 title query
1 genre query for all title IDs
1 progress query for all title IDs
```

### DataLoader rules

- one loader per request and authorization scope;
- stable key identity;
- bounded batch size;
- preserve key order;
- represent missing values;
- no hidden cross-request cache;
- collect batch-size and backend-query evidence.

Aster's dependent Phase13 closing candidate applies those rules to the complete
generated graph: 12 lists, 10 entity returns and 5 contributors have exact owner,
scope and bound records. Its representative disposable PostgreSQL observations
are TitleDetail 1 query, SearchTitles 3, HomePublic 5 and ContinueWatching 1. These
are constant-count checks at fixed workloads, not hosted latency objectives.
The concrete before/after remains the Phase08 twenty-pair comparison:20
sequential SELECTs versus 1 request-scoped batched SELECT. See the [Phase13
report](../../evidence/phase-13/query-count-authorization.txt) for commands,
plans, timings and limitations.

## 2. Pagination

Every list has a server maximum.

Keyset pagination is preferred for stable large collections:

```sql
WHERE (published_at, id) < ($cursorPublishedAt, $cursorId)
ORDER BY published_at DESC, id DESC
LIMIT $pageSizePlusOne
```

Cursors are opaque and versioned. Filter and sort changes need separate cursor semantics.

## 3. Depth

Depth limits prevent extreme recursive nesting, but shallow queries can still be expensive through aliases or large lists.

Example deep abuse:

```graphql
query {
  title(id: "1") {
    related {
      related {
        related {
          related {
            id
          }
        }
      }
    }
  }
}
```

## 4. Alias amplification

A shallow document can repeat expensive fields:

```graphql
query {
  a: search(query: "a", first: 100) { edges { node { id } } }
  b: search(query: "b", first: 100) { edges { node { id } } }
  c: search(query: "c", first: 100) { edges { node { id } } }
}
```

Set alias and root-field limits and include aliases in cost.

## 5. Parser and body limits

Resource use begins before execution.

Bound:

- HTTP body bytes;
- JSON depth if applicable;
- GraphQL tokens;
- variable count and size;
- operation count per document;
- batch count.

Reject early with a stable error and telemetry.

## 6. Complexity or cost

A field cost model estimates work:

```text
cost(search) = base + requestedPageSize × itemCost
cost(home.rails.items) = railCount × itemCount × nestedCost
cost(progress) = backendReadCost
```

Weights must be calibrated against traces, query counts, and latency.

Cost control does not replace:

- timeouts;
- concurrency limits;
- database bounds;
- DataLoader;
- rate limits.

## 7. Trusted operations

For first-party clients:

1. build operations from source;
2. normalize and hash;
3. publish a versioned manifest;
4. client sends trusted identifier;
5. router permits only approved operations in hosted environments.

Rollout must handle client versions:

- publish new operation before deploying client;
- retain old operation through compatibility window;
- observe usage;
- remove after safe expiry.

Development has an explicit controlled bypass, not an accidental production bypass.

## 8. Rate and concurrency

Rate limits control repeated traffic. Concurrency limits control simultaneous expensive work.

Partition by trusted identity and operation class. Keep anonymous fallback behind validated proxy context.

A viewer may reasonably send frequent progress mutations but should not run many simultaneous large searches.

## 9. Deadlines

The router sets an overall execution deadline. Subgraphs receive a smaller remaining budget. Dependencies receive attempt bounds within that budget.

A timeout response must not leave avoidable work running.

## 10. Authorization

GraphQL field visibility is not authorization.

Owner-side policy verifies:

- authenticated account;
- profile ownership;
- operator role;
- title state;
- allowed action;
- resource relationship.

Test identifier substitution:

```text
valid token for Account A
+ Profile B identifier
→ forbidden
```

Do not return a different cache entry simply because arguments look similar.

## 11. Introspection and errors

Environment policy controls introspection. Disabling it does not secure a graph by itself.

Public errors contain:

- stable code;
- safe message;
- correlation ID;
- retry hint where appropriate.

They do not contain stack, SQL, internal host, object key, token, or raw dependency error.

## 12. Response and cache safety

Response caching must include all authorization and variation dimensions:

- identity scope;
- profile;
- locale;
- operation;
- variables;
- publication or source version.

Public catalog responses may be shared. Profile progress responses may not.

In Aster's current Phase13 contract, GraphQL responses are deliberately never
shared: Router writes `Cache-Control: no-store`, every owner disables Apollo
response/document caches, DataLoader exists only for one request, and private
Apollo Client state is discarded with its session/profile boundary. Catalog and
Discovery retain only their separately versioned public owner caches. Every
trusted operation hash records the derived public/account/profile scope and
`no-store`, so a future operation fails composition if classification is missing
or weaker than its selected fields.

Identity profile mutation/selection rate limits run only after a current session
provides the authoritative account partition. A bounded local bucket absorbs
hot traffic; Redis coordinates replicas with pseudonymous, expiring keys.
Outage uses the local result and does not make Identity unready, while
cancellation and exhausted capacity fail closed. The actual profile command
revalidates authorization before writing.

## 13. Abuse-test suite

Include:

- oversized body;
- token-heavy document;
- deep nesting;
- alias amplification;
- repeated fragments;
- huge variables;
- maximum lists across nested fields;
- unknown persisted operation;
- rapid mutation attempts;
- concurrent expensive operations;
- cross-profile identifiers;
- malformed cursor;
- batching abuse.

Measure rejection stage and resource cost. A rejected request that consumes seconds of CPU is not a successful control.

Authorization acceptance must also execute at each data owner. Aster's Phase13
matrix covers identifier substitution, cross-profile access and role/private
transport escalation across Catalog, Discovery, Engagement, Identity and
Playback. A manifest reference is insufficient by itself: the complete owner
test suites run in the same candidate gate.
