# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R11 is `RELEASED` through protected squash `93147ac`; post-merge run `32982613740` passed every applicable job. P00-R06 corrective maintenance is `IN_PROGRESS` on `chore/p00-r06-risk-proportionate-gates`. It owns the retrospective corrections for sufficient verification, review stopping, evidence cadence, heavyweight-repeat triggers, and the promised affected-scope local gate. P01-R05 remains blocked until this bounded repository correction is released.

## Resume point

1. Complete the P00-R06 change plan and implement one repository-owned quality-gate runner with full and affected modes.
2. Add adverse tests for invocation, fixed SCM refs, task-list parity, task-level affected inputs, and failure propagation; measure the focused versus full path.
3. Update the operating contract, agent loop, governance, quality-gate, local-development, delivery-model, and work-item-template text without adding ceremony.
4. Verify and release the correction, return the active phase to Phase 01, and start P01-R05 from clean `main`.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R11 `RELEASED` before protected squash merge and post-merge verification.
