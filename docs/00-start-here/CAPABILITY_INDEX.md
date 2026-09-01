# Capability Index

Use this index when the question starts with “where is this behavior implemented?” Each row
connects one capability to its owning requirement, representative source, an adverse test,
recorded evidence, and the operational guide that explains how to exercise or diagnose it.

The index is intentionally selective. It points to the smallest useful entry point instead of
listing every supporting file. Follow imports and adjacent tests from that entry point when a
deeper investigation is needed.

## Status vocabulary

`Released` is the canonical maturity label for rows whose owning phase completed its documented
local release process and has checked-in evidence. It does not mean that Aster has a hosted or
public deployment. Phase 14
reference-quality work uses `verified` when its acceptance checks pass because it improves the
repository without deploying the product.

## Capability-to-proof matrix

| ID | Capability | Owner | Requirement | Status | Implementation | Adverse test | Evidence | Operations |
|---|---|---|---|---|---|---|---|---|
| identity-profiles | Profile ownership and lifecycle | Identity and Profiles | [P02-R03](../specs/phase-02-identity-profiles.md#p02-r03), [P02-R10](../specs/phase-02-identity-profiles.md#p02-r10) | released | [Profile application service](../../services/identity/src/application/profiles.ts) | [Profile authorization and failure tests](../../services/identity/test/profiles.test.ts) | [Phase 02 release](../../evidence/phase-02/release.txt) | [Identity guide](../../services/identity/README.md) |
| catalog | Rights-aware title lifecycle | Catalog | [P03-R04](../specs/phase-03-catalog-rights.md#p03-r04), [P03-R10](../specs/phase-03-catalog-rights.md#p03-r10) | released | [Catalog commands](../../services/catalog/src/application/commands.ts) | [Editorial workflow and rights tests](../../services/catalog/test/catalog-workflow.test.ts) | [Phase 03 release](../../evidence/phase-03/release.txt) | [Catalog guide](../../services/catalog/README.md) |
| playback | Owner-authoritative playback sessions | Playback | [P07-R01](../specs/phase-07-playback.md#p07-r01), [P07-R10](../specs/phase-07-playback.md#p07-r10) | released | [Playback session creation](../../services/playback/src/application/create-session.ts), [Web player interaction](../../apps/web/features/playback/player.tsx) | [Timeout, cancellation, and stale-publication tests](../../services/playback/test/create-session.test.ts), [Browser playback adverse states](../../apps/web/test/browser/playback.spec.ts) | [Phase 07 release](../../evidence/phase-07/release.md) | [Playback service guide](../../services/playback/README.md) |
| engagement | Profile-owned progress and replay | Engagement | [P08-R01](../specs/phase-08-engagement.md#p08-r01), [P08-R04](../specs/phase-08-engagement.md#p08-r04) | released | [Progress recording](../../services/engagement/src/application/record-progress.ts) | [Replay, authorization, and atomicity tests](../../services/engagement/test/record-progress.test.ts) | [Phase 08 release](../../evidence/phase-08/release.md) | [Engagement guide](../../services/engagement/README.md) |
| discovery | Independent cached home rails | Discovery | [P09-R03](../specs/phase-09-discovery.md#p09-r03), [P09-R08](../specs/phase-09-discovery.md#p09-r08) | released | [Home-rail cache policy](../../services/discovery/src/application/home-cache.ts) | [Stale data, corruption, and Redis-loss tests](../../services/discovery/test/home-cache.test.ts) | [Phase 09 Web and Discovery release](../../evidence/phase-09/web-discovery-release.md) | [Discovery guide](../../services/discovery/README.md) |
| router-graphql | Bounded federated GraphQL execution | Router | [P13-R03](../specs/phase-13-graphql-performance-security.md#p13-r03), [P13-R06](../specs/phase-13-graphql-performance-security.md#p13-r06), [P13-R07](../specs/phase-13-graphql-performance-security.md#p13-r07) | released | [GraphQL demand policy](../../apps/router/src/demand.ts), [Catalog request-scoped DataLoader](../../services/catalog/src/transport/catalog-schema.ts) | [Amplification and policy-coverage tests](../../apps/router/test/demand.test.ts), [Federated query-count proof](../../tools/graphql-query-count-proof.test.mjs) | [Phase 13 release](../../evidence/phase-13/release.md) | [Router guide](../../apps/router/README.md) |
| web-accessibility | Accessible Web interaction states | Web | [P05-R05](../specs/phase-05-web-ssr.md#p05-r05), [P05-R10](../specs/phase-05-web-ssr.md#p05-r10) | released | [Profile-dialog states](../../apps/web/features/identity/dialog.tsx) | [Browser accessibility states](../../apps/web/test/browser/accessibility.spec.ts) | [Phase 09 Web and Discovery release](../../evidence/phase-09/web-discovery-release.md) | [Web guide](../../apps/web/README.md) |
| media | Rights-gated media processing | Catalog | [P06-R01](../specs/phase-06-media-pipeline.md#p06-r01), [P06-R10](../specs/phase-06-media-pipeline.md#p06-r10) | released | [Catalog media-processing policy](../../services/catalog/src/application/process-media.ts) | [Rights-gate PostgreSQL test](../../services/catalog/test/integration/processing-postgres.ts) | [Phase 06 release](../../evidence/phase-06/release.md) | [Media publication guide](../../services/catalog/MEDIA_PUBLICATION.md) |
| resilience | Deadline-budgeted safe reads | Runtime | [P11-R02](../specs/phase-11-resilience.md#p11-r02), [P11-R03](../specs/phase-11-resilience.md#p11-r03), [P11-R08](../specs/phase-11-resilience.md#p11-r08) | released | [Safe-read policy](../../packages/runtime/src/safe-read.ts), [Failure laboratory](../../tools/failure-lab.ts) | [Retry, deadline, and hostile-input tests](../../packages/runtime/test/safe-read.test.ts), [Failure-laboratory injection tests](../../tools/failure-lab.test.ts) | [Phase 11 game days](../../evidence/phase-11/game-days.md) | [Failure runbooks](../operations/RUNBOOKS.md) |
| observability | Bounded metrics, traces, and exporter health | Telemetry | [P12-R01](../specs/phase-12-observability.md#p12-r01), [P12-R08](../specs/phase-12-observability.md#p12-r08), [P12-R09](../specs/phase-12-observability.md#p12-r09) | released | [Telemetry composition](../../packages/telemetry/src/infrastructure/create-telemetry.ts) | [Cardinality, trace, and exporter-failure tests](../../packages/telemetry/test/telemetry-contract.test.ts) | [Phase 12 failure diagnosis](../../evidence/phase-12/failure-diagnosis.md) | [Operational overview](../operations/OPERATIONAL_OVERVIEW.md) |
| repository-workflows | Bounded local and protected quality gates | Repository governance | [P00-R05](../specs/phase-00-foundation.md#p00-r05), [P00-R06](../specs/phase-00-foundation.md#p00-r06), [P00-R08](../specs/phase-00-foundation.md#p00-r08), [P00-R10](../specs/phase-00-foundation.md#p00-r10) | released | [Quality-gate runner](../../tools/run-quality-gate.ts) | [Selection, timeout, and process-tree tests](../../tools/run-quality-gate.test.ts) | [Phase 00 clean-checkout closeout](../../evidence/phase-00/clean-checkout-closeout.txt) | [Repository governance](../operations/REPOSITORY_GOVERNANCE.md) |

## How to follow a row

1. Read the linked requirement to understand the promised behavior and acceptance boundary.
2. Open the implementation entry point and follow only the imports relevant to the question.
3. Read the adverse test to see what must fail closed, degrade safely, or remain bounded.
4. Use the evidence to distinguish a measured result from a design intention.
5. Use the operational guide to run, inspect, recover, or clean up the capability locally.

The phase specifications remain authoritative for complete acceptance. This index is a navigation
surface and cannot expand a requirement, transfer data ownership, or substitute for current
evidence.
