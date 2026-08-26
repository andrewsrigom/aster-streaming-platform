# Skill: GraphQL and Federation

## Purpose

Keep the supergraph composable, bounded, secure, and efficient.

## Ownership

Each field has one authoritative owner. A subgraph may extend an entity only when it can resolve its contributed fields from the entity key and request context.

Do not mirror fields across subgraphs to avoid composition work.

## Entity design

Choose stable business identifiers. Avoid keys based on mutable labels, slugs, or database implementation details when a stable identifier exists.

Entity resolvers must:

- batch backend reads;
- preserve authorization;
- tolerate missing referenced entities;
- avoid recursive remote calls;
- emit trace attributes with bounded values.

## Resolver rules

Resolvers are adapters. They:

- validate GraphQL input shape;
- build application commands or queries;
- call one application use case;
- translate typed results and errors;
- do not contain SQL, Redis commands, business branching, or retry loops.

## N+1 prevention

Review every list field and entity extension.

- Use request-scoped DataLoader.
- Batch by owner and authorization scope.
- Preserve input order.
- represent missing rows explicitly.
- cap batch size.
- measure query count and latency.

DataLoader is not a cross-request cache.

## Schema design

- Prefer domain vocabulary.
- Use explicit nullability.
- Use connections or keyset pagination for unbounded collections.
- Set server-enforced page maximums.
- Avoid generic JSON when a stable schema can be defined.
- Version behavior through additive schema evolution where possible.
- Deprecate before removal.
- Do not expose persistence entities directly.

## Operation protection

Define and enforce:

- request-body limit;
- parser token limit;
- depth limit;
- alias limit;
- list and page limits;
- operation-cost budget;
- execution deadline;
- concurrency limit;
- rate limit;
- trusted-operation policy.

A cost score is useful only when field weights reflect actual work.

## Composition workflow

Every schema change runs:

1. local subgraph build;
2. supergraph composition;
3. breaking-change analysis;
4. operation compatibility checks;
5. resolver and authorization tests;
6. representative cost evaluation.

Record ownership and migration order for moved fields.
