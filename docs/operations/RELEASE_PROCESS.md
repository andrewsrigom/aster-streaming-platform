# Release Process

## Release principles

- Release immutable artifacts.
- Separate build from deploy.
- Compose and validate the supergraph before promotion.
- Keep schema, event, client, and database compatibility explicit.
- Deploy small changes with observable gates.
- Make rollback or roll-forward possible before starting.
- Never run unreviewed production migrations from application startup.

## Pre-release

1. all active phase requirements verified;
2. CI green from the release commit;
3. dependency and secret scans reviewed;
4. software bill of materials generated;
5. schema composition and known operations pass;
6. event compatibility passes;
7. migrations reviewed with lock and runtime impact;
8. configuration and secrets present;
9. dashboards and alerts ready;
10. backup current;
11. smoke-test plan ready;
12. rollback plan ready;
13. release notes drafted from verified behavior.

## Deployment order

The exact order depends on compatibility. A common sequence:

1. additive database migrations;
2. backward-compatible event consumers;
3. backward-compatible subgraphs;
4. supergraph/router update;
5. web application with new trusted operations;
6. background producers;
7. backfills;
8. remove old paths in a later release.

Trusted operations are published before clients that need them.

For a document change, retain the old and new operations together, regenerate
and review the complete artifact set, deploy the Router image containing that
set, then deploy the client. Observe finite matched/unknown/missing outcomes
before deleting the old operation in a later release. Rollback uses the prior
Router image and its matching complete manifest; never combine artifacts from
different source revisions.

## Canary

When supported, begin with a small portion of traffic.

Evaluate:

- request and playback SLIs;
- error categories;
- latency;
- event-loop delay;
- memory;
- database pool;
- Redis errors;
- broker lag;
- player first-frame and fatal errors.

Stop promotion on predefined thresholds.

## Smoke tests

- public home;
- title detail and attribution;
- sign-in and profile selection;
- playback session;
- HLS manifest and first frame;
- progress write and resume;
- watchlist;
- search;
- operator rights/publication read-only verification;
- dashboards and trace correlation.

## Rollback

Application rollback requires data and event compatibility.

Media rollback changes Catalog's active publication pointer to a previous validated immutable version.

If a migration is not safely reversible, use a roll-forward plan and disable the feature path.

## Post-release

- verify SLIs and no abnormal burn;
- verify queues and outbox age;
- verify CDN errors and origin load;
- verify no unexpected schema rejection;
- record release completion;
- update current state;
- retain artifacts and evidence;
- schedule cleanup only after compatibility window.

## Release notes

State:

- verified capabilities;
- behavior changes;
- migrations;
- operational changes;
- known limitations;
- rollback notes;
- deferred work.

Do not advertise planned behavior.
