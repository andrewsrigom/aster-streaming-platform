# Handoff

Phase 00 is released. P01-R01, P01-R02, P01-R03, P01-R04, P01-R11, P01-R05, and P01-R06 are released on protected `main`.

P01-R06 was squash-merged through pull request 13 as `8dff9d8d57572b2eac944ae98406f3da2979682c`. Its nine focused telemetry tests, changed and exact clean 34/34 gates, audit, secret scan, two review remediations, resolved discussions, final review, protected closeout run `33012535152`, and exact post-merge run `33012664408` pass. A Collector, Prometheus scrape, dashboards, SLOs, product metrics, dependency adapters, and service composition remain outside that released item.

P01-R07 is active on `feat/p01-r07-platform-adapters` from exact clean released head `8dff9d8`. Its owner is shared runtime and dependency-adapter infrastructure; no product bounded context or durable data owner changes. The active plan defines dependency-free system/fake clock and ID contracts followed by separate PostgreSQL, Redis, S3, and broker packages. Every vendor dependency stays behind repository-owned types with finite deadlines/capacity, caller cancellation, stable sanitized failures, telemetry, idempotent close, focused iteration gates, and an independent removal path.

The Kafka decision remains deliberately two-stage. Clock/ID commit `2309f94`, PostgreSQL commit `1ded757`, Redis commit `f507c77`, and S3 commit `353646e` are coherent checkpoints. The local broker candidate selects provisional `kafkajs@2.2.4` after the current Confluent client exceeded the ten-second lifecycle budget in an isolated unavailable-broker spike. The repository-owned adapter provides bounded connect/metadata/keyed publish, one sequential at-least-once consumer, finite retries/capacity, telemetry, destructive ambiguous-generation recovery, and ordered lifecycle hooks with 17 focused tests passing. P01-R09 must confirm every real dependency and replace KafkaJS before Phase 01 closeout if real-broker lifecycle or compatibility fails.

## Resume point

1. Commit the broker package, lockfile, documentation, memory, and evidence as one coherent checkpoint; its affected gate passes 46 of 46 tasks.
2. Run the first forced complete graph and exact clean-checkout proof now that all P01-R07 packages are stable, then perform the bounded initial review.
3. Keep every real-container interoperability claim for P01-R09; do not publish, merge, or release P01-R07 until its complete gate, review, protected CI, and closeout evidence pass.

## Do not do yet

- Do not add a product schema, migration, repository, typed SQL library, account/profile/session behavior, GraphQL schema/resolver, cache key, TTL policy, Lua script, lease, rate limit, product event, outbox, replay workflow, media title, rights record, HLS publication, or CDN behavior.
- Do not compose an Identity service, startup/readiness monitor, public health route, Collector, Prometheus, Grafana, Tempo, Loki, dashboard, alert, SLO, hosted resource, or final Docker evaluator command.
- Do not expose vendor client types, endpoints, credentials, SQL, Redis commands/values, topics, buckets, object keys, payloads, signed URLs, error messages, or arbitrary identifiers through public declarations, logs, metrics, or stable errors.
- Do not treat preflight versions or fake-client tests as real dependency compatibility. Do not merge or close Dependabot pull request 1 without dedicated compatibility evidence and an authorized disposition.
