# File Index

This index lists repository governance artifacts and every Markdown source in the specification baseline. Use `DOCUMENTATION_MAP.md` for task-oriented reading paths.

## Repository root

- [`.gitattributes`](../../.gitattributes) — Deterministic Git Attributes
- [`.gitignore`](../../.gitignore) — Generated and Local File Policy
- [`.node-version`](../../.node-version) — Node.js Runtime Pin
- [`.nvmrc`](../../.nvmrc) — NVM Runtime Pin
- [`.prettierignore`](../../.prettierignore) — Formatter Exclusion Policy
- [`.prettierrc.json`](../../.prettierrc.json) — Deterministic Formatting Policy
- [`LICENSE`](../../LICENSE) — MIT License
- [`AGENTS.md`](../../AGENTS.md) — Aster Agent Operating Contract
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — Contributing
- [`DOCUMENTATION.md`](../../DOCUMENTATION.md) — Documentation Entry Point
- [`GLOSSARY.md`](../../GLOSSARY.md) — Glossary
- [`LICENSES.md`](../../LICENSES.md) — Licensing and Attribution
- [`README.md`](../../README.md) — Aster
- [`ROADMAP.md`](../../ROADMAP.md) — Roadmap
- [`SECURITY.md`](../../SECURITY.md) — Security Policy
- [`eslint.config.mjs`](../../eslint.config.mjs) — Type-Aware Lint Policy
- [`knip.json`](../../knip.json) — Unused-Code and Dependency Policy
- [`package.json`](../../package.json) — Root Toolchain Metadata
- [`pnpm-lock.yaml`](../../pnpm-lock.yaml) — Dependency Integrity Lockfile
- [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) — Workspace Definition and pnpm Policy
- [`turbo.json`](../../turbo.json) — Monorepo Task Graph
- [`tsconfig.base.json`](../../tsconfig.base.json) — Strict Shared TypeScript Policy
- [`tsconfig.json`](../../tsconfig.json) — Root Tooling TypeScript Project

## .githooks

- [`.githooks/commit-msg`](../../.githooks/commit-msg) — Commit Message Hook
- [`.githooks/pre-commit`](../../.githooks/pre-commit) — Bounded Staged-File Hook

## .github

- [`.github/dependabot.yml`](../../.github/dependabot.yml) — Low-Noise Dependency Update Policy
- [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md) — Active Pull-Request Contract
- [`.github/ISSUE_TEMPLATE/bug-report.md`](../../.github/ISSUE_TEMPLATE/bug-report.md) — Public Bug Report Template
- [`.github/ISSUE_TEMPLATE/change-proposal.md`](../../.github/ISSUE_TEMPLATE/change-proposal.md) — Public Change Proposal Template
- [`.github/ISSUE_TEMPLATE/config.yml`](../../.github/ISSUE_TEMPLATE/config.yml) — Issue Chooser Policy
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — Pull-Request and Main CI Decision

## .ai

- [`.ai/CHANGE_PLAN.md`](../../.ai/CHANGE_PLAN.md) — Active Change Plan
- [`.ai/CONTEXT.md`](../../.ai/CONTEXT.md) — Persistent Project Context
- [`.ai/CURRENT_STATE.md`](../../.ai/CURRENT_STATE.md) — Current State
- [`.ai/DECISIONS_LEDGER.md`](../../.ai/DECISIONS_LEDGER.md) — Decisions Ledger
- [`.ai/HANDOFF.md`](../../.ai/HANDOFF.md) — Handoff
- [`.ai/PROMPTS.md`](../../.ai/PROMPTS.md) — Reusable Agent Prompts
- [`.ai/QUALITY_GATES.md`](../../.ai/QUALITY_GATES.md) — Quality Gates
- [`.ai/README.md`](../../.ai/README.md) — Repository Memory
- [`.ai/SESSION_LOG.md`](../../.ai/SESSION_LOG.md) — Session Log
- [`.ai/SESSION_LOG_ARCHIVE.txt`](../../.ai/SESSION_LOG_ARCHIVE.txt) — Immutable Full Session-Log Snapshot
- [`.ai/WORK_QUEUE.md`](../../.ai/WORK_QUEUE.md) — Work Queue

## skills

- [`skills/agent.md`](../../skills/agent.md) — Skill: Repository Agent
- [`skills/architecture.md`](../../skills/architecture.md) — Skill: Architecture
- [`skills/data-events.md`](../../skills/data-events.md) — Skill: Data and Events
- [`skills/documentation.md`](../../skills/documentation.md) — Skill: Documentation and Code Commentary
- [`skills/frontend.md`](../../skills/frontend.md) — Skill: Frontend, SSR, and Client State
- [`skills/graphql-federation.md`](../../skills/graphql-federation.md) — Skill: GraphQL and Federation
- [`skills/media-streaming.md`](../../skills/media-streaming.md) — Skill: Media Streaming
- [`skills/node-runtime.md`](../../skills/node-runtime.md) — Skill: Node.js Runtime
- [`skills/observability.md`](../../skills/observability.md) — Skill: Observability
- [`skills/product.md`](../../skills/product.md) — Skill: Product and Domain
- [`skills/redis.md`](../../skills/redis.md) — Skill: Redis
- [`skills/release-operations.md`](../../skills/release-operations.md) — Skill: Release and Operations
- [`skills/resilience.md`](../../skills/resilience.md) — Skill: Resilience
- [`skills/security.md`](../../skills/security.md) — Skill: Security
- [`skills/system-design.md`](../../skills/system-design.md) — Skill: System Design
- [`skills/testing.md`](../../skills/testing.md) — Skill: Testing and Evidence

## tools

- [`tools/clean-foundation.mjs`](../../tools/clean-foundation.mjs) — Bounded Foundation Cleanup
- [`tools/clean-foundation.test.mjs`](../../tools/clean-foundation.test.mjs) — Foundation Cleanup Tests
- [`tools/verify-ai-state.ts`](../../tools/verify-ai-state.ts) — Repository Memory Consistency Validator
- [`tools/verify-ai-state.test.ts`](../../tools/verify-ai-state.test.ts) — Repository Memory Validator Tests
- [`tools/check-staged-files.ts`](../../tools/check-staged-files.ts) — Bounded Staged-File Dispatcher
- [`tools/check-staged-files.test.ts`](../../tools/check-staged-files.test.ts) — Staged-File Dispatcher Tests
- [`tools/classify-ci-change.ts`](../../tools/classify-ci-change.ts) — Fail-Safe CI Change Classifier
- [`tools/classify-ci-change.test.ts`](../../tools/classify-ci-change.test.ts) — CI Change Classifier Tests
- [`tools/verify-community-files.ts`](../../tools/verify-community-files.ts) — Public Contribution Contract Validator
- [`tools/verify-community-files.test.ts`](../../tools/verify-community-files.test.ts) — Public Contribution Contract Tests
- [`tools/scan-secrets.ts`](../../tools/scan-secrets.ts) — Bounded Redacting Secret Scanner
- [`tools/scan-secrets.test.ts`](../../tools/scan-secrets.test.ts) — Secret Scanner Tests
- [`tools/validate-commit-message.ts`](../../tools/validate-commit-message.ts) — Commit Message Validator
- [`tools/validate-commit-message.test.ts`](../../tools/validate-commit-message.test.ts) — Commit Message Validator Tests
- [`tools/verify-architecture.ts`](../../tools/verify-architecture.ts) — Architecture Boundary Scanner
- [`tools/verify-architecture.test.ts`](../../tools/verify-architecture.test.ts) — Architecture Boundary Scanner Tests
- [`tools/verify-documentation.ts`](../../tools/verify-documentation.ts) — Static Documentation Validator
- [`tools/verify-documentation.test.ts`](../../tools/verify-documentation.test.ts) — Documentation Validator Tests
- [`tools/verify-capability-index.ts`](../../tools/verify-capability-index.ts) — Capability Traceability Validator
- [`tools/verify-capability-index.test.ts`](../../tools/verify-capability-index.test.ts) — Capability Traceability Validator Tests
- [`tools/verify-ci-policy.ts`](../../tools/verify-ci-policy.ts) — GitHub Actions and Dependabot Policy Validator
- [`tools/verify-ci-policy.test.ts`](../../tools/verify-ci-policy.test.ts) — CI Policy Validator Tests
- [`tools/verify-local-platform.mjs`](../../tools/verify-local-platform.mjs) — Local Platform Policy Validator
- [`tools/verify-local-platform.test.mjs`](../../tools/verify-local-platform.test.mjs) — Local Platform Policy Tests
- [`tools/verify-toolchain.mjs`](../../tools/verify-toolchain.mjs) — Dependency-Free Toolchain Guard
- [`tools/verify-toolchain.test.mjs`](../../tools/verify-toolchain.test.mjs) — Toolchain Guard Tests

## evidence/phase-00

- [`evidence/phase-00/README.md`](../../evidence/phase-00/README.md) — Phase 00 Evidence Index
- [`evidence/phase-00/ai-state-workflow.txt`](../../evidence/phase-00/ai-state-workflow.txt) — Repository Memory Workflow Evidence
- [`evidence/phase-00/clean-checkout-closeout.txt`](../../evidence/phase-00/clean-checkout-closeout.txt) — Clean Checkout and Phase Closeout Evidence
- [`evidence/phase-00/developer-command-contract.txt`](../../evidence/phase-00/developer-command-contract.txt) — Developer Command Contract Evidence
- [`evidence/phase-00/public-repository-governance.txt`](../../evidence/phase-00/public-repository-governance.txt) — Public Repository Governance Evidence

## evidence/phase-01

- [`evidence/phase-01/README.md`](../../evidence/phase-01/README.md) — Phase 01 Evidence Index
- [`evidence/phase-01/http-adapter.txt`](../../evidence/phase-01/http-adapter.txt) — Express HTTP Adapter Compatibility Evidence
- [`evidence/phase-01/local-platform-checkpoint.txt`](../../evidence/phase-01/local-platform-checkpoint.txt) — Local Platform Checkpoint Evidence
- [`evidence/phase-01/local-reset.txt`](../../evidence/phase-01/local-reset.txt) — Project-Scoped Local Reset Evidence
- [`evidence/phase-01/runtime-configuration.txt`](../../evidence/phase-01/runtime-configuration.txt) — Runtime Configuration Evidence
- [`evidence/phase-01/runtime-lifecycle.txt`](../../evidence/phase-01/runtime-lifecycle.txt) — Runtime Lifecycle Evidence
- [`evidence/phase-01/runtime-logging.txt`](../../evidence/phase-01/runtime-logging.txt) — Runtime Logging Evidence
- [`evidence/phase-01/runtime-runway-preflight.txt`](../../evidence/phase-01/runtime-runway-preflight.txt) — Remaining Runtime Preflight Evidence

## docs/00-start-here

- [`docs/00-start-here/BASELINE_VALIDATION.md`](BASELINE_VALIDATION.md) — Baseline Validation
- [`docs/00-start-here/CAPABILITY_INDEX.md`](CAPABILITY_INDEX.md) — Capability-to-Proof Navigation Index
- [`docs/00-start-here/DELIVERY_MODEL.md`](DELIVERY_MODEL.md) — Delivery Model
- [`docs/00-start-here/DOCUMENTATION_MAP.md`](DOCUMENTATION_MAP.md) — Documentation Map
- [`docs/00-start-here/ENGINEERING_DEMONSTRATION.md`](ENGINEERING_DEMONSTRATION.md) — Engineering Demonstration Contract
- [`docs/00-start-here/ENGINEERING_PRINCIPLES.md`](ENGINEERING_PRINCIPLES.md) — Engineering Principles
- [`docs/00-start-here/PROJECT_CHARTER.md`](PROJECT_CHARTER.md) — Project Charter

## docs/product

- [`docs/product/CONTENT_RIGHTS.md`](../product/CONTENT_RIGHTS.md) — Content Rights and Attribution
- [`docs/product/EXPERIENCE_PRINCIPLES.md`](../product/EXPERIENCE_PRINCIPLES.md) — Experience Principles
- [`docs/product/FEATURE_CATALOG.md`](../product/FEATURE_CATALOG.md) — Feature Catalog
- [`docs/product/INITIAL_CONTENT_PLAN.md`](../product/INITIAL_CONTENT_PLAN.md) — Initial Content Plan
- [`docs/product/PRODUCT_REQUIREMENTS.md`](../product/PRODUCT_REQUIREMENTS.md) — Product Requirements
- [`docs/product/USER_JOURNEYS.md`](../product/USER_JOURNEYS.md) — User Journeys

## docs/architecture

- [`docs/architecture/BOUNDED_CONTEXTS.md`](../architecture/BOUNDED_CONTEXTS.md) — Bounded Contexts
- [`docs/architecture/CAPACITY_AND_EVOLUTION.md`](../architecture/CAPACITY_AND_EVOLUTION.md) — Capacity and Evolution
- [`docs/architecture/DATA_AND_EVENTS.md`](../architecture/DATA_AND_EVENTS.md) — Data and Events
- [`docs/architecture/DEPENDENCY_POLICY_REGISTRY.md`](../architecture/DEPENDENCY_POLICY_REGISTRY.md) — Dependency Policy Registry
- [`docs/architecture/DEPLOYMENT_ARCHITECTURE.md`](../architecture/DEPLOYMENT_ARCHITECTURE.md) — Deployment Architecture
- [`docs/architecture/FAILURE_MODES.md`](../architecture/FAILURE_MODES.md) — Failure Modes
- [`docs/architecture/FRONTEND_ARCHITECTURE.md`](../architecture/FRONTEND_ARCHITECTURE.md) — Frontend Architecture
- [`docs/architecture/GRAPHQL_SUPERGRAPH.md`](../architecture/GRAPHQL_SUPERGRAPH.md) — GraphQL Supergraph
- [`docs/architecture/MEDIA_PIPELINE.md`](../architecture/MEDIA_PIPELINE.md) — Media Pipeline
- [`docs/architecture/OBSERVABILITY_ARCHITECTURE.md`](../architecture/OBSERVABILITY_ARCHITECTURE.md) — Observability Architecture
- [`docs/architecture/REDIS_ARCHITECTURE.md`](../architecture/REDIS_ARCHITECTURE.md) — Redis Architecture
- [`docs/architecture/RESILIENCE_ARCHITECTURE.md`](../architecture/RESILIENCE_ARCHITECTURE.md) — Resilience Architecture
- [`docs/architecture/RUNTIME_PLATFORM_RUNWAY.md`](../architecture/RUNTIME_PLATFORM_RUNWAY.md) — Runtime Platform Runway
- [`docs/architecture/SECURITY_ARCHITECTURE.md`](../architecture/SECURITY_ARCHITECTURE.md) — Security Architecture
- [`docs/architecture/SYSTEM_OVERVIEW.md`](../architecture/SYSTEM_OVERVIEW.md) — System Overview
- [`docs/architecture/TECHNOLOGY_BASELINE.md`](../architecture/TECHNOLOGY_BASELINE.md) — Technology Baseline

## docs/adr

- [`docs/adr/0000-template.md`](../adr/0000-template.md) — ADR-XXXX: Decision Title
- [`docs/adr/0001-monorepo.md`](../adr/0001-monorepo.md) — ADR-0001: Use a TypeScript Monorepo with Explicit Boundaries
- [`docs/adr/0002-bounded-contexts.md`](../adr/0002-bounded-contexts.md) — ADR-0002: Use Five Primary Bounded Contexts
- [`docs/adr/0003-federation.md`](../adr/0003-federation.md) — ADR-0003: Use Apollo Federation v2 and Apollo Router
- [`docs/adr/0004-data-ownership.md`](../adr/0004-data-ownership.md) — ADR-0004: Use PostgreSQL with Context-Owned Persistence
- [`docs/adr/0005-redis.md`](../adr/0005-redis.md) — ADR-0005: Keep Redis Non-Authoritative
- [`docs/adr/0006-media-delivery.md`](../adr/0006-media-delivery.md) — ADR-0006: Deliver Immutable HLS Publications through Object Storage and CDN
- [`docs/adr/0007-events.md`](../adr/0007-events.md) — ADR-0007: Use Transactional Outboxes and At-Least-Once Events
- [`docs/adr/0008-client-state.md`](../adr/0008-client-state.md) — ADR-0008: Separate Apollo Remote State from Redux Interaction State
- [`docs/adr/0009-observability.md`](../adr/0009-observability.md) — ADR-0009: Standardize Telemetry through OpenTelemetry
- [`docs/adr/0010-content-rights.md`](../adr/0010-content-rights.md) — ADR-0010: Make Rights Verification a Publication Invariant
- [`docs/adr/0011-express-http-adapter.md`](../adr/0011-express-http-adapter.md) — ADR-0011: Use Express 5 behind a Bounded HTTP Adapter
- [`docs/adr/0042-bounded-local-operational-overview.md`](../adr/0042-bounded-local-operational-overview.md) — ADR-0042: Provision a bounded local operational overview
- [`docs/adr/0043-multi-window-slo-burn-alerts.md`](../adr/0043-multi-window-slo-burn-alerts.md) — ADR-0043: Evaluate finite multi-window SLO burn-rate alerts
- [`docs/adr/0044-bounded-local-trace-diagnostics.md`](../adr/0044-bounded-local-trace-diagnostics.md) — ADR-0044: Add a bounded local trace-diagnostic profile
- [`docs/adr/0045-source-owned-trusted-operations.md`](../adr/0045-source-owned-trusted-operations.md) — ADR-0045: Enforce source-owned trusted GraphQL operations
- [`docs/adr/0046-source-owned-graphql-demand-budget.md`](../adr/0046-source-owned-graphql-demand-budget.md) — ADR-0046: Enforce a source-owned GraphQL demand budget
- [`docs/adr/0047-bounded-graphql-execution-rate-and-cache-scope.md`](../adr/0047-bounded-graphql-execution-rate-and-cache-scope.md) — ADR-0047: Bound GraphQL execution, account admission and cache scope
- [`docs/adr/0048-reference-first-phase-14-runway.md`](../adr/0048-reference-first-phase-14-runway.md) — ADR-0048: Make reference quality the immediate Phase 14 runway

## docs/specs

- [`docs/specs/README.md`](../specs/README.md) — Delivery Specifications
- [`docs/specs/phase-00-foundation.md`](../specs/phase-00-foundation.md) — Phase 00 — Repository Foundation
- [`docs/specs/phase-01-local-platform.md`](../specs/phase-01-local-platform.md) — Phase 01 — Local Platform and Runtime Skeleton
- [`docs/specs/phase-02-identity-profiles.md`](../specs/phase-02-identity-profiles.md) — Phase 02 — Identity and Viewer Profiles
- [`docs/specs/phase-03-catalog-rights.md`](../specs/phase-03-catalog-rights.md) — Phase 03 — Catalog and Content Rights
- [`docs/specs/phase-04-supergraph.md`](../specs/phase-04-supergraph.md) — Phase 04 — Federated Supergraph
- [`docs/specs/phase-05-web-ssr.md`](../specs/phase-05-web-ssr.md) — Phase 05 — Web Shell, SSR, and Hydration
- [`docs/specs/phase-06-media-pipeline.md`](../specs/phase-06-media-pipeline.md) — Phase 06 — Media Ingestion and Publication
- [`docs/specs/phase-07-playback.md`](../specs/phase-07-playback.md) — Phase 07 — Playback Sessions and Player
- [`docs/specs/phase-08-engagement.md`](../specs/phase-08-engagement.md) — Phase 08 — Progress, History, Watchlist, and Continue-Watching
- [`docs/specs/phase-09-discovery.md`](../specs/phase-09-discovery.md) — Phase 09 — Home Rails and Search
- [`docs/specs/phase-10-redis.md`](../specs/phase-10-redis.md) — Phase 10 — Advanced Redis and Concurrency
- [`docs/specs/phase-11-resilience.md`](../specs/phase-11-resilience.md) — Phase 11 — Resilience and Failure Laboratory
- [`docs/specs/phase-12-observability.md`](../specs/phase-12-observability.md) — Phase 12 — Observability, SLIs, and SLOs
- [`docs/specs/phase-13-graphql-performance-security.md`](../specs/phase-13-graphql-performance-security.md) — Phase 13 — GraphQL Performance and Security
- [`docs/specs/phase-14-capacity-release.md`](../specs/phase-14-capacity-release.md) — Phase 14 — Reference Quality, Capacity Validation, and Hosted Release

## docs/handbook

- [`docs/handbook/01-node-in-production.md`](../handbook/01-node-in-production.md) — Node.js in Production
- [`docs/handbook/02-domain-and-clean-architecture.md`](../handbook/02-domain-and-clean-architecture.md) — Domain Design and Clean Architecture
- [`docs/handbook/03-resilience.md`](../handbook/03-resilience.md) — Resilience
- [`docs/handbook/04-redis.md`](../handbook/04-redis.md) — Redis in Aster
- [`docs/handbook/05-observability-and-slos.md`](../handbook/05-observability-and-slos.md) — Observability and Service Objectives
- [`docs/handbook/06-federation-v2.md`](../handbook/06-federation-v2.md) — Apollo Federation v2
- [`docs/handbook/07-graphql-performance-and-security.md`](../handbook/07-graphql-performance-and-security.md) — GraphQL Performance and Security
- [`docs/handbook/08-ssr-and-hydration.md`](../handbook/08-ssr-and-hydration.md) — SSR and Hydration
- [`docs/handbook/09-apollo-client-and-redux.md`](../handbook/09-apollo-client-and-redux.md) — Apollo Client and Redux
- [`docs/handbook/10-media-streaming-and-system-design.md`](../handbook/10-media-streaming-and-system-design.md) — Media Streaming and System Design

## docs/operations

- [`docs/operations/CONFIGURATION_AND_ENVIRONMENTS.md`](../operations/CONFIGURATION_AND_ENVIRONMENTS.md) — Configuration and Environments
- [`docs/operations/HTTP_TRANSPORT.md`](../operations/HTTP_TRANSPORT.md) — HTTP Transport
- [`docs/operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — Incident Response
- [`docs/operations/LOCAL_DEVELOPMENT.md`](../operations/LOCAL_DEVELOPMENT.md) — Local Development
- [`docs/operations/OPERATIONAL_OVERVIEW.md`](../operations/OPERATIONAL_OVERVIEW.md) — Operational Overview
- [`docs/operations/PLAYBACK_TELEMETRY.md`](../operations/PLAYBACK_TELEMETRY.md) — Browser Playback Telemetry
- [`docs/operations/REPOSITORY_GOVERNANCE.md`](../operations/REPOSITORY_GOVERNANCE.md) — Repository Governance
- [`docs/operations/RELEASE_PROCESS.md`](../operations/RELEASE_PROCESS.md) — Release Process
- [`docs/operations/RUNBOOKS.md`](../operations/RUNBOOKS.md) — Operational Runbooks
- [`docs/operations/RUNTIME_LIFECYCLE.md`](../operations/RUNTIME_LIFECYCLE.md) — Runtime Lifecycle
- [`docs/operations/RUNTIME_LOGGING.md`](../operations/RUNTIME_LOGGING.md) — Runtime Logging
- [`docs/operations/SLIS_SLOS_AND_ALERTS.md`](../operations/SLIS_SLOS_AND_ALERTS.md) — SLIs, SLOs, and Alerts

## docs/quality

- [`docs/quality/EXPERIMENT_CATALOG.md`](../quality/EXPERIMENT_CATALOG.md) — Experiment Catalog
- [`docs/quality/PERFORMANCE_AND_CAPACITY.md`](../quality/PERFORMANCE_AND_CAPACITY.md) — Performance and Capacity Validation
- [`docs/quality/SECURITY_AND_ACCESSIBILITY.md`](../quality/SECURITY_AND_ACCESSIBILITY.md) — Security and Accessibility Verification
- [`docs/quality/TESTING_STRATEGY.md`](../quality/TESTING_STRATEGY.md) — Testing Strategy

## docs/system-design

- [`docs/system-design/CONTINUE_WATCHING.md`](../system-design/CONTINUE_WATCHING.md) — System Design: Continue-Watching
- [`docs/system-design/EVOLUTION_AND_TRADEOFFS.md`](../system-design/EVOLUTION_AND_TRADEOFFS.md) — Architecture Evolution and Trade-offs
- [`docs/system-design/MEDIA_DELIVERY.md`](../system-design/MEDIA_DELIVERY.md) — System Design: Media Delivery
- [`docs/system-design/SCALE_ASSUMPTIONS.md`](../system-design/SCALE_ASSUMPTIONS.md) — Scale Assumptions

## docs/templates

- [`docs/templates/EXPERIMENT_TEMPLATE.md`](../templates/EXPERIMENT_TEMPLATE.md) — Experiment <ID>: <Title>
- [`docs/templates/FEATURE_SPEC_TEMPLATE.md`](../templates/FEATURE_SPEC_TEMPLATE.md) — Feature Specification: <Name>
- [`docs/templates/HANDOFF_TEMPLATE.md`](../templates/HANDOFF_TEMPLATE.md) — Handoff: <Work Item>
- [`docs/templates/LOCAL_AGENTS_TEMPLATE.md`](../templates/LOCAL_AGENTS_TEMPLATE.md) — Local Agent Contract: <Area>
- [`docs/templates/POSTMORTEM_TEMPLATE.md`](../templates/POSTMORTEM_TEMPLATE.md) — Incident Review: <Title>
- [`docs/templates/RFC_TEMPLATE.md`](../templates/RFC_TEMPLATE.md) — RFC: <Title>
- [`docs/templates/RUNBOOK_TEMPLATE.md`](../templates/RUNBOOK_TEMPLATE.md) — Runbook: <Condition>
- [`docs/templates/WORK_ITEM_TEMPLATE.md`](../templates/WORK_ITEM_TEMPLATE.md) — Work Item: <Outcome>

## docs/references

- [`docs/references/OFFICIAL_REFERENCES.md`](../references/OFFICIAL_REFERENCES.md) — Official References

## docs/extensions

- [`docs/extensions/ENTITLEMENTS.md`](../extensions/ENTITLEMENTS.md) — Extension: Subscriptions and Entitlements
- [`docs/extensions/LIVE_CHANNEL.md`](../extensions/LIVE_CHANNEL.md) — Extension: Scheduled Live Channel
- [`docs/extensions/RECOMMENDATIONS.md`](../extensions/RECOMMENDATIONS.md) — Extension: Recommendations

## evidence

- [`evidence/phase-00/README.md`](../../evidence/phase-00/README.md) — Phase 00 Evidence Index
- [`evidence/phase-00/ai-state-workflow.txt`](../../evidence/phase-00/ai-state-workflow.txt) — Repository Memory Workflow Evidence
- [`evidence/phase-00/clean-checkout-closeout.txt`](../../evidence/phase-00/clean-checkout-closeout.txt) — Clean Checkout and Phase Closeout Evidence
- [`evidence/phase-00/source-quality-foundation.txt`](../../evidence/phase-00/source-quality-foundation.txt) — Source Quality Foundation Evidence
- [`evidence/phase-00/documentation-validation.txt`](../../evidence/phase-00/documentation-validation.txt) — Documentation Validation Evidence
- [`evidence/phase-00/ci-security-foundation.txt`](../../evidence/phase-00/ci-security-foundation.txt) — CI and Security Foundation Evidence
- [`evidence/phase-00/community-governance.txt`](../../evidence/phase-00/community-governance.txt) — Public Contribution Governance Evidence
- [`evidence/phase-00/developer-command-contract.txt`](../../evidence/phase-00/developer-command-contract.txt) — Developer Command Contract Evidence
- [`evidence/phase-00/public-repository-governance.txt`](../../evidence/phase-00/public-repository-governance.txt) — Public Repository Governance Evidence
- [`evidence/phase-00/toolchain-selection.txt`](../../evidence/phase-00/toolchain-selection.txt) — Node.js and pnpm Selection Evidence
- [`evidence/phase-00/workspace-foundation.txt`](../../evidence/phase-00/workspace-foundation.txt) — Git and Workspace Foundation Evidence
- [`evidence/phase-01/README.md`](../../evidence/phase-01/README.md) — Phase 01 Evidence Index
- [`evidence/phase-01/http-adapter.txt`](../../evidence/phase-01/http-adapter.txt) — Express HTTP Adapter Compatibility Evidence
- [`evidence/phase-01/local-platform-checkpoint.txt`](../../evidence/phase-01/local-platform-checkpoint.txt) — Local Platform Checkpoint Evidence
- [`evidence/phase-01/local-reset.txt`](../../evidence/phase-01/local-reset.txt) — Project-Scoped Local Reset Evidence
- [`evidence/phase-01/runtime-configuration.txt`](../../evidence/phase-01/runtime-configuration.txt) — Runtime Configuration Evidence
- [`evidence/phase-01/runtime-lifecycle.txt`](../../evidence/phase-01/runtime-lifecycle.txt) — Runtime Lifecycle Evidence
- [`evidence/phase-01/runtime-logging.txt`](../../evidence/phase-01/runtime-logging.txt) — Runtime Logging Evidence
- [`evidence/phase-01/runtime-runway-preflight.txt`](../../evidence/phase-01/runtime-runway-preflight.txt) — Remaining Runtime Preflight Evidence
