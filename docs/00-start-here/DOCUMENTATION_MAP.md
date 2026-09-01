# Documentation Map

## Reading paths

### Begin implementation

1. `AGENTS.md`
2. `.ai/CONTEXT.md`
3. `.ai/CURRENT_STATE.md`
4. `.ai/WORK_QUEUE.md`
5. `docs/00-start-here/PROJECT_CHARTER.md`
6. `docs/00-start-here/ENGINEERING_DEMONSTRATION.md`
7. `docs/product/PRODUCT_REQUIREMENTS.md`
8. `docs/architecture/SYSTEM_OVERVIEW.md`
9. `docs/specs/README.md`
10. active phase specification
11. relevant skills and ADRs

### Understand the product

- `docs/product/PRODUCT_REQUIREMENTS.md`
- `docs/product/USER_JOURNEYS.md`
- `docs/product/FEATURE_CATALOG.md`
- `docs/product/CONTENT_RIGHTS.md`
- `docs/product/INITIAL_CONTENT_PLAN.md`
- `docs/product/EXPERIENCE_PRINCIPLES.md`
- `GLOSSARY.md`

### Understand the architecture

- `docs/architecture/SYSTEM_OVERVIEW.md`
- `docs/architecture/BOUNDED_CONTEXTS.md`
- `docs/architecture/GRAPHQL_SUPERGRAPH.md`
- `docs/architecture/DATA_AND_EVENTS.md`
- `docs/architecture/DEPENDENCY_POLICY_REGISTRY.md`
- `docs/architecture/REDIS_ARCHITECTURE.md`
- `docs/architecture/MEDIA_PIPELINE.md`
- `docs/architecture/FRONTEND_ARCHITECTURE.md`
- `docs/architecture/RESILIENCE_ARCHITECTURE.md`
- `docs/architecture/RUNTIME_PLATFORM_RUNWAY.md`
- `docs/architecture/OBSERVABILITY_ARCHITECTURE.md`
- `docs/architecture/SECURITY_ARCHITECTURE.md`
- `docs/architecture/DEPLOYMENT_ARCHITECTURE.md`
- `docs/architecture/FAILURE_MODES.md`
- `docs/architecture/TECHNOLOGY_BASELINE.md`

### Learn through implementation

- [`docs/00-start-here/CAPABILITY_INDEX.md`](CAPABILITY_INDEX.md) — move from a capability to its
  requirement, representative code, adverse test, evidence, and operational guide
- `docs/00-start-here/ENGINEERING_DEMONSTRATION.md`
- `docs/handbook/01-node-in-production.md`
- `docs/handbook/02-domain-and-clean-architecture.md`
- `docs/handbook/03-resilience.md`
- `docs/handbook/04-redis.md`
- `docs/handbook/05-observability-and-slos.md`
- `docs/handbook/06-federation-v2.md`
- `docs/handbook/07-graphql-performance-and-security.md`
- `docs/handbook/08-ssr-and-hydration.md`
- `docs/handbook/09-apollo-client-and-redux.md`
- `docs/handbook/10-media-streaming-and-system-design.md`

### Operate the system

- `docs/operations/LOCAL_DEVELOPMENT.md`
- `docs/operations/OPERATIONAL_OVERVIEW.md`
- `docs/operations/REPOSITORY_GOVERNANCE.md`
- `docs/operations/CONFIGURATION_AND_ENVIRONMENTS.md`
- `docs/operations/RUNTIME_LOGGING.md`
- `docs/operations/RUNTIME_LIFECYCLE.md`
- `docs/operations/PLAYBACK_TELEMETRY.md`
- `docs/operations/SLIS_SLOS_AND_ALERTS.md`
- `docs/operations/RELEASE_PROCESS.md`
- `docs/operations/INCIDENT_RESPONSE.md`
- `docs/operations/RUNBOOKS.md`

### Evaluate quality

- `docs/quality/TESTING_STRATEGY.md`
- `docs/quality/PERFORMANCE_AND_CAPACITY.md`
- `docs/quality/SECURITY_AND_ACCESSIBILITY.md`
- `docs/quality/EXPERIMENT_CATALOG.md`
- `evidence/phase-00/README.md` for current foundation evidence

### Reason about scale

- `docs/system-design/SCALE_ASSUMPTIONS.md`
- `docs/system-design/CONTINUE_WATCHING.md`
- `docs/system-design/MEDIA_DELIVERY.md`
- `docs/system-design/EVOLUTION_AND_TRADEOFFS.md`


## Complete inventory

- `docs/00-start-here/FILE_INDEX.md`
- `docs/00-start-here/BASELINE_VALIDATION.md`

## Sources of truth

| Concern | Source |
|---|---|
| Product behavior | `docs/product/PRODUCT_REQUIREMENTS.md` |
| Current phase | `.ai/CURRENT_STATE.md` |
| Ordered work | `.ai/WORK_QUEUE.md` |
| Phase acceptance | `docs/specs/phase-*.md` |
| Architecture decisions | `docs/adr/` |
| Canonical terminology | `GLOSSARY.md` |
| Agent rules | `AGENTS.md` |
| Current implementation | source code and passing tests |
| Measured performance | `evidence/` and experiment records |
| Operational response | `docs/operations/` |
| Capability-to-code navigation | `docs/00-start-here/CAPABILITY_INDEX.md` |
| Engineering demonstration coverage | `docs/00-start-here/ENGINEERING_DEMONSTRATION.md` |
| Remaining Phase 01 runtime design | `docs/architecture/RUNTIME_PLATFORM_RUNWAY.md` |
| Branch, commit, CI, and GitHub controls | `docs/operations/REPOSITORY_GOVERNANCE.md` |

When two documents conflict, stop and resolve the inconsistency before implementation.
