# Handoff

## Resume point

1. Phase 01 is released: PR 18 squash `b0544c9c6a86ac1cdb48963707eedf0f0e153621`; protected `33047330768` and exact post-merge `33047629326` pass. All three review threads are resolved. Final confirmation is executing-agent review, not independent approval.
2. P02-R01 locally verified at `64a3aa879f5074e92a2b3b1b7f837b410c798604` on `feat/p02-identity-session`; no push/PR yet. ADR-0013 and the unwired local adapter pass 51 focused cases, 85 total Identity tests and all 49 source tasks (34 cached, 13.872 s), plus audit. Do not repeat unchanged checks.
3. P02-R02 is locally verified: 29 PostgreSQL tests, 91 Identity tests, all 49 source tasks and audit pass; real session scenario 12334 ms, cleanup 1021 ms/zero remaining. Executing-agent confirmation passes. Domain/application sessions, `postgres-sessions`, migration 0001 and the bounded transaction owner are ready for profile reuse. See `evidence/phase-02/account-sessions.txt`. Build dependencies through Turbo, not Identity's standalone tsc. No public transport is wired.
4. Session design must include owner-side PostgreSQL validity/revocation, not signature-only authentication. No public identity headers or request-selected roles/subjects. No hosted provider, paid resource or new deployable.
5. Preserve released runtime behavior until the owning integration slice wires the new adapter. Focused tests first; one affected candidate gate. Heavy Phase 01 evidence remains valid for prose/unwired module changes.
6. Phase 01 hosted closeout metadata is already in the local checkpoint. Do not create a metadata-only PR or another P01 pipeline.
7. P02-R03 is active: use the new plan for owned profiles, active selection, deletion/audit and transactional outbox. No profile implementation exists yet. Phase 02 context, product requirements and data/event architecture have been reread; inspect concrete normalization/limit/deletion policy before writing migration 0002. No broker relay until Phase 08.

## Do not do yet

- No public signup/recovery/email/MFA UI, hosted identity credentials or later-phase product work.
- No Router trust shortcut, cross-context database access or Redis session authority.
- No broad Docker/WSL reset/prune, unrelated resources, protection bypass or unrelated dependency-major update.
