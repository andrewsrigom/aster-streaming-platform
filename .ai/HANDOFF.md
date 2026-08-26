# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R11 is `RELEASED` through protected squash `93147ac`; post-merge run `32982613740` passed every applicable job. P00-R06 corrective maintenance is `IN_PROGRESS` on `chore/p00-r06-risk-proportionate-gates`. It owns the retrospective corrections for sufficient verification, review stopping, evidence cadence, heavyweight-repeat triggers, and the promised affected-scope local gate. P01-R05 remains blocked until this bounded repository correction is released.

## Resume point

1. Publish the P00-R06 evidence and repository-memory closeout on top of implementation candidate `4184fa1`.
2. While the official GitHub Actions incident persists, do not duplicate runs. After recovery, reemit one pull-request event only if the final SHA still has no valid run.
3. Pass protected CI and the permitted final confirmation review, treating only requirement, security/data, availability, and public-contract blockers; then squash-merge and verify the post-merge `main` run.
4. Return the active phase to Phase 01 and start P01-R05 from clean `main`.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not bypass `CI required`, duplicate outage-era runs, or start P01-R05 before the P00-R06 correction is released.
