# Bounded source acquisition

Local acquisition is verified for the exact approved Big Buck Bunny archive on 2026-08-28. No extraction, decoding, HLS, artwork or publication is claimed. Source baseline: 09520f0 plus the exact files in [source hashes](acquisition-source.sha256). Node 24.19.0/pnpm 11.24.0, Linux/WSL on a shared Windows host. [Commands and recovery](../../services/catalog/MEDIA_ACQUISITION.md).

JSONL artifacts retain structured output; unrelated Compose orphan warnings and build banners are omitted. Terminal-log trailing whitespace is normalized. Original full command logs remain in the local /tmp acquisition workspace. No unrelated orphan container was removed.

## Measured result

The second durable attempt acquired 121284117 bytes in 12003.40783 ms. SHA-256: `7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6`. Stored bytes were read back and verified. The sampled process peak was RSS 97685504, heap used 19088064, external 12209509 and array buffers 9116598 bytes. These process samples exclude tmpfs and do not prove total container peak, arbitrary-load latency or a leak-free long-running service.

Image `sha256:5c0c4cdd0c70fb0143909791e8b0179161b340e007176f96c14934e6d6fee568` exited zero without OOM under the recorded CPU/memory/PID/tmpfs bounds. A post-exit Docker stats sample contained zeros and is deliberately not used as resource evidence. No owner programs were stopped and no unchanged Web benchmark was repeated.

- [Acquisition/progress](original-acquisition.jsonl), [container limits and exit](original-container.json).
- [Independent S3 metadata](original-storage.jsonl): one object, correct full checksum/size, owner-private ACL and zero multipart uploads.
- [Independent Catalog state](original-catalog.json): retained failed/successful attempts; title remains RIGHTS_REVIEWED, version 3, rights revision 2, no publication.
- [Cross-process replay](original-replay.jsonl): same completed attempt, no download progress or new original.
- [Retained schema initialization](local-migration.jsonl) and [request admission](local-request.jsonl).

## Corrections and acceptance

The initial real S3 race returned two successful conditional writes. Pinned upstream code checks preconditions before writing. Configuring its native POSIX action concurrency to one fixes the local single-instance race; [failed experiment](storage-conditional-initial.txt) and [passing regression](storage-conditional.txt) preserve the evidence. The test also rejects a wrong checksum, releases early-rejected streams and leaves no multipart uploads or fixture resources.

The first real acquisition failed with NETWORK_FAILURE before source GET: the internal-only Docker network returned DNS ESERVFAIL. Its failure audit committed. A dedicated egress bridge for the finite job, not a public platform network, resolved it. [Initial attempt](original-initial.jsonl), [diagnosis](network-diagnostic.jsonl), [HEAD-only confirmation](network-confirmation.jsonl). The unchanged reviewed ETag/length passed before the single successful GET; no rights or identity check was weakened.

`pnpm catalog:integration` verifies claims across eight contenders, one global slot, exact replay, rollback, lease recovery, exhausted final-lease retirement, stale results, rights revocation, permanent failures, private audit, empty-only migration rollback and actual CLI activation/privilege guards. [Final confirmation](acquisition-postgres.jsonl). It used a labelled disposable PostgreSQL fixture, fully cleaned. Initial and CLI-expanded runs passed; final lease retirement was a genuine review correction, not a timing rerun.

The focused self-review corrected exhausted-lease retirement, rights checks after storage initialization and concurrent watchdog checks. Confirmation includes PostgreSQL recovery plus stream/executor tests for redirects, size, signatures, checksum, stalls, cancellation, retained-object mismatch and periodic rights revocation. The final affected source gate passes 58/58 tasks (35 cached) in 62.168 s, including 115/115 Catalog tests; [quality output](acquisition-quality.txt). Initial gate failures were an unused export and a test-only optional chain, not accepted defects or altered budgets. Later evidence-prose updates do not invalidate source/media results; final source hashes still match, with documentation/memory/staged checks repeated separately.

The decoder/attestation handoff, bounded ZIP extraction, HLS validation, complete credits, modification notices, publication, phase review and hosted CI/release remain pending. The original is private and unchanged; source permission is still rechecked for subsequent work.
