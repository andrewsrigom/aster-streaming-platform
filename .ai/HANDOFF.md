# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R11 is `RELEASED` through protected squash `93147ac`; post-merge run `32982613740` passed every applicable job. P00-R06 is `RELEASED` through protected squash `92d3531`; post-merge run `32999467446` passed every applicable job, and both final-confirmation discussions are resolved.

P01-R05 is `IMPLEMENTED` locally on `feat/p01-r05-lifecycle`. It provides the shared runtime lifecycle, stable health state, process signals, generalized in-flight coordination, dependency closure order, one overall shutdown deadline, stable lifecycle logging, and forced termination. Its pre-rebase 33 focused tests, affected gate, complete uncached gate, audit, documentation, and security checks pass. The branch is being rebased onto released `main` and must repeat invalidated evidence before publication.

## Resume point

1. Finish the rebase without losing P00-R06 release evidence or the later P01-R06–P01-R10 runway documentation.
2. Remove only stale generated runtime output, then repeat focused typecheck, build, 33 tests, real socket/process evidence, and `pnpm check:changed`.
3. Record the rebased exact head and why the prior clean-checkout evidence remains applicable if no heavyweight trigger changed.
4. Publish P01-R05, run one complete review and one confirmation, pass protected CI, and follow the recorded release process.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not bypass `CI required` or duplicate protected runs.
- Do not add Identity behavior, a product GraphQL schema, dependency adapters, an OpenTelemetry SDK, metrics, dashboards, Docker resources, or hosted resources to P01-R05.
