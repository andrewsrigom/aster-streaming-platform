# Handoff

## Resume point

1. Phase 00 and P01-R01 through P01-R09/P01-R11 are released. [PR 17](https://github.com/andrewsrigom/aster-streaming-platform/pull/17) merged as `a1f728196aa7a4d8a79181042f75a876610d2b11`; protected run `33041524806` and exact post-merge run `33041787663` pass all applicable gates and the real eight-scenario matrix. Confirmation comment `5434669574` records executing-agent review, not independent approval.
2. P01-R09 raw evidence is `evidence/phase-01/real-integration.txt`. Local cold source `cbc5255`: 49/49 uncached tasks, audit and clean Git. The 212M temporary clone was removed after exact-path/clean-Git verification. All fixture resources are removed; four unrelated stopped containers remain untouched.
3. P01-R10 is active on `feat/p01-r10-docker-demo`, based on released `a1f7281`; image checkpoint `4837207` is committed. The runtime checkpoint now packages real Identity with PostgreSQL/Redis. Docker image `aster-identity` is `802aca851543412bfb7da3941605138579b5547ab7fb6242ed59b6d8864c58ab`, 255272610 bytes. UID/GID 1000, read-only, ALL caps dropped, 1 CPU/384 MiB/64 PID limit, loopback 3100, 15 s Docker grace. Both WSL curl and Windows localhost health pass. No app container remains running after tests.
4. Optional `ASTER_DATABASE_PASSWORD` preserves legacy URI callers and rejects conflicting sources; diagnostics never emit it. The runtime-only edge bridge fixes Docker 26 internal-network port non-publication; databases remain internal. Helpers use tmpfs at the image-declared volume path. Reset validates five services, platform/edge networks, exact named PostgreSQL volume, foreign attachments and legacy helper anonymous volumes. Both real reset/idempotency and exact unrelated inventory preservation pass. Runtime image rebuild/start: 39.71 s with warm base/install layers; core-only: 7.38 s; natural SIGTERM: 561 ms/exit 143. Config 17/17, Identity 33/33, platform/reset 25/25 and affected gate 49/49 (28 cached, 18.58 s) pass. Evidence: `evidence/phase-01/docker-demo.txt`; do not repeat these experiments for prose-only changes.
5. Next add validated optional OTLP endpoint configuration, preserving no-export callers; connect real Collector/Prometheus metrics and publish resource-aware integration/observability/full profiles. Extend reset guards before adding services/volumes/config mounts. Reuse selected pins, keep Identity free of broker/S3 production dependencies and omit empty Tempo/Loki/Grafana. Complete occupied-port/final clean-checkout acceptance, image/profile CI, review and protected release before Phase 02. The current `full` profile is only the runtime subset; do not claim the complete laboratory. No P01-R10 push/PR/hosted run yet.

## Do not do yet

- No account/profile/session, product schema/migration, GraphQL resolver, cache/event/outbox, media/HLS/CDN or Phase 02 behavior.
- Do not add production broker/S3 dependencies to Identity or expose vendor endpoints, credentials, payloads or unbounded identifiers.
- No Docker/WSL reset/restart/prune or unrelated-state cleanup. Only verified synthetic fixtures and explicitly confirmed local reset.
- Do not change protected-main rules, bypass CI, repeat pipelines without demonstrated cause or merge unrelated Dependabot PR 1.
- No native Windows/macOS/arm64 runtime, steady-state capacity, SLO or playable-demo claims without evidence.
