# Handoff

## Resume point

Branch feat/p06-media-pipeline; publication checkpoint 4bc9b3a. Phases 00–05 are released at main f36f9aa7043dc1fe7b6394a0a800e4e842bf6865. P06-R01 remains IN_PROGRESS; full Phase 00–14 goal remains active.

Current checkpoint: compatible `replace`/`rollback` commands and migration 0008 activation history are implemented. Focused checks 18/18 and full PostgreSQL pass, including both dispute races and recovery after outbox delivery. [Rollback evidence](../evidence/phase-06/rollback.md). Source gate 51/51 (158 Catalog tests) and documentation/security 10/10 pass. Migration 0008 is NOT applied to retained data; no serving image/container or film byte changed. After consolidation, continue orphan recovery and representative browser HLS playback, then full Phase 06 release.

## Current work and exact retained state

Latest browser slice (base 9a4656d): one HLS.js 1.7.1 run passed six decoded-frame samples across both renditions at 0.5/298.5/594.5 seconds, no HLS or browser errors. [Evidence](../evidence/phase-06/browser.md). Source gate passes 51/51, no cache, 1m49.398s. Technical probe only; root-dev dependency includes a version-specific fix for upstream's missing declaration dependencies. Existing CORS is unchanged. The temporary probe container was removed and exact Web restored (HTTP 200). Continue the storage-prefix orphan boundary, then full Phase 06 acceptance/release; do not repeat this playback for unrelated prose/storage work.

Latest slice (base f3c5379): run-UUID scratch volume names, `pnpm media:cleanup PROJECT RUN_UUID [--apply]`, and `pnpm media:cleanup:test`. Six focused checks and the real tiny Docker fixture pass; source 51/51 and documentation/security 10/10 pass. [Evidence](../evidence/phase-06/scratch.md). It cleans only stopped, 31-minute-old, exact run tmpfs resources. No retained-data or serving changes. Storage-prefix garbage collection remains an explicit assessment, not implemented by this command. Browser HLS and phase release follow.

[First-film publication](../evidence/phase-06/publication.md) is locally implemented and activated. Title 00000000-0000-4000-8000-000000080001 is version 9 / current rights revision 4 / PUBLISHED. Original rights revision 2 remains immutable. Publication c2929850-d3a3-4e30-945f-688d639d2c68 points to bundle 3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d: 209 objects, 95496764 bytes (203 HLS + five JPEG + attribution). Manifest: http://127.0.0.1:9001/aster-media-published/publications/3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d/master.m3u8.

The full film is 596.5 seconds HLS, AVC 426x240/638x358, AAC stereo. Source checksum 7118242b6728d40c871479c5b3c0f0fb27d748089df15d7f1b469f297c74a2d6; original ZIP 121284117 bytes. No captions/audio description/transcript. Exact approval input: services/catalog/examples/big-buck-bunny-publication.json.

Reuse private successful processing: HLS attempt 68e41f87-ca12-44ff-96d3-8a9e66d67795, artwork attempt 7674df29-2a04-4055-bcc8-cef60449520f. Their reports/checksums are in decoder.md, processing.md and artwork.md. No new acquisition request/encode was needed: the attester independently verifies historical successful bytes against the newly approved exact source checksum.

## Runtime and authority

Project aster-p04-development retains all data. Schema 0007 is applied. Media origin is healthy and read-only on the existing edge bridge, port 127.0.0.1:9001; it has no private platform connectivity. Its storage volume is read-only. Private writer remains concurrency one on platform. Do not attach the origin only to the internal network: Docker does not activate those host bindings.

Finite publisher image: sha256:25d7222f4118115d8bb034bd573401714b9ac7078a5621ff7d6b98bd8e80f860 (aster-p06-publication:local). It contains the verified publishing implementation; a later unused TypeScript export removal changes no runtime behavior. CLI uses only aster_catalog_attester_local, never operator/admin. Registration function locks/rechecks title and cannot activate it; ordinary media-ready/publish commands did that.

Web/Router at 3000/4000 were preserved. Only Catalog was upgraded to the publisher image with its original Compose configuration after source checks passed. The real film appears in existing Web title/global attribution SSR (HTTP 200); its public API includes exact approved film/artwork attribution. Phase 05 Web still deliberately renders its technical collection illustration, not the new JPEGs. Actual player/artwork integration remains Phase 07.

## Verification and next action

Focused bundle/S3 adapter tests 25/25 pass. Full PostgreSQL integration passes: restricted privileges, empty migration down/up, idempotent registration, existing operator activation, retained-audit downgrade rejection and dispute race. Real synthetic S3 copy/replay/MIME/cache and origin negative permissions pass. Actual film copy took 6657 ms, process RSS peak 101466112 bytes. CPU was not tested.

The publication checkpoint passes 51/51 tasks (31 cached, 1m12.92s), Catalog 153 tests and S3 19 tests, plus documentation/security 10/10. The newer compatible rollback checkpoint is described above; it preserves current approval and requires prior activation history. Ordinary retire remains the immediate takedown when no compatible reference exists. Do not claim Phase 06 verified/released or a finished player. Preserve the published bundle and every original/candidate/audit.

Native Docker Compose startup must include integration + media profiles and --wait. It created two unused empty tmpfs decoder volumes while starting the origin; both were removed after exact name/creation-time/labels/tmpfs and zero-container-use checks. No global Docker cleanup or retained-data deletion.

## Do not do yet

Do not start Phase 07, publish this incomplete phase, delete retained media/audit, repeat a source download or encode, or run host/CPU diagnostics. Finish P06-R01 acceptance first.

## Reliable tooling and constraints

WSL command launches are unreliable (Wsl/Service/0x8007274c); UNC and native Docker work. Do not investigate CPU or restart WSL/owner programs. Docker image aster-p06-tooling:git supplies Node 24.19.0, pnpm 11.24.0 and Git, no Docker CLI. Bind this repository at /home/andrews/personal/portfolio-2026/aster-streaming-platform with UID/GID 1002:1002. Source checks need --tmpfs /tmp:rw,exec,nosuid,nodev,size=128m, NODE_OPTIONS=--max-old-space-size=1536 and 2 GiB cap. Keep normal hooks. Git author: andrewsrigom / andrews.ribeiro.gomes@gmail.com. Never create a codex/ branch.

Native Windows bundled Node can run dependency-free Docker supervisors; use the container for Linux pnpm modules. Normalize generated log CRLF/trailing whitespace before staged diff checks; do not rerun tests for formatting. No new download, full-film encode, JPEG generation, unchanged Web benchmark, hosted resource or public remote mutation is needed at this checkpoint.
