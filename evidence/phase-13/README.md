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
passes Web119/119 plus the 49/49 gate and protected run `33355546182`. Follow-up
discussions `3891672851`/`3891672854` found retained-body reprinting and an
unsafe pre-union rollback. Source `5f4a3150ba4085677b710168d64d22195de48a0c`,
tree `7c15d92500209b72a80fa46a276958cf86a3332f`, preserves reviewed retained
bytes and defines the union Router rollback floor; protected run `33357231869`
passes. Discussion `3891772219` then found AST source locations omit ignored
leading/trailing bytes. Source `0bcdd68833c23f1ae61a1c07f5f93ac5d9d989e1`,
tree `7ad2f2d88d5c2848265f6bbf568ba4168aee3562`, uses bounded versioned JSON with
explicit body strings and proves boundary-inclusive bodies/hashes. Router11/11
and the gate49/49 with38 cached in45.499 seconds pass. Evidence head `66fcab71`
passed protected run `33359022739`; discussion `3891772219` is resolved.
Confirmation discussion `3891915868` found Router generator-only changes could
skip platform CI. Source `64fa64e7650e422e4b1a4405555521afc95921bd`, tree
`35817101dd1cb1126b2bddb2a2e9646938f760d0`, routes the complete Router package
through that proof. CI policy38/38 and the repeated gate49/49 with36 cached in
64.294 seconds pass. Protected run `33360643657` attempt2 passed every required
job after attempt1's transient TraceQL indexing timeout; discussion `3891915868`
is resolved. Blocker-focused discussion `3895588146` then found the runtime
proof could select a retained `Browse` body while sending current variables.
Source `2286c7f71a82011c2eb083cdf52de07dc7301f51`, tree
`d253a5e8e69abf18c29e8dd432b3c4225958aa73`, joins the persisted operation to
the unique current schema-manifest hash and fails closed on missing/ambiguous
joins. Platform92/92 and gate49/49 with33 cached in98.949 seconds pass. Evidence
head `a4e849f` passed protected run `33406328754` and discussion `3895588146` is
resolved. Final audit found the delivery manifest still indexed the retained
union, so that unique-current join would fail during overlap. Final source
`a353164b36a7124c1721915ee07be09ca561de78`, evidence head `de50b3e`, keeps the
Apollo manifest/matcher union while indexing exactly one current hash per name.
Protected run `33410126892` and clean exact-head confirmation pass. PR52
squash-merged as tree-identical main `fb5cf014`; exact-main run `33412728404`
passes every required job. Item64 is released.

Item65 initial source `36b6af2cb114aa4dad2afddc39142ad5e5878c28`, tree
`e8fc58bbcbe3899b7b420adcdedfbd867173de0b`, implements the local
P13-R03/R04/R05/R10 candidate. Federation v2.9 owner metadata and deterministic
trusted-operation analysis now bound aliases, depth, roots, selections, list
expansion and cost. The 25-operation calibration, adverse source coverage and
pre-rebase 54/54 gate and exact rebased 51/51 affected candidate gate pass.
PR55 run `33415238912` exposed an HTTP-status mismatch in the runtime verifier;
initial review discussion `3896477418` found the 32 KiB bound omitted the JSON
operation envelope. Corrected source `96dc6ea`, tree `c708f9e`, passes
Router19/19, verifier2/2 and the corrected 51/51 gate. Corrected packaged
run `33416680451` then exposed the verifier's guessed introspection code/location.
Source `55875ce`, tree `9ac71a9`, matches pinned Router's exact finite redaction
and passes the repeated 51/51 gate. Exact head `0fd6c78` passed protected run
`33417515807`, and initial discussion `3896477418` is resolved. Confirmation
discussion `3896804794` found implicit non-root entity field cost. Source
`8395f79`, tree `0a026a6a`, requires direct cost on every selected field of a
cost-owned type while preserving the 25 calibrated profiles; Router20/20 and
gate51/51 pass. Exact head `9f23640`, tree `7812620d`, passed protected run
`33420810495` attempt2. Discussion `3896804794` and both review threads are
resolved; confirmation comment `5482516972` found no major issue. Final
candidate head `94c17b9`, tree `d034c03`, passed protected run `33424006919`.
PR55 squash main `8cd6c0b` retained that tree and exact-main run `33425758870`
passed on attempt2 after one isolated TraceQL indexing timeout. Item65 is
released.

Item66 implements the local P13-R06/R11 candidate from exact main `8cd6c0b`.
[ADR-0047](../../docs/adr/0047-bounded-graphql-execution-rate-and-cache-scope.md)
adds exact runtime/cache classification, authorized-account Identity
profile-command admission and PostgreSQL-only readiness. Initial source
`a090285`, tree `98d3064`, passed gate54/54; evidence head `59b7215` opened
PR56. Protected run `33432579598` found a real Identity assertion and invalid
Router response-header YAML. Initial discussion `3897861197` found exact durable
retries could spend a fresh rate admission before receipt replay. Corrected
head `82ba630` passed protected run `33437257163` and the initial discussion is
resolved. Confirmation discussion `3898385895` found the 30-second marker could
expire before the 86,400-second receipt. Second corrected source `bf14e2c`, tree
`0084c67`, authorizes and reads the retained PostgreSQL receipt before admission;
only missing receipts reach the limiter. Identity162/162, Router21/21,
telemetry19/19 and focused verifiers pass. Full real integration passed all11
scenarios; the exact-source subgraph exhausted the Redis bucket, removed the
marker, replayed the receipt and cleaned remaining0. The isolated packaged
Router proof passed. [Current evidence](execution-rate-cache-controls.txt)
records both corrections. The final second corrected gate passes57/57 with46
cached in61.880 seconds. Second protected CI, blocker-focused confirmation and
release remain.

## Requirement traceability

| Requirement | Current evidence |
| --- | --- |
| P13-R01 | [Apollo manifest](../../infra/router/generated/persisted-query-manifest.json), [finite matcher](../../infra/router/generated/trusted-operations.rhai) and [trusted-operation evidence](trusted-operations.txt) |
| P13-R02 | Explicit local/integration audit, hosted enforce policy and passed disposable real-Router proof in [trusted-operation evidence](trusted-operations.txt) |
| P13-R12 | [ADR-0045](../../docs/adr/0045-source-owned-trusted-operations.md), GraphQL architecture and release sequence |
| P13-R03/R04/R05/R10 | Released through [ADR-0046](../../docs/adr/0046-source-owned-graphql-demand-budget.md), [generated profiles](../../infra/router/generated/operation-demand-manifest.json), [demand-control evidence](graphql-demand-controls.txt), PR55 tree-identical main `8cd6c0b` and exact-main run `33425758870` attempt2 |
| P13-R06/R11 | Second corrected source `bf14e2c`, tree `0084c67`, passes the affected candidate gate57/57, all11 real integration scenarios and an exact-source PostgreSQL/Redis expired-marker replay proof; [ADR-0047](../../docs/adr/0047-bounded-graphql-execution-rate-and-cache-scope.md), manifest-v2 runtime/cache profiles and [execution/rate/cache evidence](execution-rate-cache-controls.txt) record the implementation and both review corrections; second protected/confirmation/release gates remain |
| P13-R07–R09 | Planned in queue item67; no implementation or closeout claim |

## Current limitations

- Docker server26.0.0 was reachable for item66's owned full integration and
  isolated packaged Router proof; all owned resources were removed. Corrected
  protected packaged acceptance remains required.
- Audit mode intentionally accepts ad hoc local/integration documents and is not
  a public-deployment security control.
- A trusted document is not user authority. Owner authorization remains required.
- Shape/list/cost controls are released. Identity-aware rate and cache scope have
  an accepted local candidate but are not released. N+1/query-count and authorization
  matrices remain item67 work.
- Hosted providers, credentials, deployment and capacity remain Phase 14.
