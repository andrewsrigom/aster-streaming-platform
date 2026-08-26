# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job. The local worktree began P01-R04 clean on matching `main` with no Aster Docker resources and four unrelated stopped containers left untouched.

P01-R04 is `IN_PROGRESS`. Implementation `fca410d` and public documentation candidate `6eedca0` create the first slice of `@aster/runtime`: Pino-backed newline-delimited JSON to standard output, fixed service/environment/version context, bounded application-owned fields, representative sensitive-key redaction, sanitized error chains, and validated OpenTelemetry-compatible trace/span correlation through an injected provider. Fourteen focused tests pass, and the complete forced local graph passed 28 of 28 uncached tasks in `9.762` seconds. An exact clean public clone passed the same 14 focused tests, two-record diagnostic, and 28 of 28 forced uncached tasks in `11.307` seconds, plus audit, secret scanning, and clean-Git checks before targeted removal. Pino remains an internal exact-pinned implementation detail. OpenTelemetry SDKs, a Collector, Loki, transports, HTTP middleware, the Identity service, and product behavior remain outside this item.

## Resume point

1. Verify the active `.ai/CHANGE_PLAN.md` and queue state before changing runtime code.
2. Commit and publish the clean public-checkout evidence update on `feat/p01-r04-structured-logging`.
3. Open the protected pull request and wait for CI plus hosted dependency review.
4. Resolve actionable automated-review findings and close P01-R04 only after final evidence is current.

## Do not do yet

- Do not add an application service, HTTP adapter, OpenTelemetry SDK, Collector, dashboard, broker, object store, product schema, or hosted resource to P01-R04.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R04 verified or released before its current evidence proves that status.
