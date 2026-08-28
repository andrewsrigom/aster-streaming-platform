"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { Button } from "../../components/ui/button";
import { PrivateProfile, type ReadyProfile } from "./private-profile";
import { libraryOperations, type LibraryKind } from "./library-operations";
import { WatchlistAction } from "./watchlist-action";

const labels = {
  continue: "Continue watching",
  history: "Viewing history",
  watchlist: "Watchlist",
};
const position = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function Library() {
  return <PrivateProfile>{(scope) => <OwnedLibrary scope={scope} />}</PrivateProfile>;
}
function OwnedLibrary({ scope }: { scope: ReadyProfile }) {
  const [kind, setKind] = useState<LibraryKind>("continue");
  return (
    <div className="space-y-6">
      <nav aria-label="Library views" className="flex flex-wrap gap-3">
        {(Object.keys(labels) as LibraryKind[]).map((value) => (
          <Button
            key={value}
            variant="outline"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
            }}
          >
            {labels[value]}
          </Button>
        ))}
      </nav>
      <LibraryPage key={kind} kind={kind} scope={scope} />
    </div>
  );
}
function LibraryPage({ scope, kind }: { scope: ReadyProfile; kind: LibraryKind }) {
  const [after, setAfter] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const operation = libraryOperations[kind];
  const { data, loading, error, refetch } = useQuery(operation.document, {
    client: scope.runtime.client,
    variables: { profileId: scope.profileId, first: 20, after },
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });
  const page = !loading && !error ? data?.[operation.field]?.connection : undefined;
  useEffect(() => {
    if (!loading && restoreFocus.current) {
      restoreFocus.current = false;
      heading.current?.focus();
    }
  }, [loading]);
  const refresh = () => {
    restoreFocus.current = true;
    if (after !== null) {
      setAfter(null);
    } else {
      void refetch().catch(() => undefined);
    }
  };
  return (
    <section aria-label={labels[kind]} className="space-y-5" aria-busy={loading}>
      <h2 className="text-2xl font-semibold" tabIndex={-1} ref={heading}>
        {labels[kind]}
      </h2>
      <p aria-live="polite" aria-atomic="true">
        {loading
          ? "Loading your library…"
          : !page
            ? "Library unavailable. This does not mean your list is empty."
            : page.edges.length === 0
              ? "Nothing here yet."
              : `${page.edges.length} titles on this page.`}
      </p>
      {page ? (
        <ul className="space-y-4">
          {page.edges.map(({ node }) => (
            <li key={node.id} className="space-y-3 rounded-lg border border-border p-4">
              {node.title ? (
                <Link
                  prefetch={false}
                  className="text-lg underline"
                  href={`/title/${node.titleId}`}
                >
                  {node.title.localized.title}
                </Link>
              ) : (
                <p>Title no longer available. Your history is retained.</p>
              )}
              {node.status && node.positionMs !== undefined && node.durationMs !== undefined ? (
                <p className="text-sm">
                  {position(node.positionMs)} / {position(node.durationMs)} ·{" "}
                  {node.status === "COMPLETED"
                    ? "Completed"
                    : node.status === "IN_PROGRESS"
                      ? "In progress"
                      : "Not started"}
                </p>
              ) : null}
              {kind === "continue" && node.title ? (
                <Link
                  prefetch={false}
                  className="inline-block underline"
                  href={`/watch/${node.titleId}`}
                >
                  Resume title
                </Link>
              ) : null}
              {kind === "watchlist" ? (
                <WatchlistAction
                  scope={scope}
                  titleId={node.titleId}
                  present={false}
                  completed={refresh}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={loading} onClick={refresh}>
          {after ? "First page" : "Refresh list"}
        </Button>
        {page?.pageInfo.hasNextPage && page.pageInfo.endCursor ? (
          <Button
            variant="outline"
            onClick={() => {
              restoreFocus.current = true;
              setAfter(page.pageInfo.endCursor);
            }}
          >
            Next page
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Up to 20 titles per page. Lists reflect current availability; retired titles remain in
        history.
      </p>
    </section>
  );
}
