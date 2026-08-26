# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job. The local worktree began P01-R04 clean on matching `main` with no Aster Docker resources and four unrelated stopped containers left untouched.

P01-R04 is `IN_PROGRESS`. Its active plan creates the first slice of `@aster/runtime`: Pino-backed newline-delimited JSON to standard output, fixed service/environment/version context, bounded application-owned fields, representative sensitive-key redaction, sanitized error chains, and validated OpenTelemetry-compatible trace/span correlation through an injected provider. Pino remains an internal exact-pinned implementation detail. OpenTelemetry SDKs, a Collector, Loki, transports, HTTP middleware, the Identity service, and product behavior remain outside this item.

## Resume point

1. Verify the active `.ai/CHANGE_PLAN.md` and queue state before changing runtime code.
2. Create a non-`codex/` feature branch from protected `main`.
3. Record Pino `10.3.1` compatibility, maintenance, MIT license, dependency, security, process-cost, and exit-strategy evidence.
4. Implement and adversely test the bounded repository-owned logger API and diagnostic, then complete the local, clean-checkout, and protected pull-request gates before closing P01-R04.

## Do not do yet

- Do not add an application service, HTTP adapter, OpenTelemetry SDK, Collector, dashboard, broker, object store, product schema, or hosted resource to P01-R04.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R04 implemented, verified, or released before its current evidence proves that status.
