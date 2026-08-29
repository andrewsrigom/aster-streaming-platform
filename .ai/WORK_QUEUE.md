# Work Queue

Only one item may be `IN_PROGRESS`; one frozen predecessor may be `WAITING_EXTERNAL`.

Phase09 is DONE through PR36 corrected exact `b5ccd59`, protected run33253867475,
clean exact-head confirmation, squash main `ffe8e24` and exact-main
run33254719311. P10 Catalog cache-aside is the sole IN_PROGRESS item on
`feat/p10-catalog-cache`. It owns the concrete cache design, rights-safe positive
reuse, short valid-absence caching, TTL jitter, bounded local coalescing,
tokenized Redis lease and finite measurements. The local implementation and real
Redis/PostgreSQL proofs pass; exact candidate publication/review remains. No Redis
result may replace the PostgreSQL visibility/version fence or authorize a durable
decision.

Rails/fallback/owner composition/telemetry confirmation found database-admission and migration-rollout blockers.
Admission is corrected. Precursor PR35 exact `8002594` passed75/75,42/42,
confirmation and protected CI, then squash-merged as main `583c835`; exact-main
run33244657936 passed. The dependent is rebased on that squash and ready for its
PR34 correction. Exact0d1a7ef passed protected run33245434181; remediation review
found partial-log classification and stale ADR execution wording. Both are fixed
locally with Discovery89/89 and final54/54 affected candidate in47.708s.
Exact8650670 passed protected run33246333963; final confirmation found only a
GraphQL architecture excerpt default20/schema default10 mismatch. Exactdf08a70
corrected it and passed protected run33247048014. Closeout review then found a
Catalog federation capacity mismatch: the genre branch can emit36 references
while Catalog admitted20. The local correction accepts36, rejects37 and retains
DataLoader owner batches of at most20; focused Catalog build and230/230 pass.
The corrected affected candidate passes54/54,38 cached, in55.844s.
Exactdbce479 was published; closeout review5057751709 found fallback could replace
cancelled/indeterminate primary results. The invalidated protected run33248060625
was cancelled. The local correction restricts fallback to empty/unavailable and
passes Discovery build,90/90 focused tests and the affected54/54 candidate in49.022s.
Historical stashes are superseded.

| Order | Work item | Requirement | Status |
|---:|---|---|---|
| 1 | Select and record the source-code license | P00-R01 | DONE |
| 2 | Reconcile Phase 00 traceability, sequence, and public-repository workflow | P00-R08 | DONE |
| 3 | Define engineering demonstration, local demo, and repository governance contracts | P00-R11 | DONE |
| 4 | Select and pin the supported Node.js and pnpm versions | P00-R03 | DONE |
| 5 | Initialize Git policy, pnpm workspace, Turborepo, and deterministic ignores | P00-R02 | DONE |
| 6 | Add strict TypeScript, formatting, linting, unused-code, import-boundary, and commit checks | P00-R04 | DONE |
| 7 | Add link, terminology, and unsupported-status-claim validation | P00-R05 | DONE |
| 8 | Add CI for install integrity, code checks, tests, documentation, secrets, and dependency review | P00-R06 | DONE |
| 9 | Add public contribution governance and repository templates | P00-R07 | DONE |
| 10 | Create the authorized public GitHub repository and apply verified protections | P00-R07 | DONE |
| 11 | Integrate `.ai/` state checks into the normal contribution workflow | P00-R08 | DONE |
| 12 | Document exact bootstrap, check, demo, and cleanup commands | P00-R09 | DONE |
| 13 | Verify a clean checkout, capture the Phase 00 evidence index, and close the phase | P00-R10 | DONE |
| 14 | Select local platform versions, resource bounds, and the first Docker runtime checkpoint | P01-R01 | DONE |
| 15 | Add an explicit project-scoped destructive local reset | P01-R02 | DONE |
| 16 | Validate process-start configuration and classify secrets | P01-R03 | DONE |
| 17 | Implement structured logging with redaction and trace correlation | P01-R04 | DONE |
| 18 | Select the HTTP adapter through an ADR and create the transport boundary | P01-R11 | DONE |
| 19 | Calibrate risk-proportionate verification and affected-scope feedback | P00-R06 | DONE |
| 20 | Implement lifecycle, health, and bounded graceful shutdown | P01-R05 | DONE |
| 21 | Define the bounded telemetry contract and runtime metrics | P01-R06 | DONE |
| 22 | Implement narrow PostgreSQL, Redis, broker, object-storage, clock, ID, and telemetry adapters | P01-R07 | DONE |
| 23 | Compose startup deadlines, dependency readiness, health routes, and the Identity reference skeleton | P01-R08 | DONE |
| 24 | Prove the reference runtime against real local dependencies | P01-R09 | DONE |
| 25 | Publish resource-aware profiles, troubleshooting, and the clean Docker-only Phase 01 closeout | P01-R10 | DONE |
| 26 | Select identity/session trust and implement the guarded local assertion boundary | P02-R01 | DONE |
| 27 | Resolve accounts and implement durable revocable local sessions | P02-R02 | DONE |
| 28 | Implement owned profiles, active selection, deletion policy and transactional outbox (also P02-R04 through P02-R08) | P02-R03 | DONE |
| 29 | Expose the Identity subgraph and verify sanitized authorization and concurrency behavior (also P02-R10) | P02-R09 | DONE |
| 30 | Model rights review, attribution and the title publication lifecycle | P03-R01 | DONE |
| 31 | Persist structured rights revisions and immutable review provenance | P03-R02 | DONE |
| 32 | Implement authorized operator workflow and publication/retirement transactions | P03-R06 | DONE |
| 33 | Implement published-only browse/detail, locale fallback and Catalog Federation schema | P03-R05 | DONE |
| 34 | Verify generated HLS publication, candidate-source reviews and the Catalog Docker runtime | P03-R04 | DONE |
| 35 | Compose versioned Identity/Catalog schemas and protect known operations | P04-R01 | DONE |
| 36 | Run Apollo Router with private subgraphs, trusted context, telemetry and partial-failure acceptance | P04-R02 | DONE |
| 37 | Implement public SSR, deterministic Apollo hydration, explicit seed and the accessible Web shell | P05-R01 | DONE |
| 38 | Approve one source and deliver its bounded immutable media pipeline | P06-R01 | DONE |
| 39 | Create owner-validated short-lived playback sessions through Federation | P07-R01 | DONE |
| 40 | Deliver accessible HLS player, preferences, QoE/errors and clean playable demo | P07-R04 | DONE |
| 41 | Record durable owner-authorized monotonic playback progress | P08-R01 | DONE |
| 42 | Read bounded owned history and continue-watching pages | P08-R06 | DONE |
| 43 | Add idempotent owned watchlist with current Catalog visibility | P08-R07 | DONE |
| 44 | Batch federated Title and Profile engagement fields per request | P08-R08 | DONE |
| 45 | Relay owner outboxes and verify idempotent consumers, deletion and rebuild | P08-R09 | DONE |
| 46 | Integrate honest player reports and resume, then close Phase 08 | P08-R11 | DONE |
| 47 | Build versioned Discovery projection, rebuild and bounded published-title search | P09-R01 | DONE |
| 48 | Compose independent home rails, safe fallbacks and freshness telemetry | P09-R03 | DONE |
| 49 | Integrate public SSR rails/search and private profile enhancement; close Phase 09 | P09-R10 | DONE |
| 50 | Implement rights-safe Catalog cache-aside, jitter, coalescing, lease and metrics | P10-R01 | IN_PROGRESS |
| 51 | Implement bounded Discovery stale-while-revalidate and refresh fallback | P10-R04 | READY |
| 52 | Add operation limiters and prove outage, atomicity and hot-key behavior; close Phase 10 | P10-R08 | READY |

P02-R09 is complete: [release evidence](../evidence/phase-02/release.txt). P03-R01 has [domain evidence](../evidence/phase-03/catalog-domain.txt); P03-R02 has [persistence evidence and its completed plan](../evidence/phase-03/catalog-persistence.txt). Phase 03 publication is PR 20; its technical fixture did not approve an actual film. The separate first-film approval belongs to Phase 06.

## Work-item rules

P09-R03 released a search-only readiness precursor accepting exactly
migration markers `1–2` or `1–3`. It does not apply migration3 or query rail
objects. After exact main, PR34 rebases and completes the rail migration,
owner-composed GraphQL and bounded telemetry. P09-R10 consumes those exact public
and private operations through existing Web SSR/private-client boundaries. It adds
no service, profile copy, Redux remote state, Redis authority or cross-owner SQL.

P10-R01 starts with Catalog public-title reads because the owner already has a
measurable bounded PostgreSQL path. The positive cache may reuse metadata only
after a current PostgreSQL visibility/version fence; browse ordering and playback
authority are not cached. Later P10 items reuse the proven primitives for optional
Discovery stale serving and operation limiters. No Phase11 retry/circuit policy or
Phase13 GraphQL calibration is implemented early.

Phase 07 has [protected release evidence](../evidence/phase-07/release.md). P08-R01 includes R02–R05 and atomic R09 intent; its protected/post-merge gates pass. P08-R06 has [protected closeout evidence](../evidence/phase-08/history-visibility.md). Watchlist has [protected closeout evidence](../evidence/phase-08/watchlist.md) under ADR-0032. Entity fields, relay and browser reports follow. No repeated CPU or film experiment.

- Move one item to `IN_PROGRESS` before changing code.
- `WAITING_EXTERNAL` requires a frozen evidenced candidate and permits only one later dependent local item under the predecessor-first release rule in `AGENTS.md`.
- Record its plan in `.ai/CHANGE_PLAN.md`.
- Do not mark `DONE` without linked evidence.
- Add newly discovered work only if it belongs to the active phase.
- Record future-phase ideas under the relevant specification rather than implementing them early.
- `READY` items after the active item are ordered runway, not authorization to start them concurrently.
