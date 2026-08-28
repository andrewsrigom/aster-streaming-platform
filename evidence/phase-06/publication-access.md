# Phase 06 publication-access correction

2026-08-28, `feat/p06-media-pipeline`, correction based on PR 23 head `459607b407d1b6f0fd63b5416d06a9fc34b4b36d`. Catalog/S3 delivery boundary, P06-R08/R10. Protected CI and confirmation remain required before release.

## Initial findings and correction

The initial review found that the broad `publications/*` policy exposed partial child objects before bundle completion. Drafted PR 23; no merge or old-head rerun. The initial protected [run 33151304060](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33151304060) passed source, governance, dependency review, platform and real Catalog PostgreSQL/media checks, but failed the standalone Catalog probe's obsolete migration expectation. [Failure excerpt](ci-initial-failure.txt). Corrected the exact expected list to migrations 1–8, preserving the repeated empty migration assertion.

An object-ACL attempt returned 501 on the pinned POSIX backend ([raw failed fixture](access-origin.txt)); its disposable resources were removed. The [pinned policy evaluator](https://github.com/versity/versitygw/blob/v1.7.0/auth/bucket_policy.go) also does not evaluate tag conditions. No ACL/tag-dependent implementation was retained.

The implemented path copies privately, checks every object/current approval, then grants GET/HEAD to that exact immutable bundle prefix in one policy update. A private conditional-create control object serializes policy updates and preserves older grants. Uncertain writes retain the barrier until explicit fenced recovery; no unsafe lease expiry. Policies reject broad/unknown grants and are capped at 100 prefixes / 20 KB. [Decision](../../docs/adr/0026-local-media-publication.md), [recovery](../../services/catalog/MEDIA_PUBLICATION.md#recover-an-interrupted-access-grant).

## Evidence

- Focused Catalog build plus 10 publication/access tests pass; policy bounds/ignored conditions, checksum/rights/cancellation, interrupted grant, ambiguous write/readback and immutable replay are covered. Standalone Catalog runtime contracts pass 3/3. Full candidate source gate is recorded separately at closeout.
- `node tools/run-media-origin-integration.mjs`: [real pinned storage result](policy-origin.txt). Nine synthetic objects / 2351 bytes; partial copy and complete-but-ungranted copy denied, completed reveal/replay works, competing writer denied, old grant retained, failed grant retains barrier, original/listing/write denial, MIME/cache/CORS/range pass. Exact labelled disposable containers/tmpfs removed, remaining zero. Client image `sha256:68dfa26c24275f046ae8b4ea4acae76bd995a12b36a9cb92fab511c128fe6c24`.
- [Scoped retained migration command](policy-migration.ps1), historical execution only: inspect zero active `media-publish` containers; require the sole registered attestation, exact 209-key storage inventory, 95496764 bytes, owner-private ACL and exact recognized legacy policy. Rebuild the bundle from current approved Catalog/retained candidate reports and stream-check all objects before restricting the policy. One preliminary invocation failed during ESM import, before any connection/write ([output](policy-migration.jsonl)); the corrected invocation [passed](policy-migration-verified.jsonl).
- Migration at `2026-08-28T07:44:52.418Z` preserved title version 9 / rights revision 4 / PUBLISHED, publication `c2929850-d3a3-4e30-945f-688d639d2c68`, bundle `3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d`. Zero editorial/media writes; only recognized access policy and temporary control lock changed. Barrier removed after successful readback.
- [Post-restriction HTTP result](policy-http.jsonl): every one of the 209 objects returns anonymous HEAD 200 with immutable headers and unchanged total bytes; both child playlists resolve, byte range 206 and CORS pass. Other prefix, private original and listing return 403; Web remains 200.

## Interpretation / limits

Corrected candidate source gate: [51/51 tasks](access-source.txt), 37 cached, 54.186s, with [exact affected-source hashes](access-source.sha256). Final [documentation/security gate](access-closeout-ready.txt): 10/10, six cached, 4.317s, zero secret findings. Earlier closeout attempts caught required memory headings and the scanner's credential-URL/assignment syntax in the historical migration transcript; corrected the transcript to use the visibly synthetic test credential separately, without changing scanner rules or executing another migration.

Confirmation review: checked private initialization, complete integrity/current approval before grant, strict resource grammar/capacity, conditional-create exclusion, preservation of older grants, fail-closed ambiguous-write recovery, unchanged restricted SQL/editorial authority, and the exact migration probe assertion. Focused/real-storage/retained HTTP evidence covers the changed blocking boundary; no remaining local blocker found. Exact corrected-head protected CI and post-merge confirmation are still release conditions, not implied by these local results.

This repeats only the changed access boundary. Original download, full-film encoding, offline decoding and the six browser frame/seek samples remain supporting evidence: bytes, URLs, codecs, playlists, headers and browser code are unchanged; all referenced HTTP objects were rechecked after restriction. No CPU diagnostic or Web benchmark was repeated.

The local single-writer conditional-create assumption is explicitly ADR-0022, not a hosted distributed-lock claim. Retained media is not deleted; anonymous completed CC media is not DRM-protected or retroactively revoked by Catalog retirement. Initial failed experiments and CI remain visible. Phase 07 product playback is not implemented by this correction.
