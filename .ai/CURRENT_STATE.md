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

P02-R01 and P02-R02 are locally verified on `feat/p02-identity-session`. Accounts/sessions use bounded one-client transactions, owner-held SQL and migration 0001. The real PostgreSQL scenario passes concurrent resolution/limits, rollback, revocation, restart, timeout/cancellation and restrictive migration round-trip (12334 ms; cleanup 1021 ms, zero remaining). Current source passes 91 Identity tests, 29 PostgreSQL tests, all 49 canonical tasks (33 cached, 14.369 s), audit and executing-agent confirmation. [Raw evidence](../evidence/phase-02/account-sessions.txt) includes exact fingerprints, commands and limits. P02-R03 is now active for profiles/outbox. The released health runtime is unchanged and this branch is not pushed.

## Not implemented

- Runtime wiring of account/session persistence and migrations; profile rules/ownership, product seed, GraphQL/Federation and browser UI.
- Catalog/media/playback, engagement/discovery, advanced Redis/resilience, end-to-end traces/SLOs and hosted release.
- No playable VOD demo exists. The current Docker command demonstrates health/recovery/metrics.

## Next outcome

Implement P02-R03 through P02-R08: owned profile CRUD, explicit active selection, idempotent deletion/audit and versioned transactional outbox. Use the existing bounded transaction owner. Cookie/GraphQL transport remains the following item; group remote publication with a coherent product candidate.

## Current risks

- Local identity must never become a hosted authentication bypass. Ephemeral local signing keys deliberately invalidate local assertions on process restart; database session checks remain mandatory.
- Phase 01 runtime still exposes health only. No new authentication route, cookie control, profile authorization or hosted JWT/JWKS integration is claimed.
- Docker proof covers WSL amd64 and Windows localhost access, not native Windows containers/macOS/arm64/rootless/Podman. Samples are not capacity/SLO guarantees.
- Exact local reset irreversibly deletes only validated Aster data. Never reset/prune Docker or WSL or touch unrelated projects.
- No media rights record is approved. Future dependency/provider/media decisions belong to their owning phases. Unrelated Dependabot PR 1 remains untouched.
