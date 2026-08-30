# Work Item: Dependency policy registry and bounded safe reads

- Status: IN_PROGRESS
- Owner: Platform owns reusable execution; Playback and Discovery own their Catalog reads
- Phase: 11
- Requirement IDs: P11-R01, P11-R02, P11-R03, P11-R04, P11-R06, P11-R11
- Created: 2026-08-29
- Updated: 2026-08-29

## Outcome

A checked-in registry states criticality, idempotency, deadline, attempts,
backoff, breaker, concurrency, fallback, telemetry and user outcome for every
current dependency operation class. One reusable runtime policy proves the
deadline/retry rules on two concrete, read-only Catalog clients without changing
authorization, rights, durable writes or Router retries.

## Current behavior

Phase 10 is released as `eed8229`; exact-main run `33282217705` passed. This
branch is based on that exact released tree. Requests already propagate
AbortSignal cancellation, Router/subgraph timeouts are nested, dependency clients
have attempt deadlines and finite concurrency, broker/relay retries are bounded,
and unsafe or indeterminate writes are not retried. Owner HTTP read policies are
distributed across code and ADRs and currently make one attempt.

## Proposed behavior

Accept ADR-0040 to supersede only ADR-0027's one-attempt clause for the fixed,
read-only Playback Catalog operation and to refine ADR-0035's equivalent
Discovery execution policy. Every existing authority and trust decision remains.

Inventory each existing PostgreSQL, Redis, broker, object-storage, owner HTTP,
media-process and Web/Router operation class in one registry. Distinguish
application attempts from vendor connection recovery and asynchronous outbox
delivery. Preserve one retry layer: Apollo Client and Router do not retry these
subgraph reads.

Add a framework-free runtime safe-read executor with one overall deadline. It
admits at most two attempts, never starts attempt two unless the remaining budget
covers its ceiling plus response reserve, and applies equal-jitter exponential
backoff from an injected random source. Only an explicit transient classification
from a safe read can retry. Cancellation, validation, authorization, not-found,
malformed response, permanent HTTP status, unknown transaction outcome and local
capacity never retry.

Apply it first to Playback's current-publication read and Discovery's Catalog
snapshot/export reads. Preserve fixed endpoints, operations, credentials,
response bounds and outer concurrency lanes. A retry remains inside one admitted
operation and cannot increase active callers.

## Boundaries

- Catalog remains publication/snapshot authority; Playback and Discovery own only
  their use of results; Platform owns generic execution.
- Affected code: `packages/runtime`, the two Catalog HTTP clients, focused tests,
  resilience architecture/registry and Phase 11 evidence.
- Authoritative data, persistence, cache and event contracts are unchanged.
- Trust boundaries: fixed private HTTP responses, abort signals, Node transport
  errors, status classification, injected clock/randomness and finite telemetry.
- Existing Node 24 HTTP is the only external dependency; no package or service.

## Invariants

- Original caller cancellation and one operation deadline bound every attempt,
  wait, parse and cleanup.
- Only safe Catalog reads retry; no mutation, SQL write or publication does.
- Malformed or semantically invalid owner data never becomes transient success.
- One retry does not escape the existing client concurrency lane.
- Authorization and rights failures have no fallback to allow.
- Telemetry uses fixed values, never URLs, IDs, credentials, queries or errors.
- Router, Apollo Client and the downstream client do not retry the same operation.

## Failure behavior

| Failure | Result |
|---|---|
| Caller abort | Cancel immediately; no new attempt |
| Overall budget exhausted | Existing unavailable or cancelled result |
| Selected reset or transient 502/503/504 | Retry once only if budget permits |
| Attempt timeout | Destroy transport and stop; never overlap attempts |
| 4xx, redirect, invalid headers/body/envelope | Permanent unavailable; no retry |
| Local concurrency full | Existing controlled rejection; no retry |
| Random, clock or observation failure | Fail closed without unbounded work |

## Data and contracts

- PostgreSQL, event and cache schemas: unchanged.
- GraphQL/public operations: byte-compatible.
- Runtime contract: additive generic types and executor.
- Client return unions remain unchanged; no durable data or new background queue.

## Security and privacy

Retry classification is finite and owned by the transport adapter. No caller can
select endpoint, operation, attempts, timing or classification. Credential
separation, exact Host/Origin, response bounds and cancellation remain. Retries
never add or broaden a cookie or service credential.

## Implementation steps

1. Record ADR-0040, the dependency-operation registry and retry-layer ownership.
2. Add the deterministic, cancellable safe-read executor and adverse tests.
3. Integrate Playback publication and Discovery snapshot/export reads.
4. Prove transient retry, permanent non-retry, deadline exhaustion, cancellation,
   finite concurrency and no Router/client amplification.
5. Run focused gates, affected candidate, review and protected evidence.

## Tests

- Runtime: invalid policy, transient then success, permanent stop, cancellation,
  insufficient budget, equal-jitter bounds and attempt ceiling.
- Clients: reset/503 then success; 4xx/malformed/no-capacity no retry; timeout
  cleanup; existing response and credential assertions unchanged.
- Contract: registry covers every operation class and each retry layer has one owner.
- Integration: one controlled owner failure over real HTTP; no Docker repeat
  unless runtime composition changes.

## Evidence

- Iteration: Runtime and affected client build/tests plus scoped static checks.
- Candidate: `pnpm check:changed` and the policy-registry verifier.
- Heavyweight repeat triggers: HTTP wire/cleanup changes repeat focused real-HTTP
  tests; Router retry/timeout changes repeat composition/browser runtime; no
  PostgreSQL, Redis, broker, media or demo repeat without affected behavior.
- Review stopping rule: one complete review, batched blocker remediation and one
  confirmation; speculative tuning waits for game-day evidence.
- Raw paths: `evidence/phase-11/dependency-policies.txt` and retry timing trace.

## Rollback or recovery

Restore the two clients to one attempt and retain the registry as current-state
documentation. No migration, cache deletion, event replay, media action,
credential rotation or infrastructure reset is required.

## Documentation updates

Dependency policy registry, resilience architecture, affected client docs, Phase
11 evidence/index and repository memory.

## Completion checklist

- [ ] Requirements satisfied in implementation and focused contracts
- [x] Local candidate tests pass
- [ ] Evidence captured
- [x] Documentation current
- [x] `.ai/` state updated
- [ ] Remaining risks recorded
