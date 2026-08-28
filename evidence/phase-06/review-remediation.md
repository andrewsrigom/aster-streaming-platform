# Phase 06 external-review remediation

2026-08-28, feat/p06-media-pipeline, based on access correction 7150bb5d7b4a5a4fb2ac5ca9f9d19fc6ad96baea. [Initial external review](https://github.com/andrewsrigom/aster-streaming-platform/pull/23#pullrequestreview-5048873748) examined 459607b and reported two P2 requirement/availability blockers. Both are batched before making the draft ready.

## Changes and verification

- P06-R04: both bounded image builds precede the owner/processing deadline. Each build retains its six-minute limit; the supervisor's 30-minute window no longer includes cold builds. Explicit reuse skips decoder preparation/start. Runner ordering/target contracts: 2/2 pass; no slow-host benchmark or film encode.
- P06-R06/R09: remove same-title joins on original computation requests in the attestation reader, aligning it with existing SQL registration and checksum/recipe reuse. Original processing/acquisition/request IDs remain immutable. Current selected-title source checksum, rights, metadata, report integrity and final transactional authorization are still required. No schema/grant change or inherited old rights.
- [Real PostgreSQL result](review-postgres.jsonl): the complete Catalog matrix passes. A second synthetic title obtains its own approved request/acquisition, reuses both successful processing IDs, registers and publishes independently, and replays exactly. Unapproved rights/wrong checksum are rejected. The first title's dispute does not revoke the second's independent approval; the second's own dispute blocks registration. Resources close with zero reserved slots. The exact disposable PostgreSQL fixture is removed; no retained data touched.
- [Source candidate](review-source.txt): 51/51 tasks, 39 cached, 53.677s, `pnpm check:source --concurrency=2`. Final arrow-body braces are formatting-only, not an SQL/behavior change. Exact-head protected CI remains required.

The database fixture uses pinned PostgreSQL 18.6, an isolated namespace and 256 MiB disposable tmpfs, invoking `services/catalog/dist/test/integration/rights-postgres.js 5432` with current compiled Catalog code. It does not touch retained demo storage. Changed-source hashes are captured at closeout.

## Confirmation / limits

Final [documentation/security gate](review-closeout.txt): 10/10 tasks, five cached, 5.512s. [Affected-source hashes](review-source.sha256) identify the verified revision; no scanner/gate was weakened.

Checked the complete initial external round and both fixes. Existing source/recipe/rights checks, immutable provenance and short SQL transactions remain intact; no remaining local blocker found. Prior real storage/209-object HTTP and browser/film evidence remain applicable because these fixes change neither access policy, media bytes, URLs, browser code nor encoding recipe. No media or CPU experiment repeated.

Publish one coherent correction, mark PR 23 ready once, require protected exact-head CI/confirmation, then squash and exact post-merge CI before Phase 07. Local checks are not a hosted release claim.
