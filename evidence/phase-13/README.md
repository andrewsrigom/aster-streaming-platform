# Phase 13 Evidence Index

Status: **in progress**. Item64 implements P13-R01/R02/R12 in the current
candidate: deterministic trusted-operation artifacts, explicit audit/enforce
startup policy, exact name/link-ready-wire-hash admission, finite telemetry and
safe two-version schema/client rollout. Focused tests and the corrected 49/49
affected candidate gate pass. Protected run `33352310376` verifies the packaged
Router enforcement, telemetry, owner runtimes and playable demo. Confirmation
discussion `3891493400` then found a CI-classification gap for verifier-only
changes. Source `b85230d21bd733cc27337f2d8e9e8fd8068bb6f6`, tree
`05532b639091e8fb54e547e282230ccbfa313258`, corrected it and protected run
`33354040239` passed. Blocker-focused confirmation discussion `3891588767`
then found same-name manifest versions collapsed by the Web tests. Source
`effc7fd705f149eba193a619d70c0e0039f767ea`, tree
`0acdba2a73e63841513c54950aeaffe8cf7356fa`, indexes every version per name and
passes Web119/119 plus the 49/49 gate; exact-head CI and confirmation remain.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P13-R01 | [Apollo manifest](../../infra/router/generated/persisted-query-manifest.json), [finite matcher](../../infra/router/generated/trusted-operations.rhai) and [trusted-operation evidence](trusted-operations.txt) |
| P13-R02 | Explicit local/integration audit, hosted enforce policy and passed disposable real-Router proof in [trusted-operation evidence](trusted-operations.txt) |
| P13-R12 | [ADR-0045](../../docs/adr/0045-source-owned-trusted-operations.md), GraphQL architecture and release sequence |
| P13-R03–R11 | Planned in queue items65–67; no closeout claim |

## Current limitations

- The local Docker engine was unavailable at the bounded host checkpoint; the
  protected disposable runtime supplied the packaged Router proof.
- Audit mode intentionally accepts ad hoc local/integration documents and is not
  a public-deployment security control.
- A trusted document is not user authority. Owner authorization remains required.
- Shape/cost, identity-aware rate, cache-scope, N+1/query-count and authorization
  matrices remain later Phase 13 work.
- Hosted providers, credentials, deployment and capacity remain Phase 14.
