# Handoff

## Resume point

Latest, superseding the older checkpoint below: PR30 at85513ef passed clean initial review5457715810. CI33210330287 passes Catalog/Playback and Engagement progress/watchlist SQL, then fails the fields fixture's old two-migration expectation. Corrected to four migrations with cheap cross-fixture alignment coverage; eight tests, scoped lint/build and one actual fields SQL proof pass (remaining0). Publish after candidate gate; request one final-head confirmation. R11 now has28 passing tests plus private Apollo/media binding and PlayerProgress composition; preserve exact stash4e83d8455b9f7c7fe73a50d6ecc4194b6906a32c until rebase. Selectively restore its source/tests, known operations/generated manifest, evidence and active plan; reconcile memory instead of restoring stale R09 state. Earlier1643 was already restored once and must not be applied again.

Current checkpoint: PR30 initial CI33209032494 failed only the stale Catalog Docker proof expectation (eight migrations versus nine). Narrow proof correction and alignment regression pass three tests/scoped checks. Candidate gate and one coherent correction push are next; then initial/confirmation review and protected release. [Evidence](../evidence/phase-08/events-ci.txt). R11 reporter passed eleven tests, lint/format and Web types; it is preserved in stash1643f0b7fa5b82d3f0ba3828414d4e3c92a107d1 on feat/p08-player-progress. Rebase that branch onto the next accepted predecessor, then apply this exact stash once and reconcile memory. Do not apply historical already-restored stashes. The older details below retain implementation evidence, not an instruction to republish the original candidate.

P08-R09/R10/R12 IN_PROGRESS: locally accepted candidate on feat/p08-event-delivery, based on d7fa03a363ab979f008500040b0afa62ddec2704. Publish this coherent candidate next. R08 PR29 is DONE: protected CI33198008084, exact-head confirmation5456085999, squash d7fa03a and exact main push33199190529 all pass. R09 already rebased; autostash fec057f applied. Never reapply it, 8212c15d42e15d77e7fa5725c651c9d6bc4adbaf, or older restored stashes. Full Phase00–14 goal remains active.

## Exact next actions

1. Latest strict broker/event/Engagement builds, 54 focused tests, 24 CI/platform tests and six shutdown/platform tests PASS. [Real SQL](../evidence/phase-08/events-postgres.txt) passes the corrected maximum 8192-byte value/4096-byte header quarantine path, owner roles/leases/races and reconstruction. No unchanged SQL repeat.
2. [Real Kafka observations](../evidence/phase-08/events-runtime.txt) prove all three backlogs, authenticated deletion, exact redelivery/one effect, poison/replay/offsets, outage saving, pending recovery and a newly consumed deletion. Corrected one-second rebalance wait and independent relay step; request deadlines unchanged. Router needs a local refresh after owner recreation. Kafka-init masks all image volumes with bounded tmpfs. Every fixture, including the earlier failed one, is cleaned; no retained changes.
3. Last supervisor exit was 1 ONLY because the new test expected exit 0 on SIGTERM. All owners actually exited the existing specified 143 with completed lifecycle logs. The corrected eventShutdownComplete validator passes against actual captured states/logs in events-shutdown.json; six adverse/real-process tests pass. Later changes only preserve behavior: formatting, erased type visibility, key-buffer naming and equivalent fixture URLs. Do not report a successful local full-supervisor exit; require protected CI to execute the corrected wrapper. Do not repeat unchanged runtime behavior for those static corrections.
4. [Candidate gate](../evidence/phase-08/events-candidate.txt) PASS: 70/70 tasks, 46 cached, 1m14.31s, concurrency two; exact d7fa03a composition passes. Four scanner false positives were corrected without scanner exemptions; 14 focused tests pass. Source hashes are events-source.sha256. Finish documentation-only checkpoint checks, commit/publish once, then require initial/confirmation review, protected CI, squash and exact main push. A frozen published candidate may become WAITING_EXTERNAL before one local R11 branch starts.
5. R11 player save/resume is next, not concurrent unresolved work. Preserve permanent deletion guards, uncertain outboxes, quarantine and signing key. The general reset helper still refuses the event overlay until full-demo integration; do not weaken it.

## Execution environment

WSL works; Docker's Ubuntu repo bind-mount integration last refused its distro-services socket. Do not retry unchanged mounts or restart WSL/Docker automatically. The owner subsequently reported memory decreased. Direct native WSL Docker worked for sequential disposable PostgreSQL proofs; no repo bind was used and every fixture was removed. No second host measurement was made.

Working native runtime copied from existing trusted aster-p06-tooling:git (temporary extraction container removed after exact ownership verification):
/mnt/c/Users/andre/.cache/aster-node-24.19.0

Node binary SHA256 bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12, version24.19.0. Cached pnpm is corepack/v1/pnpm/11.24.0/bin/pnpm.cjs; an executable pnpm shim now exists alongside Node, so adding this directory to PATH also supports child supervisors. Normal frozen install passed. Use native WSL Linux Git for authoritative modes; Windows Git credentials are available for remote work. No codex/ branches.

Normal frozen install succeeded with unchanged external versions/policies. Offline metadata was incomplete; the normal online verification resolved it. Do not disable supply-chain checks or reinstall repeatedly. Default cheap checks can use NODE_OPTIONS=--max-old-space-size=384 and node --test --test-concurrency=1. Do not launch the full parallel/container gate under known host pressure.

## Recovery and retained runtime

One user-requested snapshot: host95.8% RAM (31.73GiB total,1.34GiB free), WSLworking-set~2.9GiB, all Aster containers~480MiB. No build/test was running at that snapshot. This is not a leak or root-cause diagnosis; do not repeat CPU/memory loops. Continue bounded source work and sequence gates with safe headroom.

Earlier targeted Ubuntu stop/start and restart of eight existing Aster containers restored nine healthy services, running collector and homepageHTTP200. Other projects/data were untouched. Retained project aster-p04-development has Web3000/Router4000/origin9001, Catalog0008/Playback0001; no Phase08 retained upgrade.

Big Buck Bunny title00000000-0000-4000-8000-000000080001 remains version9/rights4/publication c2929850-d3a3-4e30-945f-688d639d2c68. Bundle3c61f68d54f5e9035ae9fca9416baf9b45fdd547faa074b6caf3a4b4e6e7792d,209objects/95496764bytes. No new encode/media verification.
Backup C:/Users/andre/AppData/Local/Temp/aster-p07-runtime-f3750a5a-e6dc-41db-a003-c3492d35874b/catalog-before.dump. Rollback tags aster-p07-rollback:{web,router,catalog}. Web imagef29a1ebe/Catalog4429f8e0; Playback/Router released Phase07. [Upgrade](../evidence/phase-07/backend-release.md).

## Do not do yet

No broad Docker reset, host-load loop, paid resource or encode. Do not claim complete Phase08 or a successful local corrected-supervisor exit. Preserve all durable data, event keys, pending facts, deletion fences and already-applied stashes.
