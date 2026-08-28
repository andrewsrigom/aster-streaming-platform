"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import type { ReadyProfile } from "./private-profile";
import { SET_WATCHLIST } from "./library-operations";
import { createWatchlistIntent, type WatchlistIntentState } from "./watchlist-intent";

export function WatchlistAction({
  scope,
  titleId,
  present,
  completed,
}: {
  scope: ReadyProfile;
  titleId: string;
  present: boolean;
  completed: () => void;
}) {
  const [state, setState] = useState<WatchlistIntentState>({ status: "idle", canRetry: false });
  const intent = useRef<ReturnType<typeof createWatchlistIntent> | null>(null);
  const completion = useRef(completed);
  completion.current = completed;
  useEffect(() => {
    const operation = createWatchlistIntent({
      profileId: scope.profileId,
      titleId,
      present,
      onState: setState,
      onCompleted: () => {
        completion.current();
      },
      async send(input, signal) {
        const result = await scope.runtime.client.mutate({
          mutation: SET_WATCHLIST,
          variables: { input },
          context: { fetchOptions: { signal } },
        });
        if (!result.data?.setWatchlist) {
          throw new Error("Missing watchlist acknowledgement.");
        }
        return result.data.setWatchlist;
      },
    });
    intent.current = operation;
    return () => {
      operation.dispose();
      intent.current = null;
    };
  }, [scope.profileId, scope.runtime, titleId, present]);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={state.status !== "idle" && !state.canRetry}
        onClick={() => {
          void intent.current?.submit();
        }}
      >
        {state.status === "saving"
          ? "Saving watchlist…"
          : state.canRetry
            ? "Retry the same change"
            : present
              ? "Add to watchlist"
              : "Remove from watchlist"}
      </Button>
      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {state.status === "saved"
          ? "Watchlist change saved. Refreshing current membership…"
          : state.status === "unconfirmed"
            ? "Change not confirmed. Retry the same change or recheck the profile."
            : state.status === "rejected"
              ? "Change was not accepted. Recheck the profile before trying again."
              : ""}
      </p>
    </div>
  );
}
