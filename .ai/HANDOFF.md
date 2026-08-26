# Handoff

Phase 00 is verified and released. P01-R01 and P01-R02 are released on `main`, and P01-R03 is released through protected squash commit `c5a707dc2510130cadcdac368e94b040f120d27c`; post-merge run `32963360595` passed every applicable job.

P01-R11 is `RELEASED` through protected squash `93147ac`; post-merge run `32982613740` passed every applicable job. P00-R06 is `RELEASED` through protected squash `92d3531`; post-merge run `32999467446` passed every applicable job, and both final-confirmation discussions are resolved.

P01-R05 implementation commit `60e9808` is `IMPLEMENTED` locally on `feat/p01-r05-lifecycle` after replay onto released `main`. It provides the shared runtime lifecycle, stable health state, process signals, generalized in-flight coordination, dependency closure order, one overall shutdown deadline, stable lifecycle logging, and forced termination. The rebased focused typecheck, build, 33 tests, affected gate, audit, documentation, memory, and security checks pass. The prior clean-checkout evidence remains applicable because the rebase leaves its lifecycle and bootstrap inputs unchanged.

The remaining Phase 01 runway is now explicit without beginning another item. P01-R06 owns telemetry contracts; P01-R07 owns narrow platform adapters; P01-R08 owns deadline/readiness composition and the product-empty Identity skeleton; P01-R09 owns real dependency integration; P01-R10 owns resource-aware profiles and clean Docker-only closeout. Current package and container observations are candidates only. The official MinIO repository is archived, Kafka client shutdown remains unresolved, and typed SQL selection is deferred to the first real Phase 02 persistence use case.

## Resume point

1. Commit the rebased evidence and repository-memory closeout without changing lifecycle behavior.
2. Publish `feat/p01-r05-lifecycle` and open one coherent P01-R05 pull request.
3. Pass protected CI, run one complete review and one confirmation, and remediate only blocking requirement, security/data, availability, or public-contract findings.
4. Squash-merge P01-R05, verify the post-merge `main` run, and record its release evidence.
5. After P01-R05 is released, activate P01-R06 from clean `main` using `docs/architecture/RUNTIME_PLATFORM_RUNWAY.md`; repeat affected candidate metadata rather than copying preflight versions as accepted decisions.

## Do not do yet

- Do not add an application service, product resolver/schema, process-signal coordinator, OpenTelemetry SDK, Collector, dashboard, broker, object store, or hosted resource to P01-R11.
- Do not expose arbitrary caller objects, raw errors, request bodies, headers, GraphQL documents, configuration URLs, personal identifiers, or signed media URLs through the logging contract.
- Do not merge or close Dependabot pull request 1 without its dedicated compatibility work and an authorized disposition.
- Do not bypass `CI required` or duplicate protected runs.
- Do not add Identity behavior, a product GraphQL schema, dependency adapters, an OpenTelemetry SDK, metrics, dashboards, Docker resources, or hosted resources to P01-R05.
- Do not treat VersityGW, SeaweedFS, Redpanda, a Kafka client, an OpenTelemetry package, or a preflight timeout as selected until its owning work item passes the required gate.
