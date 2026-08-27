# Current State

Last updated: 2026-08-27

## Active phase

**Phase 02 — Identity and Viewer Profiles**

Status: **IN_PROGRESS**

## Verified

- Phase 00 and every Phase 01 requirement are released. PR 18 squash `b0544c9c6a86ac1cdb48963707eedf0f0e153621` is the clean main base.
- Final protected run `33047330768` passes all six jobs at `b9f816a`; exact post-merge `33047629326` passes every applicable job (dependency review correctly skipped for push).
- Both prove packaged UID 1000, real health/six metric families and eight real integration scenarios. Post-merge matrix: 153008 ms; cleanup: 1053 ms, zero residual fixture resources. Audit passes.
- Local clean source `38801ce` proves Docker-only startup without host Node/pnpm, occupied-port recovery, safe reset and 49/49 uncached tasks. Documentation-only later changes do not invalidate it. Full details: [Phase 01 evidence](../evidence/phase-01/README.md).
- Automated initial/confirmation reviews found three stale status claims, all corrected/resolved. Executing-agent confirmation covered the final source-backed prose sweep; no independent approval is claimed.
- Exact Node 24.19.0/pnpm 11.24.0, strict source/memory/security checks, staged-only hooks and protected squash-only main remain in force. No unrelated Docker resource was changed.

## Current work

P02-R01 through P02-R08 are locally verified on `feat/p02-identity-session`: signed identity, durable sessions, owned profile CRUD/selection, retry receipts, audit and transactional outbox. Migration 0002 preserves the account/session owner. Current source passes 111 Identity tests, 29 PostgreSQL tests, all 49 canonical tasks (34 cached, 16.103 s), audit and executing-agent initial/confirmation review. Real profile scenario: 10780 ms; cleanup 1048 ms, zero remaining. [Raw evidence](../evidence/phase-02/profiles-outbox.txt) records concurrency, isolation, rollback, deletion, retention/backpressure and restrictive migration proof. P02-R09 is active for cookie/GraphQL transport. Released health runtime is unchanged; no branch push or new pipeline.

## Not implemented

- Runtime wiring of product persistence/migrations, cookie/CSRF protection, GraphQL/Federation, clean product seed and browser UI.
- Catalog/media/playback, engagement/discovery, advanced Redis/resilience, end-to-end traces/SLOs and hosted release.
- No playable VOD demo exists. The current Docker command demonstrates health/recovery/metrics.

## Next outcome

P02-R09: expose the guarded local Identity subgraph, sanitized outcomes and cookie/CSRF boundary; wire finite startup/migration ownership and prove empty-state product access. Group remote publication with this runnable product candidate.

## Current risks

- Local identity must never become a hosted authentication bypass. Ephemeral local signing keys deliberately invalidate local assertions on process restart; database session checks remain mandatory.
- Phase 01 runtime still exposes health only. Owner-side profile authorization is locally verified, but no public authentication route, cookie control or hosted JWT/JWKS integration is claimed.
- Pending outbox facts cap at 128/account and are never silently evicted; further event-producing mutations return backpressure until Phase 08 enables delivery. Names/preferences are deleted immediately; receipts last 24 hours, audit 30 days, with bounded cleanup on mutations.
- Docker proof covers WSL amd64 and Windows localhost access, not native Windows containers/macOS/arm64/rootless/Podman. Samples are not capacity/SLO guarantees.
- Exact local reset irreversibly deletes only validated Aster data. Never reset/prune Docker or WSL or touch unrelated projects.
- No media rights record is approved. Future dependency/provider/media decisions belong to their owning phases. Unrelated Dependabot PR 1 remains untouched.
