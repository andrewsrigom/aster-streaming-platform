# Phase 02 Evidence Index

- Phase status: IN_PROGRESS
- Active item: P02-R09; P02-R01 through P02-R08 locally verified, not yet published
- Base: Phase 01 PR 18 squash `b0544c9c6a86ac1cdb48963707eedf0f0e153621`; exact post-merge run `33047629326` passes.

| Requirement | Artifact | Checkpoint status |
|---|---|---|
| P02-R01 identity/session trust | [ADR-0013](../../docs/adr/0013-local-identity-and-sessions.md), [raw adapter evidence](identity-boundary.txt) | Local adapter implemented; 51 focused cases and all 49 source tasks pass; product integration remains planned |
| P02-R02 account/session persistence; supporting R09/R10 failure cases | [Raw database evidence](account-sessions.txt), [migration/recovery](../../services/identity/migrations/README.md) | Locally verified; real database scenario, 29 PostgreSQL tests, 91 Identity tests, all 49 source tasks and audit pass; executing-agent confirmation complete |
| P02-R03 through P02-R08 owned profiles and transactional facts; supporting R10 | [Raw profile evidence](profiles-outbox.txt), [policies and migrations](../../services/identity/migrations/README.md) | Locally verified; 111 Identity tests, real concurrency/isolation/rollback/retention/deletion checks, all 49 source tasks and audit pass |

P02-R09/R10 integrates the earlier checkpoints: [HTTP/database/Docker evidence](identity-subgraph.txt), [schema artifact](identity-schema.graphql), [API guide](../../services/identity/README.md). All 49 source tasks, 144 Identity tests, eleven real integration scenarios and the Docker six-step product smoke pass locally. Initial review remediation has focused HTTP/database proof; final candidate confirmation and protected release remain pending. The table above records historical slice results, not missing runtime wiring.

Persistence is now wired to the guarded local API and runtime. Owner authorization accepted [ADR-0014](../../docs/adr/0014-apollo-federation-license-policy.md); no dependency-license pause remains. Hosted authentication, Router and browser UI remain planned. Earlier checkpoint results are historical, not proof of later changed source.
