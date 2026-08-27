# Handoff

## Resume point

Continue IN_PROGRESS P03-R04/R09 protected publication on feat/p03-catalog-rights. Implementation commit 4e29f5eff7b5992abcd4911dcbec38aba1845e70 has complete local phase acceptance. Later closeout changes are evidence/memory prose only. Inspect current HEAD and any PR before publishing; do not duplicate a PR/run or start P04 before predecessor release.

## Evidence and remaining work

- 94 Catalog tests pass; media parser/probe tests and platform guard tests pass before final formatting.
- Docker proof passes fresh/idempotent migrations, HTTP, privilege and PostgreSQL outage recovery, SIGTERM 143, zero resource cleanup. Source changed after the first proof only to fix OID-based privilege checking; a second proof covers that fix.
- Generated HLS output: six seconds, 320x180/24fps, mono AAC, three H.264 TS segments and English WebVTT. Source checksum a3dd31b3057c90edfd9ff98525d30c132f517288173861d5d6ffd84d69f791ae. Repeatability and corrupt/missing/symlink/cancellation checks pass in one pinned image/build.
- Real PostgreSQL generated publication/retirement and two unresolved candidate records pass; cleanup left zero fixtures in 22490 ms. Failed intermediate assertions were test reader-role regrant and the probe's schema-name lookup; the latter required OID lookup, now passing against private Identity.
- Candidate gate passes: 52/52 tasks, 29 cached, 25.796 s; high-severity Node audit passes. Initial/confirmation author review is complete. Fresh detached worktree at 4e29f5e: pnpm install --frozen-lockfile --offline && pnpm check, 52/52 tasks, zero cached, 53.227 s. Temporary worktree was clean and removed; source fingerprints and the exact test boundary are in catalog-runtime.txt.
- CI now invokes catalog:media and catalog:demo once for platform changes; verify its policy tests and classifier.
- Existing Identity evidence remains supporting evidence. Only new labelled disposable fixtures changed; retained demo, public remote and unrelated PR 1 were not modified.

## Next outcome

Commit documentation-only acceptance closeout, publish one Phase 03 PR and require CI required on its exact head. Inspect reviews/threads, squash merge without bypass, confirm main post-merge CI, then activate Phase 04 from clean main. Its independently testable Identity/Catalog schema prerequisite is verified in the phase index. Remote IDs and results must be recorded when they exist, not predicted.

## Do not do yet

Keep MIT and third-party notices; no license permission pause. No actual film approval, media delivery or browser playback claim. Roll back only new runtime/tooling; do not drop product/audit data or broadly prune Docker. Real source acquisition/worker is Phase 06, hosted operator trust Phase 14.
