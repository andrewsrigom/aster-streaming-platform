# Work Item: Honest player progress, resume and owned library

- Status: IN_PROGRESS
- Owner: Web interaction; Engagement owns durable progress and membership
- Phase: 08
- Requirement IDs: P08-R11; supports ENG-R01–ENG-R06 and Phase08 closeout
- Created: 2026-08-28
- Updated: 2026-08-28

## Outcome

A viewer selects an owned profile, watches and resumes a title, sees truthful save status and bounded continue-watching/history/watchlist. Anonymous playback remains usable without personalization.

## Current behavior

Predecessor PR30 is released at main7fe10ed9251c5e2c9d6f08d32ce3d93a29f627cc, exact push33212852513 successful. R11 checkpoint533368d plus browser corrections passes real personalized save/resume/library/failure/focus/accessibility and disposable startup/replay/cleanup. The refreshed candidate gate passes70/70 with exact-main composition and31 matching source hashes. Own protected release remains. Retained Phase07 demo restored intact; no historical checkpoint may be reapplied.

## Proposed behavior

Use the existing public supergraph, Apollo clients, Identity profile selection and client-only HLS player. Add a finite reporter, private profile-scoped Apollo state and a small library view. Keep the current player widgets and Redux preferences. No new service, dependency, durable browser queue or account flow.

## Boundaries

Engagement remains PostgreSQL authority for sequence, thresholds, history and membership; Identity authorizes ownership, Catalog owns visibility, Playback owns sessions. Web owns only pending user intent and UI coordination. Affected paths: apps/web/features/engagement, features/playback, private profile notification, app/library, components/navigation, focused/browser tests, known operations and reviewed demo/cleanup integration. Domain/application service contracts and media bytes are unchanged.

## Invariants

Only COMPLETED acknowledges a durable save. Seed sequence from a fresh owned read and increment across playback sessions, not from wall time. Uncertain requests retain their exact key/payload; never replace an uncertain intent with a new key. A profile change, sign-out, expiry or tab invalidation discards private caches and cancels old interactive work. Remote state stays in Apollo, not Redux. Optional save/read failure cannot block anonymous media.

## Failure behavior

One report in flight and one coalesced unsent sample, never an offline queue. Report every fifteen seconds while playing, with bounded pause/ended/visibility flushes and at most two attempts for the identical transient/indeterminate command. Stale/conflicting/denied outcomes stop that intent and require fresh state or explicit recovery, not automatic overwriting of another tab.

Use four-second transport deadlines, bounded request/response bytes, no redirects and known operation documents. Visibility-hidden/pagehide may send one bounded keepalive request, but navigation or browser termination can lose it. Keepalive is an attempt, not a save acknowledgement; periodic saving remains primary. Cancellation/failure reports an honest finite UI status. Resume only IN_PROGRESS state after media metadata, clamped to actual duration; absent/completed/failed reads do not seek or claim resume.

## Data and contracts

No new durable schema, event or owner trust credential. Add bounded client documents to known operations and verify composition. Scope private Apollo cache to the current profile/session generation, bound list pages to twenty and replace pages rather than grow indefinitely. Re-read current server state after session changes and before continued writing. No progress, cookie, signed URL or profile history in localStorage or local QoE output.

## Security and privacy

Credentialed requests target only the fixed local Router with existing Origin/CSRF policy. Browser profile IDs never authorize a save; owner-side checks remain. Validate enums, identifiers, bounds, response ownership and finite numbers before UI use. Do not hydrate private state into public SSR snapshots. A profile/session broadcast is an invalidation hint, never authority. Requests from an old generation must not refill a new profile cache.

## Implementation steps

1. Implement bounded typed operations/response validation and the pure reporter with deterministic adverse tests.
2. Wire private Apollo/profile lifetime, HLS media events, resume and accessible save status.
3. Add minimal continue-watching/history/watchlist controls and profile-aware navigation.
4. Verify the optional demo by combining compose.yml, playable.yml and events.yml, targeting web identity engagement broker-init on a fresh explicitly named project. Inspect that merged model and exact cleanup first. Preserve the Phase07 web-only anonymous command and retained project; no new Compose abstraction is needed if the existing overlays satisfy the flow.
5. Verify focused, browser, demo and failure acceptance; close Phase08 and check Phase09 prerequisites after ordered protected releases.

Local acceptance uses the fresh project `aster-p08-demo-20260828`: inspected model has only project-named volumes and no host binds; no pre-existing containers or volumes were found. Build serially while the retained demo stays available. For the standard fixed-origin browser contract, stop only the inspected retained Web, Router and media-origin containers, without removing them or their data; restore these same containers after the disposable project is stopped. Test cleanup may remove only resources labelled with the exact fresh project, after rechecking ownership. Never apply `down --volumes` to `aster-p04-development`. Reuse the existing pinned Windows Playwright tooling and a fresh browser context; do not use a personal browser profile.

Acceptance corrections: retain pause/seek flush priority while the preceding save/retry is active; omit unused library fields rather than shrink pages or relax cost protection; restore keyboard focus after watchlist refetch; confine Playwright artifacts to its own output directory. [Actual results and prior failures](../evidence/phase-08/player-demo.md) include the recovered seed upload failure without claiming its root cause. The final supervisor exits0 and removes only the inspected disposable fixture. CI now carries the same two-mode journey in its existing affected lane, with explicit topic completion and complete-model cleanup.

## Tests

Unit: frequency/coalescing, same-key replay, uncertain/stale outcomes, sequence exhaustion, intentional backward seek, maximum duration, cancellation, profile swap, late response, unavailable/empty distinction, completed/no-progress resume and unload attempt without false success. Contract: strict bounded client documents, current schema and private cache policies. Browser: real save/pause/reload/resume, continue-watching completion/history, watchlist add/remove, profile isolation/sign-out, save outage with ongoing media, navigation and accessible status. Reuse current published/generated media; do not re-encode the retained film or repeat CPU experiments.

## Evidence

Iteration gate: cheapest affected node:test, TypeScript and scoped lint. Candidate gate: pnpm check:changed and exact-base composition. Acceptance: one coherent real browser/owner demo run, clean Docker-only startup/replay and failure journey; fixtures must use bounded resources and exact ownership cleanup. Raw artifacts under evidence/phase-08 with command, source, environment and limitations.

Repeat heavyweight evidence only if later changes affect transport/lifetime/reporting, owner contracts, media wiring, packaging/bootstrap or cleanup. No unchanged Kafka/SQL/film/CPU repeat. One initial and one confirmation review; extend only for requirement, security/data, availability or public-contract blockers.

Sources checked 2026-08-28: [keepalive](https://developer.mozilla.org/en-US/docs/Web/API/Request/keepalive), [visibility lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event), [pagehide limitations](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event). These do not promise delivery after browser termination. Follow repository frontend/GraphQL invariants over generic Next.js recommendations for direct DB access or server-action mutations.

## Rollback or recovery

Restore compatible prior Web/Router artifacts and stop optional reporting/event activation, retaining all database/media state, pending events and permanent deletion guards. Keep the existing anonymous demo command available. Before any retained owner migration: inspected exact backup, drain, compatible images and rollback/roll-forward verification. No automatic WSL/Docker restart, global cleanup or unrelated-process action.

If PR30 changes, preserve this dependent work, rebase onto its reviewed replacement and repeat affected gates before publication. Never reapply historical restored stashes.

## Documentation updates

Player/library behavior, save/unload limitations, Docker-only demo and exact cleanup, Phase08 acceptance index and concise repository memory at candidate/closeout checkpoints.

## Completion checklist

- [x] Reporter and private client tests pass
- [x] Real resume/library/failure/accessibility journey passes
- [x] Clean Docker-only demo and reviewed cleanup pass
- [ ] Predecessor released; own protected review/CI/release passes
- [ ] Phase08 acceptance and Phase09 prerequisites recorded
