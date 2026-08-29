"use client";

import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { PrivateProfile, type ReadyProfile } from "../engagement/private-profile";
import { HOME_PERSONALIZED, type HomeVariables } from "./operations";

const position = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function HomePersonalization({ locale }: Pick<HomeVariables, "locale">) {
  return (
    <section aria-labelledby="continue-watching-heading" className="space-y-5">
      <h2 id="continue-watching-heading" className="text-2xl font-semibold">
        Continue watching
      </h2>
      <PrivateProfile feature="continue watching">
        {(scope) => (
          <OwnedHomePersonalization key={scope.generation} locale={locale} scope={scope} />
        )}
      </PrivateProfile>
    </section>
  );
}

function OwnedHomePersonalization({
  locale,
  scope,
}: Pick<HomeVariables, "locale"> & { scope: ReadyProfile }) {
  const { data, loading, error, refetch } = useQuery(HOME_PERSONALIZED, {
    client: scope.runtime.client,
    variables: { profileId: scope.profileId, first: 10, locale },
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });
  const result = !loading && !error ? data?.homeContinueWatching : undefined;
  const entries = result?.code === "COMPLETED" ? result.connection?.edges : undefined;
  return (
    <div className="space-y-5" aria-busy={loading}>
      <p aria-live="polite" aria-atomic="true">
        {loading
          ? "Loading your progress…"
          : !entries
            ? "Continue watching is unavailable. Public discovery remains available."
            : entries.length === 0
              ? "No titles in progress."
              : `${entries.length} titles ready to resume.`}
      </p>
      {entries?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(({ node }) => (
            <li
              key={node.titleId}
              className="space-y-2 rounded-xl border border-border bg-card p-5"
            >
              {node.title ? (
                <Link
                  prefetch={false}
                  className="text-lg font-semibold underline underline-offset-4"
                  href={`/watch/${node.titleId}?locale=${locale}`}
                >
                  {node.title.localized.title}
                </Link>
              ) : (
                <p>Title no longer available. Your progress is retained.</p>
              )}
              <p className="text-sm text-muted-foreground">
                {position(node.positionMs)} / {position(node.durationMs)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !entries ? (
        <button
          type="button"
          className="min-h-11 rounded-md border border-input px-4"
          onClick={() => {
            void refetch().catch(() => undefined);
          }}
        >
          Retry progress
        </button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Private progress loads only after this browser confirms the selected profile.
      </p>
    </div>
  );
}
