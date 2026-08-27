# Work Item: Generated media and runnable Catalog

- Status: IN_PROGRESS
- Owner: Catalog
- Phase: 03
- Requirement IDs: P03-R04, P03-R09; preserves P03-R01 through P03-R10
- Created: 2026-08-27
- Updated: 2026-08-27

## Outcome

Run the real read-only Catalog subgraph in the local Docker profile, prove publication through existing editorial application commands using a byte-validated generated HLS fixture, and retain reviewed, non-approved real-film candidates with explicit unresolved rights facts. This is not a playable film release or the Phase 06 worker.

## Current behavior

08a06ca contains locally verified Catalog lifecycle, immutable rights/audit/outbox, operator CLI and public Federation queries. The 91 tests and SQL/HTTP evidence use synthetic attestations, not generated media bytes. No Catalog Docker runtime exists.

## Proposed behavior

Add a Catalog-owned composition root and read-only database login, compose its finite initializer and healthy HTTP runtime, generate a small deterministic HLS package outside the server, and verify its attestation before the normal publication commands. Review two official film sources without downloading films. Keep unresolved candidates invisible.

## Boundaries

- Owning context: Catalog owns editorial state, rights and publication pointers.
- Affected services/packages: services/catalog, infra/docker, infra/compose, focused tools/tests.
- Authoritative data: PostgreSQL Catalog schema; no cross-context reads.
- Read models/caches: existing live public_candidates view; no Redis cache.
- Trust boundaries: HTTP untrusted/read-only; explicit local initializer holds admin authority; operator cannot write attestations; generated files are untrusted until validated.
- External dependencies: PostgreSQL and pinned Docker/FFmpeg tooling; public official rights pages are evidence, never implicit asset permission.

## Invariants

- No film acquisition or publication without complete rights; candidate uncertainty stays NEEDS_CLARIFICATION.
- No FFmpeg or video proxy in the request server; resource-limited, network-disabled generation.
- No fake production media URL or playback claim; synthetic local fixture remains labelled and excluded from real-film approval.
- Reader credentials cannot mutate Catalog or read Identity; no admin/operator credentials in the HTTP container.

## Failure behavior

| Failure | Expected behavior | Telemetry |
|---|---|---|
| PostgreSQL/schema/authority unavailable | Readiness fails, GraphQL rejects, bounded probe recovers | Sanitized readiness and dependency outcomes |
| Termination or request disconnect | Stop admission, cancel/drain within deadline, close resources | Lifecycle and operation outcomes |
| Generator timeout, invalid playlist, absent/corrupt segment | No attestation/publication; scoped temporary cleanup | Bounded technical report, nonzero exit |
| Uncertain source permissions | Candidate retained, approval denied | Reviewed evidence and unresolved facts |

## Data and contracts

- Schema/migration: use existing 0001–0003; local initializer provisions a least-privilege reader login.
- GraphQL/events: existing contracts unchanged; publication flows through existing application transactions/outbox.
- Cache: none; no-store remains.
- Compatibility: preserve existing metadata decoding and idempotency receipts.
- Retention/deletion: immutable rights/audit; only new labelled disposable experiments cleaned up. Preserve retained demo and unrelated resources.

## Security and privacy

- Authorization: explicit local process authority; runtime only receives reader credentials.
- Input limits: existing GraphQL bounds; finite process, output, file count/size and generation deadline.
- Sensitive data: synthetic fixtures only; no URL credentials or raw errors in logs/evidence.
- Abuse cases: privilege substitution, missing migrations, malformed manifests, escaping paths, symlinks, oversized output and cancellation.

## Implementation steps

1. Compose and test Catalog runtime/readiness/shutdown with PostgreSQL-only dependency.
2. Add Docker runtime/init and a scoped real-container verification.
3. Pin isolated generator, validate repeated HLS output and publication via Catalog commands.
4. Record two official candidate-source reviews and test unresolved publication rejection.
5. Run phase acceptance, author review/confirmation, consolidate evidence and memory; publish one coherent Phase 03 candidate only when accepted.

## Tests

- Domain/application: reuse lifecycle/rights/editorial tests; generated attestation positive and invalid/absent negative paths.
- Integration: real PostgreSQL reader isolation, schema check, Docker HTTP browse, dependency outage/recovery and graceful shutdown; idempotent initializer.
- Contract: existing Federation composition and public queries unchanged; bounded HLS references/checksums/probe and captions.
- Browser: not applicable until Phase 05; no browser playback claim.
- Performance/failure: measured resource/deadline behavior, not a capacity/SLO claim.

## Evidence

- Commands: focused Catalog build/tests, generator tests/run, scoped Docker acceptance, pnpm check:changed and full phase gate before merge.
- Raw artifact path: evidence/phase-03/catalog-runtime.txt and generated-media.txt.
- Acceptance result: candidate gate 52/52 and author confirmation pass; clean-source full phase acceptance and remote release remain pending. See evidence/phase-03/catalog-runtime.txt and generated-media.txt.
- Iteration gate: focused compile and changed-boundary tests.
- Candidate gate: pnpm check:changed plus real Catalog Docker/media checks.
- Heavyweight repeat triggers: Docker/config/runtime/schema changes repeat affected Docker scenarios; recipe/validation changes repeat generation. Unchanged Identity and prior Catalog ownership evidence remain supporting evidence, not new runs.
- Review stopping rule: one complete author initial review, batched blockers, one confirmation; extend only for requirement/security/data/availability/public-contract blockers.

## Rollback or recovery

Stop only the new Catalog service; retain existing database/audit and Identity demo. Revert runtime/tooling changes without dropping product data. Preserve expanded metadata decoder. Clean only validated disposable experiment names and labels. No broad prune, reset, new hosted resources or protection bypass.

## Documentation updates

Update runtime/fixture commands, source reviews and attribution, phase evidence index, relevant operational limits and repository memory at a meaningful checkpoint.

## Completion checklist

- [ ] Requirements satisfied
- [ ] Tests pass
- [ ] Evidence captured
- [ ] Documentation current
- [ ] `.ai/` state updated
- [ ] Remaining risks recorded
