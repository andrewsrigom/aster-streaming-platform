# Minimal UI foundation

Decision scope: P05-R11, within accepted Next.js/React boundaries. This records the selected first-slice strategy, not completed phase accessibility/performance acceptance.

Use shadcn/ui source ownership with Tailwind tokens. Inventory currently contains one adapted Button, with default/outline variants, used for recovery and navigation styling. Native semantic links and landmarks remain native; no broad component gallery, icon package or animation framework was installed. Dialog primitives will be added only with the profile flow. Media controls remain Phase 07.

| Consideration | Decision/evidence |
|---|---|
| Current compatibility | Next 16.3.3, React 19.2.8, Tailwind 4.3.3 and Apollo integration 0.14.5 have actual production-build/browser evidence |
| Ownership/maintenance | Adapted shadcn source is maintained in apps/web/components/ui; unused Slot/polymorphism and variants are omitted |
| Keyboard and semantics | Public links, skip link and title/attribution navigation pass real keyboard tests; Button recovery, dialog focus and screen-reader review remain open |
| Styling | Shared CSS tokens, single accent, focus-visible rules and reduced-motion behavior; system font stack avoids an external build-time font download |
| License | Upstream MIT notice is preserved; Aster source remains MIT; cva is Apache-2.0, clsx and tailwind-merge are MIT |
| Bundle impact | Only current primitives/dependencies installed; quantitative initial-JS and image budgets remain Phase 05 acceptance work |
| Alternatives | A broad styled component framework adds unneeded inventory; bespoke dialog focus management is not selected; Radix-backed shadcn dialogs remain the preferred next component |

Sources checked 2026-08-27: [shadcn Next.js installation](https://ui.shadcn.com/docs/installation/next), [actual Button source](https://ui.shadcn.com/r/styles/new-york-v4/button.json), [upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [Apollo's Next.js integration](https://github.com/apollographql/apollo-client-integrations/tree/main/packages/nextjs). Exact installed versions and peer compatibility also came from author-published package metadata and the frozen lockfile.
