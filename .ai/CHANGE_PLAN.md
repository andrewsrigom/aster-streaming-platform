# Work Item: Owned outbox delivery and profile-deletion cleanup

- Status: IN_PROGRESS
- Owner: Engagement; Identity and Catalog retain their outboxes
- Phase: 08
- Requirement IDs: P08-R09, P08-R10, P08-R12
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

Publish committed owner facts at least once, consume authenticated Identity deletion without duplicated effects, and prove cleanup plus reconstruction of continue-watching from durable progress.

## Current behavior

PR30 head e42a365 failed CI33209032494 at the standalone Catalog Docker proof: its first-run assertion still requires migrations 1–8, while the reviewed migrator now applies 1–9. Source quality, all real shared-platform scenarios, generated Catalog publication and the independent Local platform job passed. Correct this proof and add a cheap migration-list alignment regression; production SQL and runtime behavior do not change. The local R11 reporter checkpoint is safely preserved in stash1643f0b7fa5b82d3f0ba3828414d4e3c92a107d1 on feat/p08-player-progress. Restore that exact checkpoint once after predecessor correction/rebase; all older restored stashes remain forbidden. No review submission or comment exists yet.

P08-R07/R08 are DONE at main d7fa03a; this R09 candidate is rebased there. Latest 54 focused, 24 CI/platform and six shutdown/platform tests pass, plus real SQL including maximum quarantine bytes. Real Kafka observations prove delivery, poison/replay/offsets and outage recovery. Corrected SIGTERM validation passes against captured exit143 and completed lifecycle logs. The [candidate gate](../evidence/phase-08/events-candidate.txt) passes 70/70 tasks and exact-base composition after behavior-preserving static-check remediation. Protected execution of the complete corrected supervisor and review/release remain; no retained migration or host diagnostic loop.

## Proposed behavior

[ADR-0034](../docs/adr/0034-owned-event-delivery.md): finite owner relays, short SQL claims and fenced acknowledgements, unchanged v1 envelopes, bounded broker headers and explicit initial-backlog consumption. Engagement validates signed Identity facts, atomically fences/deletes owned profile data and records completion; poison messages enter bounded private quarantine with exact replay.

## Boundaries

Identity, Catalog and Engagement own all their writes. Shared event-delivery mechanics have three concrete owner outboxes, no new service. Existing PostgreSQL/Kafka/runtime adapters remain. Separate narrow local relay/consumer credentials do not widen normal request roles. A dedicated Identity-event key authenticates destructive facts; it is not a Router, viewer or private-read credential. No cross-owner SQL, Redis authority, media or browser change.

## Invariants

Business transaction commits before broker I/O; failed/ambiguous publication or acknowledgement retains the pending fact. First deliveries follow aggregate version; late duplicate delivery never reverses a consumer. Deletion locks the same permanent guard as writers and cannot resurrect a profile. Offsets advance only after durable effect, duplicate recognition or durable quarantine. Continue-watching remains a read of authoritative progress, not a redundant event-built store.

## Failure behavior

Broker/relay failure delays delivery and eventually reaches existing finite outbox backpressure; it never acknowledges a lost save or gates public media. SQL/lease uncertainty retries only the same safe event after expiry. Every operation has cancellation/deadline, one in-flight relay per owner and one handler, no waiting queue. Invalid signatures, keys, versions and envelopes cannot delete data. Full quarantine/tombstone capacity leaves the offset uncommitted. Emit finite correlated outcomes, no raw events or identifiers as metric labels.

## Data and contracts

Additive owner migrations introduce a fenced relay state and restricted claim/ack functions; Engagement adds deletion audit and finite quarantine. Keep existing envelope IDs/versions and partition by aggregate ID. Local topics are explicitly initialized, one partition, existing one-hour/16-MiB retention. Identity deletion may cancel pending Engagement facts with an auditable count, as ADR-0030 allows; already-brokered facts expire by retention. Permanent deletion fences are not evicted. No GraphQL contract change.

## Security and privacy

Broker input is untrusted. HMAC-SHA256 binds a dedicated local Identity-event key to topic, key and exact envelope bytes; only Identity and Engagement mount it. Bound header count/bytes and event size before JSON/crypto. SQL functions use fixed search paths and explicit grants. Quarantine is private, bounded and never logged. Hosted ACLs/TLS/rotation remain Phase 14, not implied by this local mechanism.

## Implementation steps

1. Implement finite relay/wire contracts and signed-event tests.
2. Add owner claim/ack migrations/adapters and real SQL fencing/replay proof.
3. Add Engagement deletion/duplicate/quarantine/replay and source-rebuild checks.
4. Wire optional background delivery into existing lifecycles and explicit broker setup. Use infra/compose/events.yml to keep base browsing/playback broker-independent. Verify overlay initialization, exact cleanup and durable event-key retention.
5. Run real Kafka/SQL/Docker acceptance, consolidate evidence and publish after R08 closeout.

## Tests

Completed runtime corrections: bounded tmpfs masks for Kafka-init image volumes, Router refresh after owner replacement, supported broker recovery, bounded rebalance and independent relay. Real SQL/Kafka recovery evidence covers these changes. Candidate-only corrections are an erased type export, key-buffer rename, equivalent fixture URL construction and formatting; 14 focused regressions and the full canonical gate pass. No repeated retained demo or host diagnostic change.

Unit: publication-before-ack, cancellation/ambiguity, admission, codec/signature substitution, duplicate/order handling and backoff. Integration: real owner roles/migrations, claim races/lease expiry, atomic cleanup/write race, poison/capacity/replay and source reconstruction. Contract: unchanged envelopes, broker headers/initial offsets, no foreign SQL or request-role privilege widening. Runtime: broker outage/recovery, backlog, graceful stop and public Playback continuity. Browser/media/CPU checks are not applicable to this backend slice.

## Evidence

CI correction candidate passes70/70 tasks (58cached,1m4.525s) and exact d7fa03a composition. First69/70 round only hit the session-log heading limit; consolidated same-session prose without dropping history. Later changes only record these results. Initial/confirmation review and the corrected hosted runtime gate remain mandatory.

Iteration gate: focused node:test and strict affected build/lint. Candidate gate: check:changed with concurrency two plus composition compatibility. Acceptance: isolated real PostgreSQL/Kafka and owner runtime evidence under evidence/phase-08. Repeat heavy checks only after changes to measured SQL, transport trust, delivery ordering or runtime wiring. One initial and one confirmation review; additional rounds only for requirement/security/data/availability/public-contract blockers.

## Rollback or recovery

Stop background delivery; retain schemas, pending outboxes, quarantine and permanent deletion fences. Drain before migrating, then use compatible binaries or roll forward: old Engagement readiness and finite migrators can reject new versions. Down migrations are empty/idle-state only, never a way to undo deletion or discard uncertain claims. Retain the event signing key with signed backlog. R09 is already rebased onto R08's completed squash; never reapply restored stashes.

## Documentation updates

Owner migration guides, data/event contract and one operational replay/cleanup runbook, evidence index and concise repository memory at candidate/closeout checkpoints.

## Completion checklist

- [x] Relay and consumer behavior implemented
- [x] Local 70-task candidate gate and exact-base composition pass
- [ ] Focused, SQL, Kafka and runtime acceptance pass
- [ ] Evidence, operations and memory current
- [ ] R08 closed; own protected review/CI/merge and exact post-merge pass
