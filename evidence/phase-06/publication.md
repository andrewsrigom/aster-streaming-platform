# First-film immutable publication

Source base: `d4125a7`, branch `feat/p06-media-pipeline`, 2026-08-28. Requirements P06-R01/R05–R12. Catalog owns all editorial and technical-registration writes.

The exact retained source, HLS and five JPEGs are unchanged from [decoder](decoder.md), [processing](processing.md) and [artwork](artwork.md) evidence. No new film download, encoding, artwork generation or CPU benchmark was run. Historical rights reviews remain immutable.

## Derivative rights review

Reviewer: Aster local Catalog operator. Reviewed 2026-08-28. [Official Peach terms](https://peach.blender.org/about/) returned HTTP 200 through bounded HTTPS; the research fetcher's 402 was not the origin response. Retrieved HTML SHA-256 `8a5b4743d0f0669dcaba7a05b5e90d424a859330fbd672beb2802fe7e0604633`. [CC BY 3.0 terms](https://creativecommons.org/licenses/by/3.0/) permit redistribution and adaptation with attribution and no incompatible recipient restrictions. This does not relicense the film as MIT.

The full-film HLS preserves ending credits. Actual AVC/AAC transformations, source checksum and 596.5-second HLS duration are recorded in the proposed editorial update. Separate artwork rights identify the inspected 640x359 poster checksum and disclose the five frame extraction times/resizes. The same full-film attribution is retained for all JPEG derivatives. No independently acquired promotional images, website logos, cover art, music or captions are adopted; no endorsement is claimed. Film-derived frames do not grant trademark/branding rights.

## Verification status

Implemented bundle hashing, bounded sequential copies, master-last upload, immutable readback and restricted SQL registration. Focused bundle/storage tests: 25/25. Real S3 copy/replay/MIME/cache and origin authorization pass in [bundle-storage.txt](bundle-storage.txt). Full Catalog PostgreSQL integration passes in [attestation-postgres.jsonl](attestation-postgres.jsonl), including role/column isolation, safe definer search path, missing authority, idempotency, normal activation and dispute serialization. The [initial run](attestation-postgres-initial.jsonl) found a fixture clock frozen before the database attestation timestamp; using the actual clock fixed the test without changing production behavior.

## Actual first-film activation

Image: `sha256:25d7222f4118115d8bb034bd573401714b9ac7078a5621ff7d6b98bd8e80f860`, built from this source checkpoint. Native Docker on the retained `aster-p04-development` project; Node 24.19.0. Attester: non-root, 1 CPU, 256 MiB, 64 PIDs, 32 MiB disposable tmpfs, 128 MiB Node heap, internal network only, no operator/admin credential.

- [Migration](attestation-migration.jsonl): additive 0007 only; originals/history retained.
- [Read-only preview](publication-preview.jsonl): hash `3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d`, no publication authority.
- [Editorial commands](publication-editorial.jsonl): inspect, retire, reopen, edit, review, media-ready and publish, with inspected versions between writes. Original rights revision 2 remains; current rights revision 4, title version 9 / PUBLISHED. [Exact approved modifications/artwork input](../../services/catalog/examples/big-buck-bunny-publication.json).
- [Attestation](publication-attested.jsonl): publication `c2929850-d3a3-4e30-945f-688d639d2c68`; 209 objects / 95496764 bytes, 6657 ms, peak process RSS 101466112 bytes (not total container/host memory). These are a single local copy observation, not a CPU benchmark or SLO.
- [Origin](publication-origin-live.jsonl): anonymous manifest GET and poster HEAD are HTTP 200 with exact MIME and immutable caching. Address: `http://127.0.0.1:9001/aster-media-published/publications/3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d/master.m3u8`.

The actual CLI was `node ./dist/src/publish-media-local.js attest 00000000-0000-4000-8000-000000080001 7 68e41f87-ca12-44ff-96d3-8a9e66d67795 7674df29-2a04-4055-bcc8-cef60449520f`, after guarded editorial approval. All bytes were copied/readback-checked independently, without decoder or source acquisition. Origin startup needs both Compose `integration` and `media` profiles; `--wait` avoids a startup race. Internal-only Docker networks did not activate host bindings; the read-only origin now joins the existing edge bridge only, without private database/writer connectivity. All rights and object policies remain unchanged.

## Remaining phase gate and recovery

This is locally published media, not a released Phase 06 or a completed player. Prior-publication rollback/orphan recovery, representative browser playback and the complete phase release remain pending. The source checkpoint passes **51/51** tasks, 31 cached, in 1m12.92s ([raw output](publication-source.txt)); Catalog has 153 passing tests and the S3 adapter 19. [Documentation/security closeout](publication-closeout.txt) passes 10/10 in 5.08 s. Source fingerprints are in [publication-source.sha256](publication-source.sha256). The deployed image's only later runtime-source difference is removal of an unused TypeScript export, with no behavior change; no media experiment is repeated for that or prose/test-output changes.

The existing Catalog service was upgraded in place to the publisher image after source gates passed, preserving its original Compose configuration/trust volume. Web, Router, databases and storage were not restarted. [Read-only public projection](publication-public-read.jsonl) proves the actual approved film/artwork attribution; [existing Web SSR](publication-serving.jsonl) returns HTTP 200 for title and global attribution, with the film and actual transformation notice visible. The Phase 05 UI still uses its technical collection illustration and does not render the separate JPEG modification notice; the actual artwork attribution is available through Catalog and the immutable attribution JSON. No completed browser player or changed UI is claimed.

Initial review covered current rights versus historical computation, immutable byte conflicts, SQL privilege separation/races, bounded streaming cleanup and stable bundle identity. The fixture-clock and origin-network issues were resolved together; confirmation comprises passing focused/real integrations, complete source gates and actual local activation/serving. No open blocker remains for this checkpoint; remaining phase-level rollback/orphan/browser work is explicit above. Only the two newly created, unused tmpfs decoder volumes were removed after exact identity/creation-time/label/no-reference checks; retained data is untouched.

Before activation, failures preserve the active pointer and immutable candidates. After activation, the existing Catalog retire command is the immediate supported takedown; version rollback remains the next implementation. Retained attestation audit requires roll-forward migration. No source film, generated media bytes or credentials are committed. Complete films remain in the local storage volume.
