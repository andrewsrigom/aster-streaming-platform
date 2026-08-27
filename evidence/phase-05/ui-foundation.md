# Minimal UI foundation

Decision scope: P05-R11, within accepted Next.js/React boundaries. This records the selected first-slice strategy, not completed phase accessibility/performance acceptance.

Use shadcn/ui source ownership with Tailwind tokens. Inventory contains adapted Button (default/outline) and Dialog, backed only by Radix Dialog 1.1.23. The modal loads on profile interaction, not initial public rendering. Native semantic links, labels, form fields and landmarks remain native; no broad component gallery, icon package or animation framework was installed. Media controls remain Phase 07.

| Consideration | Decision/evidence |
|---|---|
| Current compatibility | Next 16.3.3, React 19.2.8, Tailwind 4.3.3 and Apollo integration 0.14.5 have actual production-build/browser evidence |
| Ownership/maintenance | Adapted shadcn source is maintained in apps/web/components/ui; unused Slot/polymorphism and variants are omitted |
| Keyboard and semantics | Public navigation, profile creation/selection, modal focus trap, Escape, focus restoration and reduced-motion behavior pass browser checks. Busy focus moves to Close to avoid a disabled prior target; fourteen axe scans and complementary focus/contrast checks are recorded in [boundary evidence](web-boundaries.md). Actual screen-reader review remains open |
| Styling | Shared CSS tokens, single accent, focus-visible rules and reduced-motion behavior; system font stack avoids an external build-time font download |
| License | Upstream MIT notice is preserved; Aster source remains MIT; cva is Apache-2.0, clsx and tailwind-merge are MIT |
| Bundle impact | Only current primitives/dependencies installed; [initial byte budgets/samples](artwork-performance.md) and [full emitted asset hashes](web-boundaries.jsonl) are recorded. The dialog remains lazy and test engines are absent from the runtime; timing stability remains open |
| Alternatives | A broad styled component framework adds unneeded inventory; bespoke dialog focus trapping is not selected; the individual Radix primitive keeps dependencies limited to the implemented modal |

Sources checked 2026-08-27: [shadcn Next.js installation](https://ui.shadcn.com/docs/installation/next), [actual Button source](https://ui.shadcn.com/r/styles/new-york-v4/button.json), [upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [Apollo's Next.js integration](https://github.com/apollographql/apollo-client-integrations/tree/main/packages/nextjs). Exact installed versions and peer compatibility also came from author-published package metadata and the frozen lockfile.
