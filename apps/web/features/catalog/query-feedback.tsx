"use client";

import { Button } from "../../components/ui/button";

export function QueryFeedback({
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
      {!available && (
        <p role="alert" className="rounded-lg border border-border bg-card p-6">
          The collection is temporarily unavailable. No current details could be confirmed. You can
          try again or reload this page.
        </p>
      )}
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {pending
          ? available
            ? "Refreshing collection. Previously loaded details may be stale."
            : "Checking the collection again."
          : ""}
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <Button variant="outline" disabled={pending} onClick={refresh}>
          {pending ? "Checking…" : available ? "Refresh collection" : "Try again"}
        </Button>
        {!available && (
          <a href={reloadHref} className="text-sm underline underline-offset-4">
            Reload page
          </a>
        )}
      </div>
    </div>
  );
}
