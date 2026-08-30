# Handoff

## Resume point

P12-R11 and the remaining local-browser portion of P12-R04 are active on
`feat/p12-browser-telemetry-policy`, based exactly on released main
`22452518569c979453e9e98f7f9cd52b5b0d416b`.

The player candidate fixes sampling at 100% for local attempts and 0% for remote
export, retains at most 64 events for one player attempt, adds bounded
first-frame/rebuffer aggregates and explicitly erases the recorder on retry or
unmount. Pause/seek cancels a pending rebuffer; fatal failure closes one active
interval before teardown. The report has no transport, persistence, identifiers,
URLs or arbitrary labels. The policy is documented in
`docs/operations/PLAYBACK_TELEMETRY.md`.

Recorder/adapter tests pass 19/19 and the complete Web suite passes 116/116.
Typecheck and scoped ESLint pass. Documentation validation passes 236 documents,
2911 headings and 1477 links. The exact affected candidate passes 14/14 tasks
with one cached in 48.518 seconds. A single Docker availability query found no daemon
before resource creation; browser, review and protected gates remain.

The predecessor is released. PR46 exact head `95e3a73`, tree `c0eb46a`, passed
protected run `33303267611` and clean confirmation; squash main `2245251` passed
exact-main run `33304196111`.

## Exact next actions

1. Inspect the complete diff and create one coherent candidate commit.
2. Run one changed playable-browser/report path in protected CI; do not
   transcode or reset retained media locally.
3. Complete exact evidence and memory after the protected result.
4. Run one initial review, batch only blockers, publish one PR and complete
   protected CI plus one confirmation review.
5. Squash merge, prove exact main and activate P12-R05/R06 SLI/SLO definitions.

## Evidence boundaries

The local report proves instrumentation behavior only. Remote sample rate and
server retention are zero, so it cannot support a field-SLI, percentile or
capacity claim. Existing media bytes, publication, sessions and progress are
unchanged. The changed browser report invalidates only the report/playback
journey, not FFmpeg, rights, publication or other heavyweight evidence.

## Execution environment

Use native WSL Git and pinned Node.js 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Candidate gates use
`CI=true NODE_OPTIONS=--max-old-space-size=1536 TURBO_CONCURRENCY=4`. Never use a
`codex/` branch.

## Do not do yet

Do not restart WSL/Docker, repeat host CPU/memory diagnostics, reset the retained
`aster-p04-development` project or rebuild media merely to verify this browser
slice. Any disposable runtime must use an exact project name and scoped cleanup.
