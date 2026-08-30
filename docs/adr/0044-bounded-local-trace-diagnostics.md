# ADR-0044: Add a bounded local trace-diagnostic profile

- Status: Accepted
- Date: 2026-08-30
- Owners: Platform
- Related requirements: P12-R10
- Supersedes: ADR-0042's deferral of a trace backend only
- Superseded by: none

## Context

Aster exports privacy-filtered OpenTelemetry traces, user-outcome metrics and
correlated structured logs. Prometheus and the immutable Grafana overview show
current impact, while the Collector debug exporter proves trace delivery. That
output is intentionally sampled and is not a searchable operator surface, so it
cannot support a repeatable diagnosis that starts at an SLI and follows one
trace across Router, owner and dependency boundaries.

P12-R10 now supplies the concrete need deferred by ADR-0042. The solution must
remain runnable without a hosted account, keep the normal video demo light, add
no product authority and retain strict local privacy, resource and cleanup
bounds. A log backend would be useful only with a real reviewed ingestion path;
adding an empty Loki service would be dead scaffolding.

## Decision

Add unmodified Grafana Tempo `3.0.0`, pinned by multi-platform index digest, to
one diagnostics-only Compose overlay. Tempo runs in monolithic `target=all`
mode, which current official documentation defines as an in-process path that
does not require Kafka. A repository-owned child image adds only the reviewed
configuration. The upstream runtime remains AGPL-3.0-only; Aster-authored
configuration and documentation remain MIT.

The overlay is absent from every normal demo command. When explicitly supplied,
it replaces only the Collector and Grafana Dockerfiles with diagnostic variants:

- the Collector preserves its privacy processors and Prometheus exporter, then
  adds one finite OTLP/HTTP exporter to Tempo;
- Grafana preserves the immutable operational overview, adds one read-only
  Tempo data source and enables transient Explore use for the loopback-only
  anonymous Viewer;
- the Collector keeps its product-facing `platform` attachment and gains a
  dedicated internal `diagnostics-ingest` attachment to Tempo;
- Grafana keeps its Prometheus-facing `edge` attachment and gains a dedicated
  internal `diagnostics-query` attachment to Tempo;
- Tempo joins only `diagnostics-ingest` and `diagnostics-query`, so it has no
  route to product owners, PostgreSQL, Redis, broker or object storage. Tempo
  publishes no host port in either overlay; the disposable runner sends bounded
  TraceQL reads through Grafana's data-source proxy on Grafana's random IPv4
  loopback port.

Tempo stores its WAL, live-store work and blocks on a 128 MiB tmpfs. It retains
blocks for at most one hour, accepts at most 1 MiB/s with a 1 MiB burst, keeps at
most 256 live traces and rejects traces above 256 KiB. Query expression, result,
span-set, 64 queued jobs per tenant, concurrency and timeout limits are
explicit. The
container runs as upstream UID/GID `10001:10001` with a read-only root, dropped
capabilities, `no-new-privileges`, 0.5 CPU, 384 MiB memory, 128 PIDs and no
restart policy or named volume.

The Collector exporter has one consumer, a 128-item memory queue, one-second
request timeout and a retry budget of at most two seconds. Tempo outage can
therefore drop diagnostic traces but cannot block product serving. The existing
debug exporter remains available as bounded fallback evidence.

Do not add Loki in this work item. Diagnostic exercises correlate a trace ID
with the existing size-rotated structured Docker logs. Loki becomes eligible
only when a concrete log receiver, finite label policy, retention/deletion
model, resource budget and query acceptance are reviewed.

## Rationale

Tempo matches Aster's existing OpenTelemetry and Grafana baseline and provides
TraceQL search without introducing another product database or broker. Making
it a separate overlay preserves the evaluator's one-command normal demo and
charges the extra memory only to the explicit observability laboratory. Keeping
logs at their current source avoids fake integration and tests the released
trace/log correlation contract directly.

## Consequences

### Positive

- An operator can search one distributed trace and navigate its exact boundary
  timings without reading source.
- The diagnostic topology is version-controlled, deterministic and offline
  after image installation.
- Tempo loss is isolated from product readiness and durable state.
- The three Phase 12 exercises can correlate user impact, dependency health,
  traces and stable log categories.

### Negative

- The explicit diagnostic profile adds another image and up to 384 MiB memory.
- Local anonymous Explore access is unsuitable for a remote listener.
- Tmpfs trace history is deliberately lost on restart and cannot establish
  hosted retention, availability or capacity.
- No unified log search exists in this local slice.

### Operational

- Start the profile only through the documented diagnostic command and a
  disposable UUID-scoped project.
- Let the runner discover Grafana's ephemeral loopback port, require the
  provisioned Tempo data-source health endpoint to return `OK`, then send
  bounded TraceQL reads through Grafana's UID-scoped data-source proxy.
- Use Grafana Explore or the fixed bounded diagnostic runner; never widen the
  Tempo listener or copy this anonymous policy to a hosted environment.
- Pause and unpause the disposable PostgreSQL container for its transient-failure
  exercise so its tmpfs schema remains intact. Always tear down the exact Compose
  project with volumes and verify zero remaining scoped resources.

### Security and privacy

- The Collector deletes GraphQL operation names/documents and `otel.name`
  before either debug or Tempo export; the exercise checks both raw and
  JSON-escaped multiline document canaries.
- Trace attributes remain finite and contain no user, profile, title, request,
  token, cookie, SQL, URL, credential or signed-media value.
- Tempo and Grafana have no route to owner databases, Redis, broker or object
  storage beyond the private telemetry connections already named.
- Loopback listeners, fixed queries and size/time/concurrency limits bound local
  misuse. This is not a hosted authentication design.

## Alternatives considered

### Parse only the Collector debug output

Rejected for the final exercise because its log sampling is not a deterministic
search store and makes trace-by-ID navigation unnecessarily fragile.

### Add Jaeger all-in-one

Rejected because Tempo is already the selected target baseline, integrates with
the existing Grafana image and supports the required monolithic local mode.

### Add Tempo and Loki together

Rejected because Aster emits application logs to bounded container stdout, not
an OTLP/file log receiver. A Loki service without genuine ingestion would not
satisfy a diagnostic requirement.

### Make Tempo part of every full demo

Rejected because playback evaluation does not require searchable traces and
would pay an avoidable image/startup/memory cost.

## Validation

Repository checks require the exact image digest, diagnostic-only overlay,
two-network least-privilege topology, loopback listener, non-root/read-only
service, tmpfs and every ingestion/query/export bound. Adverse tests reject
product-network attachment, mutable images, named storage, remote exposure,
unbounded TraceQL, privacy-processor removal, infinite retry or queueing and use
against a non-disposable project. Protected CI starts the real profile, requires
Grafana data-source status `OK`, queries Tempo only through Grafana's UID-scoped
proxy, rejects raw or JSON-escaped document canaries, exports and retrieves a
privacy-safe trace, executes all three failure diagnoses and proves exact
cleanup.

## Revisit triggers

- Any hosted or non-loopback use requires authenticated operator identity, TLS,
  tenant isolation, durable object storage, capacity and retention review.
- Adding Loki requires the concrete ingestion/label/retention evidence named
  above.
- More than 128 MiB trace storage, one-hour retention, 256 live traces or two
  query workers requires measured pressure evidence.
- Modifying or distributing a modified Tempo runtime requires renewed AGPL
  source/notice review.

## Migration

There is no product migration. Build the additive diagnostic images, start the
overlay in a new disposable project and remove that project after the exercise.
Rollback deletes the overlay, diagnostic child images/configuration and Grafana
Tempo data source; product schemas, media and normal observability remain
unchanged.

## Sources

- [Tempo 3.0 release](https://github.com/grafana/tempo/releases/tag/v3.0.0)
- [Tempo deployment modes](https://grafana.com/docs/tempo/latest/reference-tempo-architecture/deployment-modes/)
- [Tempo local deployment](https://grafana.com/docs/tempo/latest/set-up-for-tracing/setup-tempo/deploy/locally/linux/)
- [Tempo configuration](https://grafana.com/docs/tempo/latest/configuration/)
- [Tempo HTTP API](https://grafana.com/docs/tempo/latest/api_docs/)
- [TraceQL construction](https://grafana.com/docs/tempo/latest/traceql/construct-traceql-queries/)
- [Grafana data-source HTTP API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/data_source/)
- [Docker Compose internal networks](https://docs.docker.com/compose/how-tos/networking/#internal-networks)
- [Tempo license and source](https://github.com/grafana/tempo/tree/v3.0.0)
- [OpenTelemetry Collector resiliency](https://opentelemetry.io/docs/collector/resiliency/)
