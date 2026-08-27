# Phase 04 Evidence Index

Phase status: IN_PROGRESS. P04-R01/R04/R05/R08/R10 schema delivery is locally VERIFIED, including clean-source generation, nine focused tests and 55/55 candidate gates. Runtime requirements remain open.

- [Composition checkpoint](composition.txt): deterministic owner schema printers, five artifacts, twelve known operations, compatibility against committed baselines and negative tests.
- [Supergraph](../../infra/router/generated/supergraph.graphql), [public API](../../infra/router/generated/api.graphql), [ownership/hash manifest](../../infra/router/generated/manifest.json).
- [Commands, bounds and conventions](../../apps/router/README.md).
- Predecessor: [Phase 03 release](../phase-03/release.txt), PR 20 squash `1354841`, protected and post-merge CI passed.

P04-R02/R03/R06/R07/R09 still require actual Apollo Router deployment, private subgraph topology, trusted identity propagation, bounded runtime telemetry and partial-failure proof. No phase exit or playable demo is claimed.
