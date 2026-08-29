"use client";

import { Button } from "../../components/ui/button";

export function DiscoveryFeedback({
  available,
  pending,
  refresh,
  reloadHref,
}: {
  available: boolean;
  pending: boolean;
  refresh: () => void;
  reloadHref: string;
}) {
  return (
    <div className="space-y-4">
      {!available ? (
        <p role="alert" className="rounded-lg border border-border bg-card p-6">
          Discovery is temporarily unavailable. The collection, title details and playback remain
          available.
        </p>
      ) : null}
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {pending
          ? available
            ? "Refreshing discovery. Previously loaded results may be stale."
            : "Checking discovery again."
          : ""}
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <Button variant="outline" disabled={pending} onClick={refresh}>
          {pending ? "Checking…" : available ? "Refresh discovery" : "Try again"}
        </Button>
        {!available ? (
          <a href={reloadHref} className="text-sm underline underline-offset-4">
            Reload page
          </a>
        ) : null}
      </div>
    </div>
  );
}
