# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job. The local worktree began P01-R04 clean on matching `main` with no Aster Docker resources and four unrelated stopped containers left untouched.

P01-R04 is `VERIFIED` at protected candidate `34e3cb9`. Implementation `fca410d` and public documentation candidate `6eedca0` create the first slice of `@aster/runtime`: Pino-backed newline-delimited JSON to standard output, fixed service/environment/version context, bounded application-owned fields, representative sensitive-key redaction, sanitized error chains, and validated OpenTelemetry-compatible trace/span correlation through an injected provider. Fourteen focused tests, the complete 28-task local graph, an exact clean public clone, protected run `32966113415`, hosted dependency review, and independent review comment `5424999783` pass. Pino remains an internal exact-pinned implementation detail. OpenTelemetry SDKs, a Collector, Loki, transports, HTTP middleware, the Identity service, and product behavior remain outside this item.

## Resume point

1. Commit and publish the P01-R04 verification closeout on `feat/p01-r04-structured-logging`.
2. Pass the final protected state run, squash-merge pull request 9, and confirm post-merge `main` before starting another work item.
3. Leave P01-R11 `READY`; restore its phase, ADR, architecture, Node runtime, GraphQL, resilience, security, testing, system-design, and documentation context before writing its plan.
4. Evaluate Express 5 and the maintained Apollo Server integration as the preferred HTTP adapter without importing framework types into domain or application layers.

## Do not do yet

- Do not add an application service, HTTP adapter, OpenTelemetry SDK, Collector, dashboard, broker, object store, product schema, or hosted resource to P01-R04.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not mark P01-R04 released before the protected squash merge and post-merge `main` confirmation pass.
