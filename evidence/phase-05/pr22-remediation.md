# PR 22 remediation

Date: 2026-08-28. Requirement scope: P05-R01–P05-R11; Web presentation and build tooling only. Catalog/Identity ownership, rights, requests and retained data are unchanged.

## Candidate and checks

Base candidate: abf3a84bd0e5ce8f772da9fa59c6964d7111c4e5 on feat/p05-web-ssr. This record accompanies the remediation source; Git history identifies its final commit. Docker image: sha256:25d53997edea8dca8afe246324bfa1eab06eb412131a4178b1308b8e60a5ef90.

Initial protected run 33129461576 passed source/integration/platform/security but rejected 27 transitive license exceptions. ADR-0020 preserves MIT and exact reviewed packages/versions; upstream notices are packaged offline. The initial review's absent metadata and premature refresh-success findings have real red/green browser regressions.

- Web unit tests: 30/30; types pass.
- Policy/Web/platform focused tests: 68/68 before the styling-only reduction.
- Real Docker context probe: 18 included and 16 excluded canaries pass.
- Actual final runtime: UID 1000, all 14 traced packages mapped, 73 notice entries and 205 original-file hashes verified.
- Final source gate: 58/58 tasks, 39 cached, 55.482 seconds; [raw gate output](source-pr22.txt).
- Final-image functional run: 20/21. The public-artifact scan's first GET failed with a socket hang up before content assertions. Web had no restart, OOM or server error. Its complete focused rerun passed 1/1 in 3.319 seconds. Thus all 21 distinct scenarios have passing final-image evidence, not a claim of an uninterrupted 21/21 run.
- The profile journey verifies both centered ordinary buttons and left-aligned, space-between profile choices. Fourteen axe scans, keyboard/focus, SSR/private-cache and failure checks remain covered.
- [Raw results](pr22-remediation.json) retain initial failures, diagnostic comparisons, final functional results and resource samples.

The source gate initially scanned generated standalone LICENSE.md files as authored prose. The checker now excludes generated .next output, as it already excludes dist/node_modules. A negative fixture proves authored Web documents still fail missing-title checks; 10/10 documentation tests pass. Upstream license text is not rewritten.

## Performance and host limits

The pre-reduction image failed all three hydration visits at 3662.7–3820.2 ms; all other budgets passed. Old/new ABBA and CPU diagnostics showed variable initialization and a late Apollo streaming chunk. Those diagnostic runs are not acceptance passes or proof of a single cause.

Next's import-optimization probe produced identical output (504 client chunk parts, 966447 decoded bytes), so it was removed. The bundle analyzer identified 26934 decoded bytes of tailwind-merge, used by Button for one actual justification override. Explicit CVA alignment variants remove that dependency and the unused helper while preserving the two concrete layouts and existing shadcn/Radix semantics.

Final-image first three-visit block:

| Visit | Initial JS bytes | Hydration ms | LCP ms | INP ms | CLS |
|---|---:|---:|---:|---:|---:|
| 1 | 232506 | 3019.2 | 1556 | 184 | 0 |
| 2 | 232506 | 3490.5 | 1608 | 112 | 0 |
| 3 | 232506 | 3058.5 | 1532 | 128 | 0 |

Initial JavaScript decreased by 8426 encoded bytes; cumulative dialog JavaScript is 250806 bytes. All unchanged budgets pass, including zero initial browser GraphQL/prefetch. This proves the byte reduction, not that every timing difference came from code. The second hydration sample has little headroom.

Command: ASTER_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome ASTER_ROUTER_CONTAINER=aster-p04-development-router-1 pnpm --filter @aster/web exec playwright test test/browser/performance.spec.ts.

Protocol: Chrome 145.0.7632.159, Node 24.19.0/pnpm 11.24.0, production Docker Web, three fresh 390x844/DPR2 contexts, disabled browser cache, warm server/image cache, 4x CPU slowdown, 150 ms latency and 1.6 Mbit/s down/750 kbit/s up. No overlapping build/browser suite. Preflight WSL load was 2.06 with live idle 96/82%; Windows aggregate was 36% processor time/60% idle. Postflight WSL load was 3.28 with live idle 96/79%.

The owner uses other Windows programs; WSL idle does not establish an idle physical host. A separate Windows DevTools trace included antivirus-injected requests and is excluded from Linux acceptance. No host program, security control or performance budget was disabled. An additional confirmation block was not started at 01:14:28Z because WSL load was 4.52 and live idle was 56/53%. Do not rerun unchanged measurements repeatedly to select success or treat this local baseline as a field SLO.

The separately invoked final confirmation at 01:22:18Z passes all three visits on unchanged source e4708c4c32ef09d901dd040f9ed87e92426e9406 and the same image. Hydration is 2949.7/2727.6/2976.6 ms; LCP 1560/1528/1520 ms; INP 120/88/104 ms; CLS zero. JavaScript remains 232506 initial / 250806 cumulative bytes and initial GraphQL/prefetch remains zero. Preflight WSL load 2.60 and live idle 91/97% met the existing conditions; postflight load is 1.73 and idle 92/82%. No host program was stopped. Both predeclared final-image blocks now pass; no further unchanged benchmark is required. [Exact command, host samples and raw measurements](performance-final-confirmation.json).

## Reuse, cleanup and release

Clean Docker startup/seed/isolation and actual Orca/Firefox reader evidence remain supporting checks: no owner, initialization, trust, focus/live-region or spoken-label mechanism changed. Final-image functional checks confirm the affected presentation. The final source/Docker builds both scan their actual emitted artifacts and preserve license notices. No new media job or clean database reset is needed.

Only the labeled, mount-free aster-p05-pr22-before diagnostic container was removed; its image and raw records remain. All retained databases remain intact.

All applicable local acceptance is complete. Code candidate e4708c4c32ef09d901dd040f9ed87e92426e9406 passed all six jobs in [protected CI 33132459201](https://github.com/andrewsrigom/aster-streaming-platform/actions/runs/33132459201), including dependency review and the required aggregate, completed at 01:25:44Z. The [single confirmation review](https://github.com/andrewsrigom/aster-streaming-platform/pull/22#issuecomment-5447217847) reports no major issues for that exact code head. Both initial review threads are answered and resolved.

Squash/post-merge checks and the final evidence-only head's protected gate remain pending; no Phase 05 release or playable VOD is claimed. Phase 06 begins with actual rights approval before acquisition. This final measurement and memory-only closeout does not change runtime, dependencies, packaging or test protocol, so it does not invalidate the measured image or require another Docker/browser/reader experiment or code-review round.
