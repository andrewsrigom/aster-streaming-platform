# ADR-0017: Local Router Transport Trust

- Status: Accepted
- Date: 2026-08-27
- Owners: Platform transport, Identity and Catalog
- Related requirements: P04-R02, P04-R03, P04-R06, P04-R07, P04-R09

## Decision

Use unmodified Apollo Router 2.17.0 with the committed supergraph, source-owned YAML and bounded Rhai hooks. Pin the multi-platform image to `sha256:b4e70cbcff5a5c3a8825aa2b201257b57a2052bbe2d7751e74d129ebaa09ffe6`. The inspected Linux amd64 manifest is `sha256:2cfe0d94971eacecd16c70a81ac3515f08df5d2e590a26dceb6ee93bce50c403`. No GraphOS account, key, hosted schema fetch or paid feature is required. Startup against this exact image is a required compatibility check, not implied by the decision.

The normal local topology will publish only Router on `127.0.0.1:4000`. Identity and Catalog remain on the private Compose network. Their HTTP health endpoints remain internal. Explicit standalone diagnostic configuration retains earlier owner tests; it is not the federated demo topology.

A finite initializer will create a separate random 256-bit credential for each owner in disposable local mounts. Router reads both; each owner receives only its own. Credentials are not committed, passed as command arguments, printed or sent to clients. They authenticate Router transport, not accounts, profiles, roles or operators. Constant-time owner checks require exactly one credential header and the expected internal Host. Missing or malformed files fail startup closed. Local credentials last for this stack's lifetime; rotation recreates the ephemeral material and restarts Router and both consumers together. Short-lived hosted service identity and TLS remain Phase 14 requirements; do not deploy this local HTTP credential mode publicly.

The public edge requires exact Host/Origin, POST `/graphql`, JSON and `x-aster-csrf: 1`; it rejects duplicate/security-sensitive headers and public identity/forwarding claims. Router inserts its private credential rather than forwarding a caller's value. Only the Identity route receives the session cookie. Only Identity may contribute a session Set-Cookie response. The existing Identity signature, durable session lookup/revocation and profile authorization remain mandatory. Catalog stays anonymous and read-only; it rejects credential-bearing browser headers on its private transport.

The transport has bounded bodies, headers, parsing, concurrency and execution/fetch deadlines, with no automatic mutation retries. Router-generated trace context may correlate owner logs only after transport authentication. Public traces, baggage and arbitrary operation names do not become trusted telemetry attributes. Query-plan inspection belongs to a separate diagnostic configuration, never the default public response.

The pinned binary rejects native `max_depth`, `max_aliases` and `max_root_fields` without a GraphOS plan. Do not configure those gated features or bypass their checks. Existing independently implemented owner operation limits remain enforced, while Core bounds HTTP bodies/headers, parser recursion/tokens, recursive selections, concurrency and timeouts. Phase 13 must verify the complete hosted-operation policy; this phase does not claim native licensed depth/alias limiting. The local demo needs no external registration.

Router custom logs/span attributes use a finite operation-name vocabulary. The pinned binary nevertheless puts client operation names into internal OTLP span names/attributes. The private Collector therefore restores the original structural span name and deletes native raw-name/document attributes before any trace exporter. Local trace proof uses the existing Collector's bounded debug exporter, not a fabricated trace or a public telemetry sink. The optional observability profile is required for trace export; the normal runtime still emits structured events and internal Prometheus metrics.

## License and alternatives

The exact upstream Router license is Elastic License 2.0. This decision covers using the unmodified local binary to run Aster's application API, not offering Router as a hosted/managed service. Preserve upstream notices/terms and do not activate or bypass key-protected functionality. Aster-authored materials remain MIT. The standing owner authorization covers this reviewed dependency; it does not waive license restrictions or decide future hosted redistribution. Keep the upstream image's notices, and include its terms whenever distributing a derived image.

Network isolation alone is insufficient against an unauthorized neighbor. A shared credential for every owner unnecessarily lets one owner impersonate Router to another. Per-owner file credentials supply a small local trust boundary without an extra identity/proxy process. mTLS or workload identity remains a hosted alternative; public account/profile headers and reused viewer JWTs are rejected alternatives.

## Validation and recovery

Verify valid/missing/wrong/duplicate credentials, forged identity headers, CSRF/Origin, cookie owner isolation, durable revocation, private ports, real mixed-query partial failure, timeout/cancellation, bounded admission and sanitized telemetry. The existing nullable `ViewerAndTitle` roots allow the healthy owner to remain useful. Acceptance and current implementation status belong in [Phase 04 evidence](../../evidence/phase-04/README.md).

Rollback stops the owned Router stack and restores the prior diagnostic transport without changing product tables. Dispose only the named local trust mounts; do not delete PostgreSQL data. Recreate consumers together when rotating credentials.

## Sources

- [Versioned release](https://github.com/apollographql/router/releases/tag/v2.17.0) and [actual license](https://raw.githubusercontent.com/apollographql/router/v2.17.0/LICENSE), checked 2026-08-27.
- [Header propagation](https://www.apollographql.com/docs/graphos/routing/header-propagation), [Rhai hooks](https://www.apollographql.com/docs/graphos/routing/customization/rhai) and [traffic shaping](https://www.apollographql.com/docs/graphos/routing/performance/traffic-shaping).
- [Versioned configuration expansion](https://github.com/apollographql/router/blob/v2.17.0/apollo-router/src/configuration/expansion.rs) supports file-backed substitutions; exact configuration is also checked using the image's `config schema`/`config validate` commands.
