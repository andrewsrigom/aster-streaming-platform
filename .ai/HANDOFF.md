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
  and adverse mutations. The corrected complete candidate gate passes15/15
  tasks in62.976 seconds, including platform73/73 and CI policy33/33.
- Protected CI builds the image, verifies Grafana/data source/dashboard health,
  runs a representative released query, stops Grafana and requires product
  platform health to remain healthy.
- Run `33316483464` exposed the initial64-PID/256-MiB limit and background plugin
  attempts. A unique local probe reproduced the exit and measured100 startup
  PIDs,87 healthy PIDs and253.2 MiB. The corrected isolated repeat became healthy
  with99 PIDs/225.9 MiB, provisioned the read-only data source/dashboard,
  emitted no plugin-installer/thread failure and left zero scoped resources.
  Focused39/39, CI policy33/33 and the complete candidate gate pass. One
  corrective publication and protected run remain.

## Exact next actions

1. Commit and publish the measured resource correction once.
2. Use protected CI for the changed live Docker proof.
3. Perform one complete review and batch only blocking remediation.
4. Confirm, squash-merge, verify exact main, then activate P12-R07 alerts.

## Execution boundary

Use WSL Git and Node.js24.19.0/pnpm11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Do not do yet

Do not restart WSL/Docker, reset retained projects, repeat host diagnostics or
rebuild media. Protected CI owns the changed live-image proof.
