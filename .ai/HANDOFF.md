# Handoff

## Resume point

P09-R01 is released through PR33 exact candidate `fc353c3`, protected run
33238473742, resolved review, squash main `0bdcb27` and exact-main run
33239191134. Search/projection evidence remains under `evidence/phase-09`.

P09-R03 is released through PR34 exact390b655, protected run33248598719, clean
confirmation, squash main `a3f969c` and exact-main run33249289718. Rails,
fallback, owner composition, telemetry, real SQL/runtime
and the initial54/54 gate pass. Confirmation discussions3886014605/606 found
database fan-out and rollout blockers. Fan-out now uses one transaction per home
request with one readiness pool reservation; Discovery83/83 passes. PR35 stages
ordered migrations1–2 or1–3 in readiness and old init without applying migration3;
its corrected75/75 plus42/42, clean confirmation and protected run33243983340 pass.
PR35 merged as583c835; exact-main run33244657936 passed. Discovery88/88, real
mixed readiness and repeated runtime pass with cleanup0. Migration3/publication
is unblocked. Final candidate passes54/54,39 cached, in48.761s.
PR34 exact0d1a7ef passed protected run33245434181; remediation confirmation then
found partial-log classification and stale parallel wording in ADR-0036. Both are
corrected locally; focused Discovery89/89 and the final54/54 affected candidate
in47.708s pass.
Exact8650670 passed protected run33246333963. Final confirmation found only the
GraphQL architecture excerpt default20/schema default10 mismatch; fixed locally.
Exactdf08a70 passed protected run33247048014. Closeout review5057633664 discussion
3886259953 found the genre branch can flatten36 Catalog references while its guard
accepted20. The local correction accepts36 valid Title representations, rejects37
and proves the existing DataLoader splits36 into two owner reads of at most20;
Catalog build and230/230 tests pass.
The corrected affected candidate passes54/54,38 cached, in55.844s.
Exactdbce479 was published and protected run33248060625 started. Closeout
review5057751709 discussion3886349355 (`PRRT_kwDOUEkeis6dZPxv`) found fallback
hid cancelled/indeterminate primary outcomes. The invalidated run was cancelled.
Fallback now applies only to empty/unavailable; Discovery build,90/90 and the
affected54/54 candidate in49.022s pass. P09-R10 is active on
`feat/p09-web-discovery` from clean exact main. Its plan covers public Apollo SSR
rails/search, isolated profile enhancement and Phase 09 browser acceptance.
Full Phase00–14 goal remains active.

P09-R10 implementation now includes exact HomePublic/SearchTitles public
projection, SSR home/search views, one-snapshot cache policies, owner-confirmed
HomePersonalized progress and finite Router labels. Web110/110, production build,
artifact/notice scans, Router10/10 and schema composition pass. Disposable project
`aster-p09-web-proof-829b704d` passes the new discovery journey3/3, Discovery
isolation1/1 and the affected browser group after one fixed keyboard-harness
assumption. Initial review's rail-source/aggregate semantic correction then passes
Web110/110, rebuilt discovery browser4/4 and local re-review with no blocker. Final
candidate passes46/46 in1m03.813s; audit has zero high/critical and one known
moderate. Exact disposable cleanup reports containers0/networks0/volumes0.
Implementation commit is exact19a510cbccb04614373b448055f985df6bce7368;
published checkpoint b087bc5564595d5434ba63be2dca880cce748531 passed every
protected job in run33252690275. Hosted review5058080810 found invalid discovery
locale coercion, an invisible failed genre group and accepted unusable PARTIAL
payloads. Their batched local correction rejects the URLs, surfaces the group and
requires one usable aggregate child. Web110/110, strict types/lint, production
build/scans and rebuilt browser8/8 pass; cleanup is containers0/networks0/volumes0.
The corrected affected candidate passes46/46,32 cached, in51.27s.

## Exact next actions

1. Commit and push the batched PR36 correction once.
2. Resolve the three corrected discussions, request one exact-head confirmation
   and await protected CI.
3. Treat only blocking confirmation findings, squash merge and pass exact-main CI.

## Evidence boundaries

The precursor evidence is in `home-rails-compatibility.txt`. Initial [SQL](../evidence/phase-09/home-rails-postgres.txt)
and [runtime](../evidence/phase-09/home-rails-runtime.txt) evidence retain failures,
corrections and zero residue. Pool/admission and mixed-version changes received both
affected repeats; source object IDs remained exact after the final squash rebase.
The later log classifier and ADR prose are covered by focused/candidate gates and
cannot affect SQL, media or binary runtime behavior. The Catalog change affects
only bounded GraphQL admission and request-scoped batching: a real HTTP regression
proves36 references become two owner reads of at most20. It cannot affect the
unchanged projection SQL, media or Docker topology. The fallback correction is
pure aggregation with a direct outcome/telemetry regression. Browser/media/CPU
evidence is unaffected.

P09-R10 records new Web/browser evidence in `web-discovery-runtime.txt` for
hydration, profile lifecycle and Discovery failure. It carries forward unchanged
owner SQL/Kafka/media evidence; local final candidate/review/cleanup results are
appended. Publication must add the exact commit and protected/exact-main results.

## Execution environment

Use native WSL Git and pinned Node 24.19.0/pnpm 11.24.0 from
`/mnt/c/Users/andre/.cache/aster-node-24.19.0`. Add it to PATH, install before
setting `pnpm_config_verify_deps_before_run=error`, and use
`CI=true NODE_OPTIONS=--max-old-space-size=1536`. Run commands through
`wsl --distribution Ubuntu-20.04 --user andrews --exec` with bounded deadlines.

Windows Git credential manager works with command-scoped
`safe.directory=//wsl.localhost/Ubuntu-20.04/home/andrews/personal/portfolio-2026/aster-streaming-platform`.
Never create or use `codex/` branches.

## Do not do yet

Preserve all retained media, databases, credentials, pending events and deletion
fences. The retained project is not a P09 acceptance target. No WSL/Docker restart,
global cleanup, unrelated-process action, CPU/memory loop, unchanged heavyweight
proof or film encode. Use only UUID-labelled disposable fixtures and exact cleanup.
