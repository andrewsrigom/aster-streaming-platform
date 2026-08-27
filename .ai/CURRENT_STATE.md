# Current State

Last updated: 2026-08-27

## Active phase

**Phase 01 — Local Platform and Runtime Skeleton**

Status: **IN_PROGRESS**

## Verified

- Phase 00 foundation and P01-R01 through P01-R09/P01-R11 are released. Historical runs and remediations live in [Phase 00 evidence](../evidence/phase-00/README.md), [Phase 01 evidence](../evidence/phase-01/README.md) and [session history](SESSION_LOG.md), not duplicated here.
- Current released main is `a1f728196aa7a4d8a79181042f75a876610d2b11`, PR 17. Protected run `33041524806` and post-merge `33041787663` pass every applicable gate and the eight-scenario real integration matrix. Cold source `cbc5255` passed 49/49 uncached tasks, audit and clean Git. Confirmation was executing-agent review, not independent approval.
- Exact Node 24.19.0/pnpm 11.24.0, TypeScript 6.0.3 and Turbo 2.10.12 are pinned. Strict types/lint/format/unused/import-boundary, documentation/memory, secret/license and path-aware CI gates exist. Hooks inspect applicable staged files only; no per-commit full/container gate.
- Runtime packages implement classified configuration, redacted correlated logs, Express transport, health and ten-second ordered shutdown, bounded telemetry, clock/IDs and PostgreSQL/Redis/Kafka/S3 adapters. Identity composes only PostgreSQL/Redis as production dependencies. Domain/application boundaries remain framework-free.
- Real integration proves protocols, dependency loss/recovery, held HTTP drain, Kafka delivery/manual offsets, S3 streaming/checksum/multipart cleanup, Collector/Prometheus delivery/faults and all-adapter shutdown. [Raw integration evidence](../evidence/phase-01/real-integration.txt) defines workload and limitations.
- Public MIT repository `andrewsrigom/aster-streaming-platform` uses protected PR-only main, strict `CI required`, resolved review threads, squash/linear history and no bypass. Existing authorized publishing/release workflow remains in force.

## Implemented local P01-R10 checkpoint

- Branch `feat/p01-r10-docker-demo`; packaging/runtime commits `4837207` and `166cc3c`. Optional-profile candidate follows them; no P01-R10 push/PR/hosted run yet.
- Docker-only Identity is production-only, UID/GID 1000, read-only, ALL capabilities dropped, 1 CPU/384 MiB/64 PIDs, loopback 3100 and 15-second Docker grace. PostgreSQL/Redis stay private. Optional classified database password preserves legacy URI callers. Helper tmpfs prevents anonymous database volumes.
- Core=4 services; runtime=5; integration=7; observability=7; full=9. The last two require explicit base-plus-`observability.yml` files. Broker/S3 remain private; Collector/Prometheus configs are baked into pinned images. Prometheus publishes only loopback 9090. Reset validates exactly nine services, two networks, four named volumes, provenance and foreign attachments before deletion.
- Optional `ASTER_OTLP_METRICS_ENDPOINT` is validated/redacted; omitted means no export. Real HTTP, dependency, CPU, memory, event-loop and export metrics reach Prometheus. Collector loss leaves Identity live/ready, makes the telemetry status helper unhealthy and recovers. Collector-down SIGTERM exits naturally with 143 in 4223 ms, truthfully degraded.
- Full-profile resource/image/volume samples and successful nine-container/two-network/four-volume reset are in [Docker evidence](../evidence/phase-01/docker-demo.txt). Four unrelated stopped containers and 22 volume/network entries match before/after; no Aster resource remains.
- Focused checks pass: configuration 20/20, Identity 34/34, platform/reset 29/29, CI policy/classification 22/22. Corrected test lint/tuple typing issues; final affected gate passes 49/49 tasks (33 cached, 14.863 s).
- CI source now adds a Docker-built full-profile check inside the existing conditional platform job, with in-container UID/health/metrics assertions and all-profile cleanup. First hosted execution is pending.

## Not implemented

- Final clean-checkout Docker-only acceptance, occupied-port evidence and protected P01-R10 release.
- Accounts/profiles/sessions, product schemas/migrations/seed, GraphQL/Federation, browser UI, catalog/playback/media pipeline, engagement/discovery.
- Product dashboards, traces/log backends, representative load/SLOs, hosted environments/deployment. No playable VOD demo exists yet.

## Next outcome

Finish P01-R10: final source gate, exact clean clone with no host Node/pnpm, supported profile commands/occupied-port/reset, full phase acceptance and audit. Perform one initial review plus confirmation; publish one coherent candidate, require protected CI, squash and verify post-merge. Check Phase 02 prerequisites before starting its first READY item. Follow [change plan](CHANGE_PLAN.md); do not repeat heavy experiments for prose-only changes.

## Current risks

- Verified runtime is Docker Desktop/WSL amd64, Docker 26.0.0/Compose 2.26.1 floor. Windows localhost access works through WSL, not proof of native Windows containers/macOS/arm64/rootless/Podman. Resource/latency samples are not capacity guarantees; first pulls/build need registry access.
- Local reset is irreversible for PostgreSQL/Kafka/S3 data and Prometheus history. It refuses hosted URLs/CI/overrides and foreign attachments, but cannot detect a deliberately installed local-socket proxy. No backup/product seed exists. Never reset/restart/prune Docker/WSL or touch unrelated projects.
- Local Kafka is single-node/plaintext; VersityGW uses its upstream root process with all capabilities dropped for its local volume. No hosted security posture is claimed. Prometheus 1-hour/128 MB retention is not a hard disk quota. Identity/Prometheus edge networking permits egress, not an egress firewall.
- Adapter upgrades must recheck forced client retirement after PostgreSQL/Redis timeout, asynchronous multipart cleanup and KafkaJS lifecycle/maintenance risk. Native Windows signals, distributed Kafka failover/SASL/TLS and product idempotency are not proven.
- Redis is an unmodified external AGPLv3 service. ADR-0012 accepts unmodified MIT AND MITNFA `bowser`; preserve notices and re-review modification/bundling. Existing low Scorecard warnings are informational, not known-vulnerability findings.
- Do not merge unrelated Dependabot PR 1 (TypeScript/Node major changes) ad hoc. Do not weaken protections or duplicate pipelines. Secret/memory/documentation scanners have bounded pattern/semantic limits; no image CVE audit or universal absence-of-secrets claim.
- No media rights record is approved. FFmpeg recipe, shadcn/Media Chrome compatibility and hosted provider decisions stay with their owning phases.
