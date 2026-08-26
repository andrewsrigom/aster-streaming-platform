# Handoff

Phase 00 is released. P01-R01, P01-R02, P01-R03, P01-R04, P01-R11, P01-R05, and P01-R06 are released on protected `main`.

P01-R06 was squash-merged through pull request 13 as `8dff9d8d57572b2eac944ae98406f3da2979682c`. Its nine focused telemetry tests, changed and exact clean 34/34 gates, audit, secret scan, two review remediations, resolved discussions, final review, protected closeout run `33012535152`, and exact post-merge run `33012664408` pass. A Collector, Prometheus scrape, dashboards, SLOs, product metrics, dependency adapters, and service composition remain outside that released item.

P01-R07 is active on `feat/p01-r07-platform-adapters` from exact clean released head `8dff9d8`. Its owner is shared runtime and dependency-adapter infrastructure; no product bounded context or durable data owner changes. The active plan defines dependency-free system/fake clock and ID contracts followed by separate PostgreSQL, Redis, S3, and broker packages. Every vendor dependency stays behind repository-owned types with finite deadlines/capacity, caller cancellation, stable sanitized failures, telemetry, idempotent close, focused iteration gates, and an independent removal path.

The Kafka decision is deliberately two-stage. P01-R07 may implement one provisional client only after current install, lifecycle, deadline, redaction, license, dependency-cost, and removal evidence. P01-R09 must confirm it against a real broker and replace it before Phase 01 closeout if bounded stop fails. Clock/ID commit `2309f94` has 46 passing runtime tests. PostgreSQL commit `1ded757` exact-pins `pg@8.23.0` behind a bounded vendor-free contract. The local Redis candidate exact-pins `@redis/client@6.2.1`, disables offline queueing, caps commands/reconnect, replaces ambiguous command generations, exposes no generic command or cache policy, and passes 13 focused tests plus its refused-loopback diagnostic. Real PostgreSQL and Redis compatibility remain P01-R09.

## Resume point

1. Commit the green Redis package, lockfile, documentation, memory, and evidence as one coherent checkpoint; 13 focused tests and 40 of 40 affected tasks pass.
2. Confirm the newest release-age-eligible AWS S3 client and lib-storage versions, exact abort/stream/checksum behavior, dependency graph, and exit path before implementing the bounded streaming adapter.
3. Perform the explicit Kafka candidate install/lifecycle comparison before the provisional broker package.
4. Keep every real-container interoperability claim for P01-R09 and run the first forced complete graph only when all P01-R07 packages stabilize.

## Do not do yet

- Do not add a product schema, migration, repository, typed SQL library, account/profile/session behavior, GraphQL schema/resolver, cache key, TTL policy, Lua script, lease, rate limit, product event, outbox, replay workflow, media title, rights record, HLS publication, or CDN behavior.
- Do not compose an Identity service, startup/readiness monitor, public health route, Collector, Prometheus, Grafana, Tempo, Loki, dashboard, alert, SLO, hosted resource, or final Docker evaluator command.
- Do not expose vendor client types, endpoints, credentials, SQL, Redis commands/values, topics, buckets, object keys, payloads, signed URLs, error messages, or arbitrary identifiers through public declarations, logs, metrics, or stable errors.
- Do not treat preflight versions or fake-client tests as real dependency compatibility. Do not merge or close Dependabot pull request 1 without dedicated compatibility evidence and an authorized disposition.
