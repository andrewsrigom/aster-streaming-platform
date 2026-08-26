# Work Item: Validate Process-Start Configuration and Classify Secrets

- Status: IN_PROGRESS
- Owner: repository maintainer
- Phase: 01 — Local platform and runtime skeleton
- Requirement IDs: P01-R03; supports OPS-R01, OPS-R02, OPS-R03, QLT-R01, QLT-R04
- Created: 2026-08-26
- Updated: 2026-08-26

## Outcome

Provide a small `@aster/config` workspace package that validates each runtime unit's injected environment before other initialization, returns typed configuration, explicitly classifies secret and non-secret variables, and emits bounded diagnostics that never disclose values classified as secret.

## Current behavior

P01-R01 and P01-R02 provide the verified Docker-only PostgreSQL and Redis checkpoint plus guarded local reset. No application process or reusable runtime package exists, and the repository does not yet validate application environment variables.

## Proposed behavior

Select exact-pinned Zod 4 as the internal schema engine after a Node.js 24 and TypeScript 6 compatibility spike. Add only the reusable configuration boundary, one concrete process-start diagnostic fixture, focused failure/redaction tests, and operator/dependency-decision documentation. Do not add an HTTP server, service scaffold, database client, Redis client, telemetry, `.env` loader, hosted secret integration, or product behavior.

## Boundaries

- Owning context: Cross-cutting runtime infrastructure; no product bounded context or data owner changes.
- Affected services/packages: New `packages/config`; root workspace commands, task graph, lockfile, configuration documentation, Phase 01 evidence, and repository memory.
- Authoritative data: The runtime unit's injected environment is the only source for this work item; Redis and PostgreSQL are not read.
- Read models/caches: None.
- Trust boundaries: Operator/orchestrator-provided environment entries enter trusted application memory only after bounded schema validation. Diagnostic output crosses into logs or a terminal and must contain no secret values.
- External dependencies: Exact-pinned `zod@4.4.3`, kept behind repository-owned configuration types and errors. No network operation occurs at runtime.

## Invariants

- Configuration is validated synchronously before a runtime unit starts other initialization or reports readiness.
- Missing, empty, malformed, or unrecognized owned variables fail closed with a nonzero result.
- Each accepted variable has an explicit `runtime` or `secret` classification; the diagnostic surface does not infer secrecy from names at output time.
- Secret values never appear in success summaries, validation issues, thrown messages, test output, or documentation examples.
- Host environment entries outside the runtime unit's owned prefixes are ignored; unexpected variables inside owned prefixes are rejected by name only.
- The package exports repository-owned types and errors so Zod does not become an application or domain contract.
- No configuration value silently determines a production environment when `ASTER_ENV` is absent.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| Required variable missing or empty | Reject before initialization and return exit code 1 from the diagnostic process | Bounded issue with variable name, classification, and stable reason code |
| Variable has invalid enum, service name, or URL protocol | Reject the complete configuration without returning a partial object | Same bounded issue contract; no input value or third-party message |
| Unexpected variable uses an owned prefix | Reject it so misspellings do not pass silently | Unexpected variable name only; never its value |
| Secret contains credentials or unusual text | Treat it as opaque input after structural validation | Success reports `configured`; failure output remains redacted |
| Schema engine throws unexpectedly | Convert the failure to a repository-owned initialization error without serializing input | Generic internal reason and nonzero exit |

## Data and contracts

- Schema/migration: None.
- GraphQL: None.
- Events: None.
- Cache: None.
- Compatibility: Node.js `24.19.0`, TypeScript `6.0.3`, ESM, pnpm `11.24.0`, and the existing strict compiler/lint rules. The package is server-only and does not load `.env` files.
- Retention/deletion: Parsed secrets live only in process memory for the runtime lifetime. Diagnostics retain classifications and status, not secret values.

## Security and privacy

- Authorization: Not applicable; process configuration is an initialization boundary.
- Input limits: Variable values and owned-variable counts are bounded before schema parsing; service identifiers and URLs have explicit structural limits.
- Sensitive data: Database and Redis URLs are classified as secret because they may contain credentials. Tests use synthetic canary values and assert their absence from all observable errors and diagnostics.
- Abuse cases: Prevent secret disclosure through validation messages, unknown-variable output, exception causes, JSON serialization, or a malformed URL. Reject ambiguous environment selection and typoed owned variables.

## Implementation steps

1. Record Zod selection evidence: compatibility, maintenance, license, security policy, zero transitive dependencies, measured install/runtime footprint, and removal path.
2. Add the workspace package with strict TypeScript build boundaries and repository-owned public exports.
3. Implement bounded environment selection, explicit field classifications, schema validation, sanitized issues, and redacted diagnostics.
4. Add a concrete process-start diagnostic executable and root command that prove success and fail-fast behavior without starting a service.
5. Add focused unit and spawned-process tests for valid input, missing/empty/invalid input, owned-prefix typos, limits, secret canaries, and stable exit/output contracts.
6. Integrate package build, type, lint, unused-code, formatting, architecture, secret, documentation, and CI coverage into existing gates without adding per-commit heavyweight work.
7. Capture raw Phase 01 evidence, update configuration/operator documentation and the technology/decision ledgers, then update repository memory.

## Tests

- Domain: Not applicable; no domain behavior changes.
- Application: Pure loader and diagnostic tests cover typed success, every failure class, aggregation bounds, immutability, and redaction.
- Integration: Spawn the Node.js diagnostic process with isolated synthetic environments and exact exit/stdout/stderr assertions.
- Contract: Compile the exported package declarations and verify only repository-owned configuration contracts are public.
- Browser: Not applicable.
- Performance/failure: Measure bounded cold diagnostic execution and loaded-module memory in the named local environment; no throughput claim. Verify oversized and numerous owned inputs fail within configured bounds.

## Evidence

- Commands: Focused package tests; package build/typecheck; root uncached gate; frozen install; registry audit; redacting secret scan; fresh-checkout diagnostic success and failure.
- Raw artifact path: `evidence/phase-01/runtime-configuration.txt`.
- Acceptance result: P01-R03 is complete only when valid configuration succeeds before other initialization, each adverse case fails closed, canary secrets are absent from all captured output, and local plus protected CI gates pass.

## Rollback or recovery

Revert the coherent P01-R03 change to remove the package, exact dependency, commands, lockfile entries, documentation, and evidence. No durable data, Docker resource, schema, hosted resource, credential, or public API migration is created. If only the selected schema engine must change, retain the repository-owned public contracts and replace its private adapter under focused compatibility and redaction tests.

## Documentation updates

- Update `docs/operations/CONFIGURATION_AND_ENVIRONMENTS.md` with the implemented process-start and diagnostic contract.
- Record the configuration-library decision in `docs/architecture/TECHNOLOGY_BASELINE.md` and `.ai/DECISIONS_LEDGER.md`.
- Index the raw result from `evidence/phase-01/README.md`.
- Update `README.md` only if the focused command belongs in the public local workflow.
- Update `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` at closeout.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
