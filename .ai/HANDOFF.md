# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R04 is `RELEASED` through protected squash `e33f90b`; post-merge run `32967185247` passed. P01-R11 is `IN_PROGRESS` on `feat/p01-r11-http-adapter`. Implementation `e355e29` adds exact-pinned Express `5.2.1` behind `@aster/http-express`; ADR-0011 accepts it because Apollo maintains the selected Express 5 integration, while Fastify remains the primary evaluated replacement. The local candidate passes eight focused tests plus type, lint, formatting, unused-code, architecture, secret, license, audit, diagnostic, and the 31-task forced graph. Exact public candidate `e7b0c2b` repeated frozen install, focused and complete gates, audit, secret scan, and clean state before targeted clone removal. The slice owns only the transport boundary, request limits, async error translation, request-local cancellation, and Apollo drain compatibility. P01-R05 retains process signals, readiness, generalized in-flight tracking, and complete shutdown orchestration.

## Resume point

1. Commit and push the clean-checkout evidence without changing the verified implementation.
2. Open the protected pull request and capture hosted dependency review plus `CI required`.
3. Request independent automated review, remediate actionable findings, and repeat the protected candidate gate when code or dependencies change.
4. Close P01-R11 only after current evidence proves verification, then squash-merge and confirm the post-merge `main` run before starting P01-R05.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R11 verified or released before current evidence proves that status.
