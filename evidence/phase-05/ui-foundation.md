# Minimal UI foundation

Decision scope: P05-R11, within accepted Next.js/React boundaries. The selected strategy has keyboard, actual-reader and laboratory evidence; complete product accessibility remains Phase 14.

Use shadcn/ui source ownership with Tailwind tokens. Inventory contains adapted Button (default/outline) and Dialog, backed only by Radix Dialog 1.1.23. The modal loads on profile interaction, not initial public rendering. Native semantic links, labels, form fields and landmarks remain native; no broad component gallery, icon package or animation framework was installed. Media controls remain Phase 07.

PR 22 remediation uses explicit center/between Button alignment variants and additive CVA classes. This removes the sole need for runtime Tailwind conflict resolution and the unused merge helper/dependency, without replacing Radix or the source-owned shadcn strategy. New variants must avoid contradictory classes; arbitrary class-override resolution is not part of this internal primitive contract. The final candidate must confirm unchanged computed layout and the affected browser/performance budgets.

| Consideration | Decision/evidence |
|---|---|
| Current compatibility | Next 16.3.3, React 19.2.8, Tailwind 4.3.3 and Apollo integration 0.14.5 have actual production-build/browser evidence |
| Ownership/maintenance | Adapted shadcn source is maintained in apps/web/components/ui; unused Slot/polymorphism and variants are omitted |
| Keyboard and semantics | Public navigation, profile creation/selection, modal focus trap, Escape, focus restoration and reduced-motion behavior pass browser checks. Busy focus moves to Close; [actual reader evidence](reader-review.md) confirms explicit polite announcements and control states. Fourteen axe scans and complementary focus/contrast checks remain distinct from speech evidence |
| Styling | Shared CSS tokens, single accent, focus-visible rules and reduced-motion behavior; system font stack avoids an external build-time font download |
| License | Upstream MIT notice is preserved; Aster source remains MIT; cva is Apache-2.0 and its clsx dependency is MIT |
| Bundle impact | Only current primitives/dependencies installed; [final byte/timing samples](performance-live-regions.json) pass the existing budgets. The dialog remains lazy and test engines are absent from the runtime. Earlier misses and the quiet-host scope remain recorded in [laboratory evidence](artwork-performance.md) |
| Alternatives | A broad styled component framework adds unneeded inventory; bespoke dialog focus trapping is not selected; the individual Radix primitive keeps dependencies limited to the implemented modal |

Sources checked 2026-08-27: [shadcn Next.js installation](https://ui.shadcn.com/docs/installation/next), [actual Button source](https://ui.shadcn.com/r/styles/new-york-v4/button.json), [upstream license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [Apollo's Next.js integration](https://github.com/apollographql/apollo-client-integrations/tree/main/packages/nextjs). Exact installed versions and peer compatibility also came from author-published package metadata and the frozen lockfile.
