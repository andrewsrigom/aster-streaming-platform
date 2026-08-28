"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { Button } from "../../components/ui/button";
import { PrivateProfile, type ReadyProfile } from "./private-profile";
import { WATCHLIST_MEMBERSHIP } from "./library-operations";
import { WatchlistAction } from "./watchlist-action";

export default function WatchlistPanel({ titleId }: { titleId: string }) {
  return (
    <PrivateProfile>{(scope) => <Membership scope={scope} titleId={titleId} />}</PrivateProfile>
  );
}
function Membership({ scope, titleId }: { scope: ReadyProfile; titleId: string }) {
  const status = useRef<HTMLParagraphElement>(null);
  const restoreFocus = useRef(false);
  const { data, loading, error, refetch } = useQuery(WATCHLIST_MEMBERSHIP, {
    client: scope.runtime.client,
    variables: { profileId: scope.profileId, titleId },
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });
  useEffect(() => {
    if (!loading && restoreFocus.current) {
      restoreFocus.current = false;
      status.current?.focus();
    }
  }, [loading]);
  const refresh = () => {
    restoreFocus.current = true;
    void refetch().catch(() => undefined);
  };
  return (
    <div className="space-y-3">
      <p ref={status} tabIndex={-1} aria-live="polite" aria-atomic="true">
        {loading
          ? "Checking watchlist…"
          : error || !data
            ? "Watchlist unavailable. No change confirmed."
            : data.profile.inWatchlist
              ? "This title is in your watchlist."
              : "This title is not in your watchlist."}
      </p>
      {!loading && !error && data ? (
        <WatchlistAction
          key={String(data.profile.inWatchlist)}
          scope={scope}
          titleId={titleId}
          present={!data.profile.inWatchlist}
          completed={refresh}
        />
      ) : null}
      {!loading ? (
        <Button variant="outline" onClick={refresh}>
          Refresh membership
        </Button>
      ) : null}
    </div>
  );
}
