# Handoff

Phase 00 is released. P01-R01, P01-R02, P01-R03, P01-R04, P01-R11, P01-R05, and P01-R06 are released on protected `main`.

P01-R06 was squash-merged through pull request 13 as `8dff9d8d57572b2eac944ae98406f3da2979682c`. Its nine focused telemetry tests, changed and exact clean 34/34 gates, audit, secret scan, two review remediations, resolved discussions, final review, protected closeout run `33012535152`, and exact post-merge run `33012664408` pass. A Collector, Prometheus scrape, dashboards, SLOs, product metrics, dependency adapters, and service composition remain outside that released item.

P01-R07 is active on `feat/p01-r07-platform-adapters` from exact clean released head `8dff9d8`. Its owner is shared runtime and dependency-adapter infrastructure; no product bounded context or durable data owner changes. The active plan defines dependency-free system/fake clock and ID contracts followed by separate PostgreSQL, Redis, S3, and broker packages. Every vendor dependency stays behind repository-owned types with finite deadlines/capacity, caller cancellation, stable sanitized failures, telemetry, idempotent close, focused iteration gates, and an independent removal path.

The Kafka decision remains deliberately two-stage. Clock/ID commit `2309f94`, PostgreSQL commit `1ded757`, Redis commit `f507c77`, S3 commit `353646e`, and Kafka commit `a932822` are coherent checkpoints. The broker selects provisional `kafkajs@2.2.4` after the current Confluent client exceeded the ten-second lifecycle budget in an isolated unavailable-broker spike. The repository-owned adapter provides bounded connect/metadata/keyed publish, one sequential at-least-once consumer, finite retries/capacity, telemetry, destructive ambiguous-generation recovery, and ordered lifecycle hooks with 20 focused tests passing after review remediation. P01-R09 must confirm every real dependency and replace KafkaJS before Phase 01 closeout if real-broker lifecycle or compatibility fails.

The first exact no-local checkout at `a932822` reused all 329 packages and passed 45 of 46 uncached tasks, but root type-aware lint raced the missing telemetry declaration build. Remediation `8361f11` makes `pnpm lint` prepare that declaration and makes the internal gate task explicitly depend on the telemetry build. Exact `8361f11` passes a frozen offline install, 46 of 46 uncached tasks, all four stable diagnostics, audit, secret scanning, clean Git, cleanup, and an independent cold standalone-lint clone.

The complete initial review at `37e6db8` found one bounded remediation batch. Source candidate `3e55990` now maps normal S3 not-found telemetry to success, safely rejects hostile S3 write input, prevents late Redis/Kafka completion from reviving closed state, waits active Kafka wrappers during close, and consumes broker records only through own data descriptors. Focused suites pass at S3 16/16, Redis 14/14, and Kafka 20/20. The affected graph passes 46/46 with 24 cached in 19.93 seconds elapsed; the forced complete graph passes 46/46 uncached in 33.42 seconds elapsed. Confirmation review found no blocker. Clean-checkout evidence remains applicable because no dependency, lockfile, workspace, export, declaration contract, install, bootstrap, or public command changed; lifecycle subprocess diagnostics were repeated in the affected and complete gates.

## Resume point

1. For P01-R07, commit the consolidated review evidence without changing source behavior, then push the branch once and open one pull request.
2. Wait for protected CI on the exact evidence head, treat only requirement/security/data/availability/lifecycle/public-contract blockers, and squash-merge when the required check passes.
3. Verify the exact post-merge `main` run, record the release, then activate P01-R08 from clean released `main`. Keep every real-container interoperability claim for P01-R09.

## Do not do yet

- Do not add a product schema, migration, repository, typed SQL library, account/profile/session behavior, GraphQL schema/resolver, cache key, TTL policy, Lua script, lease, rate limit, product event, outbox, replay workflow, media title, rights record, HLS publication, or CDN behavior.
- Do not compose an Identity service, startup/readiness monitor, public health route, Collector, Prometheus, Grafana, Tempo, Loki, dashboard, alert, SLO, hosted resource, or final Docker evaluator command.
- Do not expose vendor client types, endpoints, credentials, SQL, Redis commands/values, topics, buckets, object keys, payloads, signed URLs, error messages, or arbitrary identifiers through public declarations, logs, metrics, or stable errors.
- Do not treat preflight versions or fake-client tests as real dependency compatibility. Do not merge or close Dependabot pull request 1 without dedicated compatibility evidence and an authorized disposition.
