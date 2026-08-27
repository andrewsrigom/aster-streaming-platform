# Handoff

## Resume point

1. Phase 00 and P01-R01 through P01-R09/P01-R11 are released. [PR 17](https://github.com/andrewsrigom/aster-streaming-platform/pull/17) merged as `a1f728196aa7a4d8a79181042f75a876610d2b11`; protected run `33041524806` and exact post-merge run `33041787663` pass all applicable gates and the real eight-scenario matrix. Confirmation comment `5434669574` records executing-agent review, not independent approval.
2. P01-R09 raw evidence is `evidence/phase-01/real-integration.txt`. Local cold source `cbc5255`: 49/49 uncached tasks, audit and clean Git. The 212M temporary clone was removed after exact-path/clean-Git verification. All fixture resources are removed; four unrelated stopped containers remain untouched.
3. P01-R10 is active on `feat/p01-r10-docker-demo`, based on clean released merge `a1f7281`. The non-root Identity image checkpoint is implemented. Image `aster-identity:p01-r10` has ID `3c6b9646863b08d8e0f47ef0180d019d86bf21c7a15be9fad570f4bf1b888005`, size 255269001 bytes, UID 1000. Seven workspace packages load, 114 external production versions match the lockfile, controlled HTTP diagnostic passes and missing configuration exits 1. All temporary image-probe containers are removed. See `evidence/phase-01/docker-demo.txt`.
4. The source-only Docker context, immutable Node base, production `deploy --legacy`, package file allowlists and probe contract are covered by the existing platform gate. Platform and CI tests pass 21/21 each; `pnpm check:changed` passes 49/49 tasks (0 cached, 52.272 s). The final image was rebuilt after manifest formatting and disabling build analytics. No app/config/Compose/reset change or hosted P01-R10 run exists yet; do not rebuild for prose-only edits.
5. Next add an explicitly classified optional database-password input so Docker can provide its known local credential separately from the URL. Preserve seven-variable URI callers, reject conflicting sources and build the effective URL at the validated boundary; do not weaken the scanner or rely on hidden pg environment variables. Extend reset guards before adding runtime services/volumes. Keep core cheap; Collector/Prometheus support existing metrics, with optional exporter configuration preserving no-export callers. Do not add empty Tempo/Loki/Grafana. Identity example port: 3100.

## Do not do yet

- No account/profile/session, product schema/migration, GraphQL resolver, cache/event/outbox, media/HLS/CDN or Phase 02 behavior.
- Do not add production broker/S3 dependencies to Identity or expose vendor endpoints, credentials, payloads or unbounded identifiers.
- No Docker/WSL reset/restart/prune or unrelated-state cleanup. Only verified synthetic fixtures and explicitly confirmed local reset.
- Do not change protected-main rules, bypass CI, repeat pipelines without demonstrated cause or merge unrelated Dependabot PR 1.
- No native Windows/macOS/arm64 runtime, steady-state capacity, SLO or playable-demo claims without evidence.
