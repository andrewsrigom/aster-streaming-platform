# Core Journey Reading Paths

Use this guide when the question starts with “how does Aster handle this whole
journey?” The [capability index](CAPABILITY_INDEX.md) is better for locating one
capability. Here, each path crosses the minimum set of owners needed to explain
an end-to-end behavior.

Read each path in the listed order: requirement, representative source, adverse
test, evidence, then operations. Run its check from the repository root after
the [frozen local install](../../README.md#bootstrap-a-fresh-checkout). These
checks use synthetic data, need no credentials or Docker, and do not publish,
download, or expose media.

## How to read the source comments

Comments are deliberately rare. Keep a comment when it explains why an
authorization, rights, retry, cancellation, durable-write, fallback, telemetry,
or external-system boundary exists. Read the adjacent test for the observable
behavior. A comment that merely translates the next statement is not part of
the learning path and should be removed or replaced with a clearer name.

## Public browse

Notice how the server-rendered public snapshot stays separate from private
profile state, and how malformed or failed GraphQL data never becomes an empty
successful page.

1. Requirement: [P05-R01](../specs/phase-05-web-ssr.md#p05-r01) and
   [Journey 1](../product/USER_JOURNEYS.md#journey-1-discover-and-start-a-film).
2. Source: [public snapshot projection](../../apps/web/lib/apollo/public-snapshot.ts)
   and [home composition](../../apps/web/features/discovery/home.tsx).
3. Adverse test: [public data boundaries](../../apps/web/test/public-data.test.ts)
   and [Discovery data boundaries](../../apps/web/test/discovery-data.test.ts).
4. Evidence: [SSR HTML](../../evidence/phase-05/ssr-html.txt) and
   [public runtime](../../evidence/phase-05/public-runtime.txt).
5. Operations: [Web guide](../../apps/web/README.md).

```sh
node --test ./apps/web/test/public-data.test.ts ./apps/web/test/discovery-data.test.ts
```

## Rights-safe publication

Notice that rights approval, technical media readiness, and final publication
are separate gates, with rights revalidated before activation and rollback.

1. Requirement: [P06-R01](../specs/phase-06-media-pipeline.md#p06-r01),
   [P06-R10](../specs/phase-06-media-pipeline.md#p06-r10), and
   [Journey 4](../product/USER_JOURNEYS.md#journey-4-publish-a-title).
2. Source: [Catalog command flow](../../services/catalog/src/application/commands.ts)
   and [media-processing admission](../../services/catalog/src/application/process-media.ts).
3. Adverse test: [rights-aware workflow](../../services/catalog/test/catalog-workflow.test.ts)
   and [publication rollback](../../services/catalog/test/publication-rollback.test.ts).
4. Evidence: [Phase 06 release](../../evidence/phase-06/release.md).
5. Operations: [Catalog guide](../../services/catalog/README.md) and
   [publication guide](../../services/catalog/MEDIA_PUBLICATION.md).

```sh
pnpm exec turbo run build --filter=@aster/catalog
node --test ./services/catalog/dist/test/catalog-workflow.test.js ./services/catalog/dist/test/publication-rollback.test.js
```

The [draft request](../../services/catalog/examples/create-draft.json) is an
executable operator input but deliberately contains unresolved rights, so it
cannot be approved. The first-film media and publication payloads record a
dated historical workflow; they are not safe replay commands or new evidence of
current rights. The bounded tests above are the safe learning example.

## Playback

Notice the owner-authoritative Catalog lookup, the one non-retried session
write, the uncertain-write boundary, and client disposal that prevents a late
session from attaching stale media.

1. Requirement: [P07-R01](../specs/phase-07-playback.md#p07-r01),
   [P07-R10](../specs/phase-07-playback.md#p07-r10), and
   [Journey 1](../product/USER_JOURNEYS.md#journey-1-discover-and-start-a-film).
2. Source: [session creation](../../services/playback/src/application/create-session.ts)
   and [Web player flow](../../apps/web/features/playback/player.tsx).
3. Adverse test: [session failure boundaries](../../services/playback/test/create-session.test.ts)
   [client disposal and response validation](../../apps/web/test/playback-state.test.ts),
   and [browser playback states](../../apps/web/test/browser/playback.spec.ts).
4. Evidence: [Phase 07 release](../../evidence/phase-07/release.md).
5. Operations: [playback guide](../../apps/web/PLAYBACK.md).

```sh
pnpm exec turbo run build --filter=@aster/playback
node --test ./services/playback/dist/test/create-session.test.js
node --test ./apps/web/test/playback-state.test.ts
```

## Profile progress

Notice that fresh profile ownership precedes replay/admission, and that progress,
receipt, and outbox writes become durable atomically. An uncertain response is
replayed only with the identical key and payload.

1. Requirement: [P08-R01](../specs/phase-08-engagement.md#p08-r01),
   [P08-R03](../specs/phase-08-engagement.md#p08-r03),
   [P08-R04](../specs/phase-08-engagement.md#p08-r04), and
   [Journey 2](../product/USER_JOURNEYS.md#journey-2-resume-viewing).
2. Source: [progress recording](../../services/engagement/src/application/record-progress.ts).
3. Adverse test: [progress authorization, replay, and atomicity](../../services/engagement/test/record-progress.test.ts).
4. Evidence: [Phase 08 release](../../evidence/phase-08/release.md).
5. Operations: [Engagement guide](../../services/engagement/README.md).

```sh
pnpm exec turbo run build --filter=@aster/engagement
node --test ./services/engagement/dist/test/record-progress.test.js
```

## Discovery degradation

Notice that rail selections fail independently, safe recent-content fallback is
explicit, stale cache use stays rights-bounded, and Redis loss returns to the
PostgreSQL source instead of changing authority.

1. Requirement: [P09-R03](../specs/phase-09-discovery.md#p09-r03),
   [P09-R08](../specs/phase-09-discovery.md#p09-r08), and
   [P10-R04](../specs/phase-10-redis.md#p10-r04).
2. Source: [home-rail assembly](../../services/discovery/src/application/home-rails.ts)
   and [home-cache policy](../../services/discovery/src/application/home-cache.ts).
3. Adverse test: [independent rail failures](../../services/discovery/test/home-rails.test.ts)
   and [stale cache and Redis loss](../../services/discovery/test/home-cache.test.ts).
4. Evidence: [Discovery Web release](../../evidence/phase-09/web-discovery-release.md)
   and [stale-cache release](../../evidence/phase-10/discovery-swr-release.txt).
5. Operations: [Discovery guide](../../services/discovery/README.md).

```sh
pnpm exec turbo run build --filter=@aster/discovery
node --test ./services/discovery/dist/test/home-rails.test.js ./services/discovery/dist/test/home-cache.test.js
```

## GraphQL admission

Notice the fail-closed sequence from bounded parsing and known-operation policy
through depth, alias, list expansion, and weighted-cost calculation. Admission
does not replace authorization in the owning service.

1. Requirement: [P13-R03](../specs/phase-13-graphql-performance-security.md#p13-r03),
   [P13-R06](../specs/phase-13-graphql-performance-security.md#p13-r06), and
   [P13-R07](../specs/phase-13-graphql-performance-security.md#p13-r07).
2. Source: [demand analysis](../../apps/router/src/demand.ts) and
   [Router runtime policy](../../infra/router/router.yaml),
   [profile-operation limiter](../../services/identity/src/infrastructure/profile-operation-limiter.ts),
   and [request-scoped Catalog batching](../../services/catalog/src/transport/catalog-schema.ts).
3. Adverse test: [amplification and policy coverage](../../apps/router/test/demand.test.ts),
   [runtime policy enforcement](../../tools/verify-router-runtime.test.mjs),
   [identity-aware admission](../../services/identity/test/profile-operation-limiter.test.ts),
   [request-scoped batching](../../services/catalog/test/catalog-subgraph.test.ts),
   and [federated query-count bounds](../../tools/graphql-query-count-proof.test.mjs).
4. Evidence: [Phase 13 release](../../evidence/phase-13/release.md).
5. Operations: [Router guide](../../apps/router/README.md).

```sh
pnpm exec turbo run build --filter=@aster/router
node --test ./apps/router/dist/test/demand.test.js ./services/identity/dist/test/profile-operation-limiter.test.js ./services/catalog/dist/test/catalog-subgraph.test.js
node --test ./tools/verify-router-runtime.test.mjs ./tools/graphql-query-count-proof.test.mjs
```

## Dependency recovery

Notice that one deadline covers bounded attempts and backoff, only selected
safe reads retry, circuit breakers own independent operation state, and
observers cannot change the dependency outcome.

1. Requirement: [P11-R02](../specs/phase-11-resilience.md#p11-r02),
   [P11-R03](../specs/phase-11-resilience.md#p11-r03),
   [P11-R08](../specs/phase-11-resilience.md#p11-r08), and
   [Journey 5](../product/USER_JOURNEYS.md#journey-5-operate-during-a-dependency-failure).
2. Source: [safe-read policy](../../packages/runtime/src/safe-read.ts),
   [circuit breaker](../../packages/runtime/src/circuit-breaker.ts), and
   [failure laboratory](../../tools/failure-lab.ts).
3. Adverse test: [deadline and retry tests](../../packages/runtime/test/safe-read.test.ts),
   [breaker state tests](../../packages/runtime/test/circuit-breaker.test.ts), and
   [failure injection tests](../../tools/failure-lab.test.ts).
4. Evidence: [Phase 11 game days](../../evidence/phase-11/game-days.md).
5. Operations: [failure runbooks](../operations/RUNBOOKS.md).

```sh
pnpm exec turbo run build --filter=@aster/runtime
node --test ./packages/runtime/dist/test/safe-read.test.js ./packages/runtime/dist/test/circuit-breaker.test.js
pnpm failure-lab:test
```

## Telemetry-led diagnosis

Notice that bounded metrics and traces help distinguish the failed boundary,
while exporter or observer failure remains non-authoritative and cannot change
the product response.

1. Requirement: [P12-R01](../specs/phase-12-observability.md#p12-r01),
   [P12-R08](../specs/phase-12-observability.md#p12-r08), and
   [P12-R10](../specs/phase-12-observability.md#p12-r10).
2. Source: [telemetry composition](../../packages/telemetry/src/infrastructure/create-telemetry.ts)
   and [diagnostic exercises](../../tools/run-diagnostic-exercises.mjs).
3. Adverse test: [telemetry contract](../../packages/telemetry/test/telemetry-contract.test.ts)
   and [diagnostic exercise policy](../../tools/run-diagnostic-exercises.test.mjs).
4. Evidence: [failure diagnosis](../../evidence/phase-12/failure-diagnosis.md).
5. Operations: [operational overview](../operations/OPERATIONAL_OVERVIEW.md).

```sh
pnpm exec turbo run build --filter=@aster/telemetry
node --test ./packages/telemetry/dist/test/telemetry-contract.test.js
pnpm diagnostics:test
```

## What these checks prove

They prove the focused source behavior against deterministic fixtures. The
linked evidence records the broader integration, browser, media, database, or
failure-injection acceptance already completed for that phase. Neither the
focused checks nor local Docker imply a hosted release, production capacity, a
commercial catalog, or rights beyond the reviewed records.
