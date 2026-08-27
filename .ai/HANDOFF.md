# Handoff

## Resume point

Continue IN_PROGRESS P03-R04/R09 on feat/p03-catalog-rights, base 08a06ca. Working-tree changes implement Catalog composition/read-only runtime, Compose init/service, isolated FFmpeg fixture, source candidates, real generated-publication integration and CI wiring. Do not discard them or start P04.

## Evidence and remaining work

- 94 Catalog tests pass; media parser/probe tests and platform guard tests pass before final formatting.
- Docker proof passes fresh/idempotent migrations, HTTP, privilege and PostgreSQL outage recovery, SIGTERM 143, zero resource cleanup. Source changed after the first proof only to fix OID-based privilege checking; a second proof covers that fix.
- Generated HLS output: six seconds, 320x180/24fps, mono AAC, three H.264 TS segments and English WebVTT. Source checksum a3dd31b3057c90edfd9ff98525d30c132f517288173861d5d6ffd84d69f791ae. Repeatability and corrupt/missing/symlink/cancellation checks pass in one pinned image/build.
- Real PostgreSQL generated publication/retirement and two unresolved candidate records pass; cleanup left zero fixtures in 22490 ms. Failed intermediate assertions were test reader-role regrant and the probe's schema-name lookup; the latter required OID lookup, now passing against private Identity.
- Candidate gate passes: 52/52 tasks, 29 cached, 25.796 s; high-severity Node audit passes. Initial/confirmation author review is complete; source fingerprints are in catalog-runtime.txt. Finish clean-source full phase acceptance and phase closeout, then one coherent Phase 03 PR. No remote mutation has occurred.
- CI now invokes catalog:media and catalog:demo once for platform changes; verify its policy tests and classifier.
- Existing Identity evidence remains supporting evidence. Only new labelled disposable fixtures changed; retained demo, public remote and unrelated PR 1 were not modified.

## Next outcome

Close P03-R04/R09 locally, complete the Phase 03 acceptance index/next-phase prerequisites, then protected publication/merge. Phase 04 starts only after predecessor release.

## Do not do yet

Keep MIT and third-party notices; no license permission pause. No actual film approval, media delivery or browser playback claim. Roll back only new runtime/tooling; do not drop product/audit data or broadly prune Docker. Real source acquisition/worker is Phase 06, hosted operator trust Phase 14.
