# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R04 is `RELEASED` through protected squash `e33f90b`; post-merge run `32967185247` passed. P01-R11 is `IN_PROGRESS` on `feat/p01-r11-http-adapter` through pull request 10. Implementation `e355e29` adds exact-pinned Express `5.2.1` behind `@aster/http-express`; ADR-0011 accepts it because Apollo maintains the selected Express 5 integration, while Fastify remains the primary evaluated replacement. Review comments `3862878496` and `3862956772` are fixed with evidence replies and resolved. Exact-route candidate `9ddf8d6` passed public and protected gates, but follow-up comment `3863047553` found valid UTF-16 JSON crossed the documented UTF-8-only boundary. The local remediation uses Node.js MIME parsing before body parsing and adds a real UTF-16LE adverse case; final gates must use that candidate. P01-R05 retains process signals, readiness, generalized in-flight tracking, and complete shutdown orchestration.

## Resume point

1. Run the complete local graph for the UTF-8 gate remediation, then commit and push it with evidence.
2. Repeat the exact public clean checkout and protected CI at the new head.
3. Reply to and resolve comment `3863047553`, then request final independent review.
4. Close and squash-merge P01-R11 only after final review and evidence pass; start P01-R05 from released clean `main`.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R11 verified or released before current evidence proves that status.
