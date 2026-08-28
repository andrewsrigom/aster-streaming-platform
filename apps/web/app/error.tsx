"use client";

import { Button } from "../components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className="max-w-xl space-y-6 py-20">
      <p className="eyebrow">A PAUSE IN THE STORY</p>
      <h1 className="text-4xl font-semibold">The collection is unavailable.</h1>
      <p className="leading-relaxed text-muted-foreground">
        Your connection or the local API may be unavailable. You can try again.
      </p>
      <Button onClick={reset}>Try again</Button>
      <p>
        <a href="/browse" className="underline underline-offset-4">
          Reload collection
        </a>
      </p>
    </section>
  );
}
