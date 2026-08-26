# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R04 is `RELEASED` through protected squash `e33f90b`; post-merge run `32967185247` passed. P01-R11 is `IN_PROGRESS` on `feat/p01-r11-http-adapter` through pull request 10. Implementation `e355e29` adds exact-pinned Express `5.2.1` behind `@aster/http-express`; ADR-0011 accepts it because Apollo maintains the selected Express 5 integration, while Fastify remains the primary evaluated replacement. Initial public candidate `e7b0c2b` passed the clean-checkout gate, and protected candidate `8f05669` passed run `32969827929`. Self-review then hardened the drain test to prove the listener closes and stop remains pending before the resolver is released; five consecutive focused runs pass. Final public, protected, and review evidence must use that hardened candidate. P01-R05 retains process signals, readiness, generalized in-flight tracking, and complete shutdown orchestration.

## Resume point

1. Commit and push the hardened drain-order test plus its evidence.
2. Repeat the exact public clean-checkout and protected PR gates at the hardened candidate.
3. Request independent automated review at the new head and remediate any actionable finding.
4. Close P01-R11 only after current evidence proves verification, then squash-merge and confirm the post-merge `main` run before starting P01-R05.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R11 verified or released before current evidence proves that status.
