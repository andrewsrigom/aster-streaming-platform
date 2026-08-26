# Phase 05 — Web Shell, SSR, and Hydration

## Objective

Build the public browsing experience with deterministic server rendering, Apollo cache hydration, and explicit client-state ownership.

## Product traceability

- Supports: `IDP-R02`, `IDP-R03`, `IDP-R04`, `CAT-R05`, `CAT-R06`, `QLT-R01`, `QLT-R03`, `QLT-R04`.
- Product-level accessibility and security acceptance remains in Phase 14.

## Prerequisites

- Phase 04 is verified.
- Phase 03 exposes a deterministic synthetic published-title fixture backed by its small technically valid generated HLS fixture. It exercises the publication invariant but does not require downloading or processing a real film.

## Deliverables

- Next.js App Router application
- design tokens and accessible UI foundation
- SSR home, browse, title, attribution, and profile-selection routes
- Apollo Client server and browser integration
- Redux Toolkit player/shell store boundary
- responsive artwork and loading/error states
- hydration and web-performance tests
- a small validated accessible UI primitive set with no unused component inventory

## Requirements

### P05-R01

Render public catalog and title content on the server through versioned first-party GraphQL documents. Phase 13 turns the resulting operation inventory into enforced hosted trusted operations.
### P05-R02

Serialize only a safe deterministic Apollo cache snapshot and hydrate without duplicate initial requests.
### P05-R03

Keep Apollo remote data, Redux interaction state, and local component state separate.
### P05-R04

Implement locale-stable formatting and prevent time, random, storage, and viewport hydration mismatches.
### P05-R05

Provide responsive, semantic, keyboard-accessible navigation, rails, cards, title pages, and dialogs.
### P05-R06

Provide explicit loading, empty, stale, degraded, error, and retry states.
### P05-R07

Use optimized responsive artwork with alt behavior appropriate to decorative versus informative images.
### P05-R08

Define initial budgets for JavaScript, images, LCP, INP, CLS, hydration, and GraphQL operations.
### P05-R09

Keep server-only configuration and identity artifacts out of client bundles and serialized state.
### P05-R10

Run browser tests for SSR HTML, hydration, navigation, keyboard flow, and profile selection.
### P05-R11

Select the smallest accessible UI primitive strategy through current Next.js and React compatibility, keyboard and screen-reader behavior, bundle impact, maintenance, customization ownership, and license evidence. Evaluate shadcn/ui as the preferred candidate, add only components required by implemented routes, and keep media-player controls in Phase 07.

## Invariants

- First client render matches server output.
- Server-only secrets never enter browser JavaScript or HTML.
- Remote GraphQL state is not copied into Redux.
- Public pages remain useful before client JavaScript completes.
- Profile-specific cache entries are scoped correctly.

## Implementation sequence

1. Define visual and accessibility foundation.
2. Configure server-side GraphQL client.
3. Implement public routes.
4. Configure client Apollo restoration and policies.
5. Configure minimal Redux slices.
6. Add profile flow.
7. Add hydration and browser tests.
8. Capture baseline web performance.

## Required tests

- View-source contains expected public title content.
- No hydration warnings under fixed and varied locale.
- No duplicate initial GraphQL operation after hydration.
- Keyboard-only browse and dialog use.
- Slow JavaScript and disabled-JavaScript public content checks.
- Client bundle secret scan.
- UI primitive keyboard, focus, reduced-motion, bundle, and unused-component checks.

## Required evidence

Store the phase evidence index under `evidence/phase-05/` when implementation begins.

- SSR HTML sample
- Apollo cache snapshot review
- browser console report
- accessibility results
- bundle analysis
- initial Core Web Vitals laboratory report
- UI primitive selection record and installed-component inventory

Every measured result must identify commit, environment, exact command, workload, raw artifact, interpretation, and limitations.

## Non-goals

- Video player
- Progress reporting
- Advanced home personalization
- Final visual polish across every device
- A bespoke design system or a broad component gallery without product use cases
- Offline support

## Exit gate

The phase is `VERIFIED` only when:

- every requirement has a linked implementation or documented non-applicability;
- all required tests pass from a clean environment;
- evidence is stored and reviewed;
- security, accessibility, failure, and operational effects are documented;
- no planned behavior is described as implemented;
- `.ai/CURRENT_STATE.md`, `.ai/WORK_QUEUE.md`, `.ai/SESSION_LOG.md`, and `.ai/HANDOFF.md` are current;
- the next phase prerequisites are explicitly checked.

## Learning outcomes

- React Server Components
- SSR and hydration invariants
- Apollo cache restoration
- State ownership
- Accessible server-rendered UI

## Agent constraints

- Load `skills/agent.md` and every skill related to this phase.
- Do not implement later-phase capabilities to hide an incomplete requirement.
- Do not add placeholder services, dashboards, events, or metrics.
- Use requirement IDs in the active change plan.
- Stop and write an ADR when a fixed architecture decision must change.
