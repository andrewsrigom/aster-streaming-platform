# Phase 03 Evidence Index

- Phase status: VERIFIED locally; protected CI, merge and post-merge verification are pending. No hosted product release is claimed.
- Base: Phase 02 PR 19 squash ec6386ca7add0f12ae748589be763d9e90ff0d6c; [release evidence](../phase-02/release.txt).
- P03-R01: [domain rules and tests](catalog-domain.txt), [current behavior](../../services/catalog/README.md).
- P03-R02: [PostgreSQL rights history and provenance](catalog-persistence.txt), including real concurrency/rollback/migration proof.
- P03-R06: [editorial workflow, CLI and transaction evidence](catalog-workflow.txt), supporting P03-R03/R04/R07/R08/R10.
- P03-R05: [public SQL/HTTP/Federation evidence](catalog-public.txt), [exact Catalog schema](catalog-schema.graphql), supporting P03-R07/R08/R10 and complete CAT-R03 metadata. Candidate gate is recorded in the evidence closeout.
- P03-R04/R09: [generated HLS and real publication contract](generated-media.txt), [Docker runtime and clean-source acceptance](catalog-runtime.txt), [candidate reviews](candidate-sources.md).
- No approved real film, CDN delivery or browser playback is claimed. The retained demo remains unchanged; the runtime proof used a fresh disposable Compose project.

## Requirement acceptance

The clean-source gate at `4e29f5eff7b5992abcd4911dcbec38aba1845e70` passes all 52 tasks without Turbo cache, including 94 Catalog tests. Real-container evidence is separate and source-fingerprinted; documentation-only closeout does not change its measured behavior.

| Requirement | Implemented behavior and acceptance evidence |
| --- | --- |
| P03-R01 | [Domain lifecycle](../../services/catalog/src/domain/title.ts); complete 25-pair transition table and invalid-publication cases in [domain evidence](catalog-domain.txt). |
| P03-R02 | [Rights persistence](../../services/catalog/src/infrastructure/persistence/postgres-rights.ts); immutable revisions, provenance, concurrency and migration round-trip in [SQL evidence](catalog-persistence.txt). |
| P03-R03 | [Rights validation](../../services/catalog/src/domain/rights.ts); every required field and permission, contradictions, expiry and unresolved candidate approval rejection in [domain](catalog-domain.txt) and [generated integration](generated-media.txt). |
| P03-R04 | [Editorial commands](../../services/catalog/src/application/commands.ts); missing/foreign/stale attestations reject and byte-validated synthetic HLS publishes through the same application in [workflow](catalog-workflow.txt) and [media evidence](generated-media.txt). The real-film worker remains Phase 06. |
| P03-R05 | [Public queries](../../services/catalog/src/application/public-queries.ts) and [Federation schema](catalog-schema.graphql); published-only stable keysets/detail, request-scoped batching and indexed SQL plans in [public evidence](catalog-public.txt). |
| P03-R06 | [Local operator entrypoint](../../services/catalog/src/operate-local.ts); authorized create/edit/review/publish/retire/dispute, audit, idempotency and rollback in [workflow evidence](catalog-workflow.txt). |
| P03-R07 | Attribution derives from approved rights in [domain rules](../../services/catalog/src/domain/rights.ts); concrete public response and generated-publication attribution in [public](catalog-public.txt) and [media evidence](generated-media.txt). |
| P03-R08 | [Metadata model](../../services/catalog/src/domain/metadata.ts); localized metadata, deterministic fallback and legacy compatibility in [workflow](catalog-workflow.txt) and [public evidence](catalog-public.txt). |
| P03-R09 | Two [structured candidate records](../../services/catalog/examples/candidate-sources.json) and [official-source reviews](candidate-sources.md); uncertainty is retained and real SQL proves both remain unapproved/invisible in [media evidence](generated-media.txt). |
| P03-R10 | Atomic takedown/outbox in [workflow persistence](../../services/catalog/src/infrastructure/persistence/postgres-workflow.ts); both publish/dispute orderings, public removal and versioned retirement events in [workflow](catalog-workflow.txt), [public](catalog-public.txt) and [generated evidence](generated-media.txt). |

## Operational and review boundaries

- Security: operator authority stays local and separate from viewer sessions; HTTP has only reader credentials. Real PostgreSQL rejects private-history/Identity access, writes and excess reader privileges. No real media permission is inferred from a project license.
- Failure: deadlines, cancellation, bounded admission, immutable audit/outbox, PostgreSQL outage/recovery and SIGTERM are covered. No automatic retry of an uncertain write is claimed.
- Accessibility: metadata includes reviewed artwork alt text and accessibility facts; the technical fixture has English WebVTT. There is no UI or real-film accessibility claim. Browser and interaction acceptance belongs to Phase 05 and playback to later phases.
- Operations: [Catalog commands and limits](../../services/catalog/README.md), [migration order and rollback](../../services/catalog/migrations/README.md), [local development](../../docs/operations/LOCAL_DEVELOPMENT.md). Retain durable title/audit data on rollback; never restore an incompatible metadata writer.
- Review: one complete author review and one confirmation, with batched remediation, are recorded in the linked checkpoints. No independent approval is claimed. No active requirement, security, data, availability or public-contract blocker remains locally.
- Limitations: official-source retrieval uncertainty is explicit; no acquired film, signed delivery, player, production SLO, exported Router trace or binary-image distribution is claimed.

## Next-phase prerequisite

[Phase 04](../../docs/specs/phase-04-supergraph.md) requires independently testable Identity and Catalog subgraphs. Their [Identity](../phase-02/identity-schema.graphql) and [Catalog](catalog-schema.graphql) artifacts match executable schemas; the [composition/known-operation tests](../../services/catalog/test/catalog-graphql.test.ts) pass in the clean gate. This prerequisite is verified. Start Phase 04 only after the predecessor's protected publication and post-merge gate, or the explicitly frozen WAITING_EXTERNAL protocol.
