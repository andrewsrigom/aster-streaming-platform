# Phase 13 Evidence Index

Status: **in progress**. Item64 implements P13-R01/R02/R12 in the current
candidate: deterministic trusted-operation artifacts, explicit audit/enforce
startup policy, exact name/document-hash admission, finite telemetry and safe
schema/client rollout. Focused tests and the 49/49 affected candidate gate pass.
Implementation source `f531298dd5fd1526c260ab411213189f16ccfdf0`, tree
`81860cc5d803f2170afa6650a563a646a1bbf4cc`, records that result. The real
packaged Router proof, protected CI, review and release are not yet verified.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P13-R01 | [Apollo manifest](../../infra/router/generated/persisted-query-manifest.json), [finite matcher](../../infra/router/generated/trusted-operations.rhai) and [trusted-operation evidence](trusted-operations.txt) |
| P13-R02 | Explicit local/integration audit and hosted enforce policy plus the pending disposable real-Router proof in [trusted-operation evidence](trusted-operations.txt) |
| P13-R12 | [ADR-0045](../../docs/adr/0045-source-owned-trusted-operations.md), GraphQL architecture and release sequence |
| P13-R03–R11 | Planned in queue items65–67; no closeout claim |

## Current limitations

- The local Docker engine is unavailable at the bounded host checkpoint. Source
  tests do not substitute for the protected packaged Router proof.
- Audit mode intentionally accepts ad hoc local/integration documents and is not
  a public-deployment security control.
- A trusted document is not user authority. Owner authorization remains required.
- Shape/cost, identity-aware rate, cache-scope, N+1/query-count and authorization
  matrices remain later Phase 13 work.
- Hosted providers, credentials, deployment and capacity remain Phase 14.
