import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { GraphqlProvider } from "../lib/apollo/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aster — Stories, openly shared.", template: "%s · Aster" },
  description:
    "An open collection of independent stories, with transparent rights and attribution.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="border-b border-border">
          <nav
            aria-label="Main navigation"
            className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-6"
          >
            <Link
              prefetch={false}
              className="flex items-center gap-2 text-2xl font-semibold tracking-tight"
              href="/"
              aria-label="Aster home"
            >
              <span className="text-primary" aria-hidden="true">
                ✳
              </span>{" "}
              aster
            </Link>
            <div className="flex gap-6 text-sm">
              <Link prefetch={false} href="/browse">
                Collection
              </Link>
              <Link prefetch={false} href="/attribution">
                Attribution
              </Link>
            </div>
          </nav>
        </header>
        <GraphqlProvider>
          <main id="main" tabIndex={-1} className="mx-auto min-h-[75vh] max-w-6xl px-6 pb-20">
            {children}
          </main>
        </GraphqlProvider>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
            <p>Stories belong in the open.</p>
            <p>Aster · Local browsing checkpoint</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
