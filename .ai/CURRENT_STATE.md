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

P02-R09 completes the local API on `feat/p02-identity-session`: durable sessions/profiles, request-scoped entity batching, sanitized outcomes, cookies/CSRF, admission/deadlines and separate finite migrations. Initial candidate: 49 source tasks and 144 Identity tests pass. Eleven real integration scenarios pass in 162778 ms; cleanup 2732 ms, zero remaining. Initial review found late-response header handling and stale status prose; the code fix passes focused HTTP and fresh database acceptance (12545 ms; cleanup 1387 ms). Rebuilt Docker image and six-step product smoke pass; repeated initialization is a no-op and all 189 packaged third-party versions match the frozen source graph. No branch push or pipeline yet. [Evidence](../evidence/phase-02/identity-subgraph.txt).

## Not implemented

- Router, hosted authentication and browser UI.
- Catalog/media/playback, engagement/discovery, advanced Redis/resilience, end-to-end traces/SLOs and hosted release.
- No playable VOD demo exists. Docker now demonstrates local Identity API behavior plus health/recovery/metrics.

## Next outcome

Finish P02-R09: final pre-push gate passes all 49 tasks (34 cached, 17.891 s), 144 Identity tests and high/critical audit; executing-agent confirmation is complete. Publish one coherent Phase 02 PR, require exact-head CI, squash and verify post-merge before Phase 03. The containing candidate commit identifies the source after `5a263e8`. ADR-0014 resolves licensing without changing Aster MIT. No hosted/UI/streaming release is claimed.

## Current risks

- Apollo's authorized Elastic-2.0 dependencies retain their own terms; Aster remains MIT. Audit passes the high/critical gate but reports moderate uuid 9 GHSA-w5hq-g745-h8pq. Installed Apollo calls v1()/v4() without buffers, outside the affected paths; recheck on upgrades. Full candidate verification is pending.
- Local identity must never become a hosted authentication bypass. Ephemeral local signing keys deliberately invalidate local assertions on process restart; database session checks remain mandatory.
- Phase 02 local routes are implemented but not released; the released main remains Phase 01. No hosted JWT/JWKS integration is claimed. Correlated structured operation records are not exported distributed traces.
- Pending outbox facts cap at 128/account and are never silently evicted; further event-producing mutations return backpressure until Phase 08 enables delivery. Names/preferences are deleted immediately; receipts last 24 hours, audit 30 days, with bounded cleanup on mutations.
- Docker proof covers WSL amd64 and Windows localhost access, not native Windows containers/macOS/arm64/rootless/Podman. Samples are not capacity/SLO guarantees.
- Exact local reset irreversibly deletes only validated Aster data. Never reset/prune Docker or WSL or touch unrelated projects.
- No media rights record is approved. Future dependency/provider/media decisions belong to their owning phases. Unrelated Dependabot PR 1 remains untouched.
