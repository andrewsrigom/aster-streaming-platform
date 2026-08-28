# ADR-0026: Verified local media publication

- Status: Accepted
- Date: 2026-08-28
- Phase: 06
- Requirements: P06-R01, P06-R05, P06-R06, P06-R07, P06-R09, P06-R10, P06-R11, P06-R12

## Context

The first film and derived frames are independently validated and privately retained. Technical processing is not editorial approval or publication authority. The Docker-only evaluator journey also needs a browser-reachable origin without installing local certificate authorities.

## Decision

Catalog remains the only editorial owner. Use its existing retire/reopen/edit/review workflow to record actual modifications, the acquired checksum and separately approved derivative artwork before the first publication. Preserve the original review and processing history. A new current-rights request may reuse a private original only after streaming its complete bytes and checking the approved checksum, byte count and container signature. Missing content may use the normal approved download path; corrupt content fails closed without overwrite or an automatic source GET. Existing checksum/recipe processing results remain reusable without re-encoding.

Publication will copy verified HLS and artwork into an immutable bundle under `aster-media-published/publications/<sha256>/`. The bundle identity binds both candidate reports and stable attribution facts. Write and verify children before the master playlist. A partial upload never changes Catalog's active pointer. Include attribution with the bundle and in the existing title/global attribution projections; preserve full film credits. No token or DRM restriction is added to Creative Commons media.

Use the existing pinned VersityGW implementation for a separate read-only origin on loopback port 9001, sharing the storage volume read-only. The private writer remains internal and retains concurrency one. This refines ADR-0022's single-instance constraint to one **writer**; the origin cannot mutate POSIX storage. Anonymous policy permits only object GET/HEAD in the publication prefix, never listing, writes or private originals/candidates. Configure bounded concurrency, browser CORS and byte ranges. Verify the pinned binary's behavior before enabling the origin on retained data.

Catalog will admit normalized HTTPS media URLs as before. Only its explicitly local composition may approve and expose the exact HTTP loopback publication namespace above; generic source/license URLs remain HTTPS-only. Hosted/default policies reject local HTTP media. The exception is a local delivery policy, not an input-selected privilege or arbitrary HTTP URL.

An isolated Catalog technical-attester credential will register independently checked publication references, without editorial writes or active-pointer authority. Registration must lock the title and recheck version/current rights, source and expiry, serialize against disputes, and be idempotent for the same immutable bundle. The normal operator then performs `media-ready` and `publish` with audit/outbox in its existing transaction. A worker report or caller `approved` flag is never sufficient. Detailed SQL permissions and rollback behavior are verified before this credential is activated.

## Verification and recovery

Focused tests cover exact checksum reuse, missing/corrupt/stalled objects, cancellation and revoked rights. Publication acceptance additionally covers anonymous negative permissions, CORS/ranges, complete-object verification, stale approval, concurrent dispute, retry, atomic activation and prior-version rollback. Reuse existing original/HLS/JPEG evidence when source and recipe are unchanged. No full-film download or encode is needed for metadata or delivery work.

Remove an unused origin without deleting volumes. Before publication, leave the title unexposed and preserve immutable candidates/audit. After publication, use an owner-authorized previously validated compatible publication or retire; never overwrite bundles or downgrade to code that cannot read retained audit data.

## Sources

- [Peach film licensing and credits](https://peach.blender.org/about/): film derivatives are covered; excluded logos and DVD artwork are not adopted.
- [VersityGW global options](https://github.com/versity/versitygw/wiki/Global-Options): the pinned 1.7.0 binary also exposes `--readonly`, concurrency bounds and CORS; runtime authorization checks remain required.
