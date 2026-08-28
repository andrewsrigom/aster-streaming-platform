# ADR-0019: Dev-only Accessibility Checks

- Status: Accepted
- Date: 2026-08-27
- Owners: Web presentation and repository tooling
- Related requirements: P05-R05, P05-R10, P05-R11

## Decision

Use unmodified `@axe-core/playwright` 4.13.0 and its locked `axe-core` 4.13.0 dependency only in browser tests. They use MPL-2.0. Their use as separate test tooling does not require changing Aster-authored files from MIT. Preserve upstream notices and source access; do not copy the engine into product code. If distributing this tooling, include its license and the corresponding upstream source location. Any modification or production inclusion requires renewed review of the actual distribution and obligations.

Keep the general CI license allowlist unchanged. Add exceptions for only these two npm packages, not all MPL software. The pinned dependency-review action matches package URLs without considering versions, so Web tests separately enforce the reviewed versions, lock entries, dev-only placement and absent install hooks. Vulnerability review remains enabled for all scopes. No new hosted service or paid resource is involved.

Automated results complement keyboard, focus, reduced-motion and screen-reader review; zero axe violations is not a complete accessibility claim. No inaccessible subtree or rule is excluded to make tests pass.

## Validation and rollback

For the separate actual-reader review, use unmodified Debian Orca 48.1 (LGPL-2.1-or-later) and Firefox ESR 140.14 (MPL-2.0 and its retained bundled notices) in a disposable, resource-limited private X11/D-Bus container. These are external verification programs, not linked/copied Aster code or production dependencies. Keep upstream notices and source access, retain Aster's MIT license and do not broaden the npm allowlist. [Debian's exact Orca copyright record](https://metadata.ftp-master.debian.org/changelogs/main/o/orca/orca_48.1-1%2Bdeb13u2_copyright) and Mozilla's terms below support this narrow use. The agent-browser helper used in preliminary trials is Apache-2.0, not MIT. No patched reader or weakened application semantics may be used to manufacture acceptance. The [actual review](../../evidence/phase-05/reader-review.md) records speech, adverse trials, isolation and cleanup.

Run scans against the actual Docker Web routes and dialog states. Inspect incomplete results, not only violations. Confirm test engines are absent from production assets/runtime. Remove the dev dependency, tests and the two exceptions together to roll back; no product data or UI migration is involved.

## Sources and terms

- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).
- [Pinned adapter source and MPL license](https://github.com/dequelabs/axe-core-npm/tree/70dca949a4e55e2fb83e4e6896fbbf788c56b6fd).
- [axe-core 4.13.0 source](https://github.com/dequelabs/axe-core/tree/v4.13.0).
- [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/), especially sections 2 and 3, and [Mozilla's FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
- [Pinned action's package matching](https://github.com/actions/dependency-review-action/blob/a1d282b36b6f3519aa1f3fc636f609c47dddb294/src/purl.ts).

Checked 2026-08-27 under the standing compatible-license authorization. Registry integrity and installed license checks belong in Phase 05 evidence.
