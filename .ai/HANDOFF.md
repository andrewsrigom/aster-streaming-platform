# Handoff

## Resume point

Item60 (P12-R05/R06) is released. PR48 final head `72d5656`, tree `2374279`,
passed protected run `33313090638` attempt2 and clean confirmation. Squash main
is `a99d3d5`; exact-main run `33314309449` passed every required job.

Item61 (P12-R12) is the sole `IN_PROGRESS` item on
`feat/p12-operational-overview`, based exactly on main `a99d3d5`. Its active
plan is `.ai/CHANGE_PLAN.md`.

## Implemented candidate

- ADR-0042 selects unmodified, digest-pinned Grafana OSS 13.2.0 and preserves
  its AGPL-3.0-only terms while Aster-authored configuration remains MIT.
- Grafana publishes only `127.0.0.1:3001`, joins only `edge`, runs as UID472
  with read-only root, 0.5 CPU,384 MiB,128 PIDs and disposable bounded tmpfs.
- Initial admin/basic login, UI writes, plugins, snapshots, analytics and
  updates are disabled; plugin preinstallation/automatic update are blocked;
  local anonymous access is Viewer-only/device-bounded.
- One immutable 15-panel dashboard separates user impact, dependency health
  and runtime saturation with twelve fixed PromQL queries and no variables.
- Repository checks validate image, Compose, provisioning, queries, reset scope
  and adverse mutations. The resource-corrected complete candidate gate passed
  15/15 tasks in62.976 seconds, including platform73/73 and CI policy33/33.
- Protected CI builds the image, verifies Grafana/data source/dashboard health,
  runs a representative released query, stops Grafana and requires product
  platform health to remain healthy.
- Run `33316483464` exposed the initial64-PID/256-MiB limit and background plugin
  attempts. A unique local probe reproduced the exit and measured100 startup
  PIDs,87 healthy PIDs and253.2 MiB. The corrected isolated repeat became healthy
  with99 PIDs/225.9 MiB, provisioned the read-only data source/dashboard,
  emitted no plugin-installer/thread failure and left zero scoped resources.
  Initial review discussions `3889614208` and `3889614213` found the dashboard
  used `playback_session` instead of released SLI `playback_start` and range
  stats could retain an old non-empty ratio. The batched correction cross-checks
  SLO IDs and makes all four ratios instant queries. Focused39/39 and combined
  CI/platform/reset62/62 pass; the corrected complete candidate passes15/15
  tasks with2 cached in81.29 seconds.
- Protected run `33317459549` built the corrected full profile and passed
  packaged telemetry. The overview step failed only because its health assertion
  required compact JSON while Grafana13 returns formatted valid JSON. A unique
  Prometheus/Grafana probe confirmed all five APIs/query/dashboard contracts and
  left zero scoped resources. The assertion now accepts whitespace but still
  requires `database=ok`; focused CI policy tests pass23/23 and the corrected
  complete candidate passes15/15 tasks with3 cached in77.929 seconds.
- Exact source `c678484`, tree `397ead5`, passed protected run `33317834141`:
  every job passed, including live Grafana provisioning/query/failure isolation
  and all integration/playable proofs. Discussions `3889614208` and
  `3889614213` have exact replies and are resolved.

## Exact next actions

1. Publish the evidence checkpoint and obtain one exact-head confirmation.
2. Squash-merge, verify exact main, then activate P12-R07 alerts.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Do not do yet

Do not restart WSL/Docker, reset retained projects, repeat host diagnostics or
rebuild media. Protected CI owns the changed live-image proof.
