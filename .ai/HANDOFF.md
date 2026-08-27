# Handoff

Phase 00 is released. P01-R01, P01-R02, P01-R03, P01-R04, P01-R11, P01-R05, and P01-R06 are released on protected `main`.

P01-R06 was squash-merged through pull request 13 as `8dff9d8d57572b2eac944ae98406f3da2979682c`. Its nine focused telemetry tests, changed and exact clean 34/34 gates, audit, secret scan, two review remediations, resolved discussions, final review, protected closeout run `33012535152`, and exact post-merge run `33012664408` pass. A Collector, Prometheus scrape, dashboards, SLOs, product metrics, dependency adapters, and service composition remain outside that released item.

P01-R07 is released through pull request 14 squash `0dd4dad` and corrective pull request 15 squash `61226eb3ce4976e31edde1f8b8198bcdd10095a6`. Exact post-merge run `33026799005` passed. No product bounded context or durable data owner changed.

The Kafka decision remains deliberately two-stage. Clock/ID commit `2309f94`, PostgreSQL commit `1ded757`, Redis commit `f507c77`, S3 commit `353646e`, and Kafka commit `a932822` are coherent checkpoints. The broker selects provisional `kafkajs@2.2.4` after the current Confluent client exceeded the ten-second lifecycle budget in an isolated unavailable-broker spike. The repository-owned adapter provides bounded connect/metadata/keyed publish, one sequential at-least-once consumer, finite retries/capacity, telemetry, destructive ambiguous-generation recovery, and ordered lifecycle hooks with 21 focused tests passing after late-review remediation. P01-R09 must confirm every real dependency and replace KafkaJS before Phase 01 closeout if real-broker lifecycle or compatibility fails.

The first exact no-local checkout at `a932822` reused all 329 packages and passed 45 of 46 uncached tasks, but root type-aware lint raced the missing telemetry declaration build. Remediation `8361f11` makes `pnpm lint` prepare that declaration and makes the internal gate task explicitly depend on the telemetry build. Exact `8361f11` passes a frozen offline install, 46 of 46 uncached tasks, all four stable diagnostics, audit, secret scanning, clean Git, cleanup, and an independent cold standalone-lint clone.

The complete initial review at `37e6db8` found one bounded remediation batch. Source candidate `3e55990` now maps normal S3 not-found telemetry to success, safely rejects hostile S3 write input, prevents late Redis/Kafka completion from reviving closed state, waits active Kafka wrappers during close, and consumes broker records only through own data descriptors. Focused suites pass at S3 16/16, Redis 14/14, and Kafka 20/20. The affected graph passes 46/46 with 24 cached in 19.93 seconds elapsed; the forced complete graph passes 46/46 uncached in 33.42 seconds elapsed. Confirmation review found no blocker. Clean-checkout evidence remains applicable because no dependency, lockfile, workspace, export, declaration contract, install, bootstrap, or public command changed; lifecycle subprocess diagnostics were repeated in the affected and complete gates.

Pull request 14 published exact evidence head `811857b`. Hosted run `33023269145` passed classification, source quality, high-severity audit, documentation, memory, and security but failed Dependency review because transitive `bowser@2.14.1` was classified `MIT AND MITNFA`. ADR-0012 records the deliberate response: add only SPDX `MITNFA` to the reviewed allowlist, keep all scopes/vulnerability checks, preserve upstream notices, prohibit silent modified use, and freeze the rule locally. The 11 focused policy tests and 46/46 affected gate pass. Protected run `33023896325` then passed Dependency review, all other applicable jobs, and the stable aggregate at exact remediation head `f8aa6f8`. No dependency or adapter source changes.

P01-R08 is active on `feat/p01-r08-runtime-composition`, rebased onto corrective released `main`. Its delivery sequence is deadline and readiness contracts, one bounded recovery monitor, fixed health routes, minimum reference configuration, and a product-empty Identity composition root.

## Resume point

1. For P01-R08, implement the single non-overlapping recovery monitor over the green deadline/readiness contracts.
2. Run focused monitor cancellation, late-completion, scheduler-failure, and stop-before-close tests.
3. Continue to health/service composition without another full gate until the next combined candidate. Keep real dependency/container claims for P01-R09.

## Do not do yet

- Do not add a product schema, migration, repository, typed SQL library, account/profile/session behavior, GraphQL schema/resolver, cache key, TTL policy, Lua script, lease, rate limit, product event, outbox, replay workflow, media title, rights record, HLS publication, or CDN behavior.
- Do not add Identity product behavior, GraphQL, a schema/resolver, real dependency container proof, Collector, Prometheus, Grafana, Tempo, Loki, dashboard, alert, SLO, hosted resource, or final Docker evaluator command. P01-R08 may add only its planned local runtime composition, monitor, and fixed health routes.
- Do not expose vendor client types, endpoints, credentials, SQL, Redis commands/values, topics, buckets, object keys, payloads, signed URLs, error messages, or arbitrary identifiers through public declarations, logs, metrics, or stable errors.
- Do not treat preflight versions or fake-client tests as real dependency compatibility. Do not merge or close Dependabot pull request 1 without dedicated compatibility evidence and an authorized disposition.
