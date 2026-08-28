"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "../../components/ui/button";

const WatchlistPanel = dynamic(() => import("./watchlist-panel"), {
  ssr: false,
  loading: () => <p role="status">Preparing watchlist…</p>,
});
export function WatchlistLauncher({ titleId }: { titleId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Title watchlist" className="space-y-4 border-t border-border pt-6">
      <Button
        variant="outline"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? "Close watchlist controls" : "Manage watchlist"}
      </Button>
      {open ? <WatchlistPanel titleId={titleId} /> : null}
    </section>
  );
}
