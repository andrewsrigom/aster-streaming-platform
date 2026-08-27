# Phase 03 Evidence Index

- Phase status: IN_PROGRESS.
- Base: Phase 02 PR 19 squash ec6386ca7add0f12ae748589be763d9e90ff0d6c; [release evidence](../phase-02/release.txt).
- P03-R01: [domain rules and tests](catalog-domain.txt), [current behavior](../../services/catalog/README.md).
- P03-R02: [PostgreSQL rights history and provenance](catalog-persistence.txt), including real concurrency/rollback/migration proof.
- P03-R06: [editorial workflow, CLI and transaction evidence](catalog-workflow.txt), supporting P03-R03/R04/R07/R08/R10.
- P03-R05: [public SQL/HTTP/Federation evidence](catalog-public.txt), [exact Catalog schema](catalog-schema.graphql), supporting P03-R07/R08/R10 and complete CAT-R03 metadata. Candidate gate is recorded in the evidence closeout.
- P03-R04/R09: [generated HLS and real publication contract](generated-media.txt), [Docker runtime checkpoint](catalog-runtime.txt), [candidate reviews](candidate-sources.md). Full phase acceptance/remote release remains in progress.
- No approved real film, CDN delivery or browser playback is claimed. The retained demo remains unchanged; the runtime proof used a fresh disposable Compose project.
