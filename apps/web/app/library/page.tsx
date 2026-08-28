import type { Metadata } from "next";
import { Library } from "../../features/engagement/library";

export const metadata: Metadata = { title: "Your library" };
export default function LibraryPage() {
  return (
    <section className="space-y-7 py-16">
      <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
      <h1 className="text-4xl font-semibold">Your library</h1>
      <p className="text-muted-foreground">
        Continue watching, review your history and manage your watchlist for the selected profile.
      </p>
      <Library />
      <noscript>
        Private library controls require JavaScript. Public browsing remains available.
      </noscript>
    </section>
  );
}
