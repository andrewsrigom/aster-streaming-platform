import Link from "next/link";
import { buttonVariants } from "../components/ui/button";

export default function NotFound() {
  return (
    <section className="space-y-6 py-20">
      <p className="eyebrow">404 / OFF THE MAP</p>
      <h1 className="text-4xl font-semibold">This story isn't here.</h1>
      <p className="text-muted-foreground">Return to the collection to find a published title.</p>
      <Link href="/browse" className={buttonVariants()}>
        Browse the collection
      </Link>
    </section>
  );
}
