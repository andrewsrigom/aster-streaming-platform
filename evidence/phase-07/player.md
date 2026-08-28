# Player and playable-demo candidate

Status: implemented and locally verified for the acceptance below; candidate gate passes 64/64, protected review/release remain pending. Date: 2026-08-28. Source branch feat/p07-player, based on released f2d99d254263baac532ef36edba0ab2c99d20dc3. The candidate commit identifies these source/evidence files; no uncommitted build is described as released.

## Acceptance

| Requirements | Result and evidence |
|---|---|
| P07-R01, R02, R03, R09 | Released [backend](backend-release.md): current owner approval, bounded sessions, direct reference and no optional Identity dependency |
| P07-R04, R05, R06 | HLS adapter, keyboard/focus/fullscreen, manual/automatic quality, caption tracks and privacy-bounded preference restoration pass Chromium checks and Web unit tests |
| P07-R07, R10 | Deliberate session retry, unavailable title, expiry, missing manifest/segment, slow delivery, caption selection and teardown pass focused/browser cases; backend proves actual retirement rejection |
| P07-R08 | Bounded event vocabulary, first decoded frame, switches, rebuffer, completion and redaction tested; actual session/manifest/frame samples captured below |
| P07-R11 | [ADR-0028](../../docs/adr/0028-player-controls.md), production Next/React build, notices, lazy bundle, control semantics and documented browser limits |
| P07-R12 | Empty-project Docker build/start, actual generated HLS/captions, direct origin, private-object denial, repeat initialization and exact cleanup pass |

## Browser and control evidence

Node 24.19.0 / pnpm 11.24.0; Playwright 1.62.1, axe 4.13, Chrome 152.0.7977.64 on Windows against Linux Docker applications. One worker, no retries. Native Windows Chrome runs the repository's unchanged test bodies with the pinned Playwright packages; no user browser profile is used.

The retained Big Buck Bunny publication is unchanged: 596.5 seconds, two renditions, 209 objects / 95496764 bytes. No new source acquisition or whole-film encode. [Initial eight-case summary](player-browser-initial.json) records seven passes and a faulty SSR assertion that rejected an allowed public artwork URL. [Three-case correction](player-browser-confirmed.json) proves explicit session/direct media, real HLS caption selection using a labeled technical fixture, and caption failure. [Final ABR/lazy-load pair](player-browser-final.json) proves ordinary preference updates do not reset automatic quality and browsing does not fetch HLS code. Together these cover eleven distinct functional journeys, not eleven runs of the same experiment.

The default-caption demo exposed a different boundary: disabling a DEFAULT track during its load let HLS.js discard cues while marking the fragment buffered. Hidden tracks now retain cues while display is off. The real demo confirms enabling English after initial Off; native fallback retains native behavior. Axe also rejected Media Chrome's redundant caption toggle (`aria-checked` on role button). It is not mounted; the labeled native track select retains all caption functions. No accessibility rule was disabled. The [final affected controls/captions checks](player-browser-release.json) pass 3/3 on the final image, including the DEFAULT=NO technical subtitle fixture and preference/fullscreen journey.

Final Web image: sha256:66116c9ec0db10dacfb4501753311ce0e3cea098552d4512bad7c1179f33027b. `docker build --file infra/docker/web.Dockerfile --tag aster-p07-player:final .` passes production compilation, TypeScript, public-asset scanning and notice packaging: 24 JavaScript files, 30 entries, 1748601 raw asset bytes, no private-config findings. Package notices are preserved; see [Web notices](../../apps/web/THIRD_PARTY_NOTICES.md).

The earlier ABR image's measured network sample was 232713 encoded JavaScript bytes while browsing and 230369 additional bytes on watch activation. It is a single transfer sample, not a cold-start or field timing SLO. Caption fixes preserve that lazy boundary; final source/build checks cover the later image. No performance claim uses npm download size.

| Platform / accessibility scope | Evidence / limitation |
|---|---|
| Chromium / Windows, Linux Docker | Actual decode, controls, captions, quality, fullscreen, preference reload, failures and direct requests |
| Native HLS fallback | Unit-tested branch, automatic-quality limitation; no actual Safari/iOS device claim |
| Firefox / other devices | Not measured; not certified |
| Assistive semantics | Keyboard/focus, accessible names and axe A/AA; not a new OS screen-reader speech test |
| Media content | BBB has no approved captions/audio description; axe's video-caption incomplete is retained. Generated English captions are technical content, not fabricated film dialogue |

## Clean playable demo and replay

Exact command shape: `docker compose --project-name aster-p07-playable-proof --file infra/compose/compose.yml --file infra/compose/playable.yml --profile runtime up --build --wait --wait-timeout 180 web`. This workstation built the same images first (`build --with-dependencies web`) and then used `up --no-build --wait --wait-timeout 120 web`; initial project containers and volumes were absent. Cached base/build layers were available, so this is not a cold-download benchmark. Protected CI runs the combined documented command in its fresh runner/project.

[Startup](playable-startup.txt), [initialization](playable-initialization.txt) and [initial images/resource limits](playable-runtime.json) show owner migrations, completed generation, PUBLISHED/changed:true and healthy applications without Identity, Redis or broker. The source-owned six-second fixture is 320×180/24fps with English captions: eight files / 1948485 bytes, source checksum a3dd31b3057c90edfd9ff98525d30c132f517288173861d5d6ffd84d69f791ae. Seven public objects total 420034 bytes. No third-party film rights are implied. [ADR-0029](../../docs/adr/0029-generated-playable-demo.md).

`ASTER_PLAYABLE_DEMO=true ... playwright test demo.spec.ts` passes once on the final Web image: [raw report](playable-browser.json), [screenshot](playable-demo.png), [exact final image identities](playable-final-images.json). Assertions prove actual frame progression, English cues after Off, zero automated A/AA violations, no page errors, TS/VTT directly from loopback origin 9001, and denial of source/report/listing/unapproved prefixes. The screenshot is paused before the first caption's active time; cue availability is established by the DOM assertion, not an invented visible subtitle.

Its actual local sample reports session 71 ms, manifest 46 ms and first frame 451 ms after adapter attachment (570 ms after explicit start). These are individual observations, not percentiles or an SLO. Raw bounded measurements contain no URLs, session/title IDs or credentials.

The first [replay failure](playable-replay.txt) and [partial correction](playable-replay-corrected.txt) exposed the shared S3 stream boundary: an SDK-detached validator could emit an unhandled error; SDK cancellation could then mask the authoritative conditional-PUT 412 with a feed error. Two regression tests cover detached listeners and secondary cancellation. The adapter observes the validator error and preserves the known already-exists result; the publisher still reads back and verifies every existing byte. No overwrite or blind success was added.

The corrected Catalog/seed image c6d7737ceefad7fa9a4ee9b66bda7b1913a02c56786253222c6860e7b99dd122 passes [no-change seed replay](playable-replay-confirmed.txt). A complete second `up --no-build --wait --wait-timeout 120 web` passes: [state](playable-replay-state.json), [generator reuse](playable-generated-reuse.txt). The later removal of an unnecessary optional chain on a statically known tuple entry is lint-only, not a runtime boundary change. No repeated fixture encode was needed. Expected SDK conditional-stream warnings are finite and contain no credentials.

One `docker stats --no-stream --format '{{json .}}'` sample scoped to the seven proof containers is recorded in [resource sample](playable-resource-sample.json), after the browser journey. It is not peak memory, sustained load, a machine-health test or a CPU tuning baseline. Limits and process counts are distinct from measured usage.

[Cleanup](playable-cleanup.json) verified exact project labels, thirteen allowed containers, seven named volumes with no foreign attachment and two networks with no foreign member, then used only that project's `down --volumes`. Zero project resources remained. Disposable generated data/history was deleted; fixture bytes are reproducible. Retained aster-p04-development data, film and Windows processes were preserved. Its Web now runs the final player image; the temporarily stopped Router/origin are restored.

## Candidate gate and stopping rule

Initial PR 25 review and CI findings are addressed in the [batched correction](player-review.md), including current runtime image identities and the corrected 64/64 gate. The historical candidate measurements below remain labeled to their original images and commands.

Focused Web tests pass 45/45, including eight adapter cases. Shared S3 regression tests pass 21/21 and Catalog passes 197/197. CI-policy/export checks pass 22/22. [Source inventory](player-source.sha256) covers 43 changed executable/configuration files. [Dependency audit](player-dependency-audit.json) reports zero high/critical and one moderate vulnerability. [Candidate gate](player-candidate-gate.txt) passes 64/64 tasks, 52 cached, including whole-workspace lint, types, production build, owner tests, governance and exact-base schema compatibility. It uses the unmodified `createQualityGateInvocation(['--changed'])` task list with only Turbo `--concurrency=2` appended; no check is excluded. Final metadata receives separate cheap docs/memory/secrets checks.

Initial candidate checks corrected a missing resume ID, relocated historical links, unused exports and the explicit initializer entry point. A full-parallel attempt hit the unchanged Identity subprocess's five-second limit; limiting Turbo to two concurrent tasks passed that test. An artificial 1 GiB per-process heap then prevented whole-workspace ESLint completion, while 63/64 tasks passed; the executor uses a 2 GiB heap inside its existing 4 GiB container. No machine diagnosis, test deadline relaxation or application resource-limit change is involved. These failed tool executions are not counted as acceptance. Docker-context policy/adverse tests and actual images pass; this Windows Docker local-export canary failed with context cancellation earlier and was not repeatedly retried. The existing protected Linux CI canary remains required.

Only changes to adapter/controls/transport, seed/object authority, packaging/Compose or fixture recipe invalidate the corresponding heavy result. Documentation, hashes, assertion-name correction, whitespace, removal of unconsumed exports and a type-proven optional chain do not require another whole-film/SQL/demo run. The candidate build/types/unit tests cover those later source cleanups. One initial review and one confirmation; fix only requirements, security/data, availability or public-contract blockers. Local acceptance does not bypass protected CI or imply Phase 08 implementation.
