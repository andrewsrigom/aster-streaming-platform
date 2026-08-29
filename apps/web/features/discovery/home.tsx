"use client";

import Link from "next/link";
import { HOME_PUBLIC, type HomeRail, type HomeVariables } from "./operations";
import { usePublicQuery } from "../catalog/use-public-query";
import { DiscoveryFeedback } from "./query-feedback";
import { HomePersonalization } from "./personalized-home";

const labels = {
  FEATURED: "Featured",
  RECENTLY_ADDED: "Recently added",
  TRENDING: "Trending, curated",
  GENRE: "Genre",
} as const;

function Rail({
  rail,
  locale,
  fallback = false,
}: {
  rail: HomeRail;
  locale: string;
  fallback?: boolean;
}) {
  const visible = rail.edges.flatMap((edge) => (edge.node ? [edge.node] : []));
  const heading = rail.genre ? rail.genre.replaceAll("-", " ") : labels[rail.kind];
  return (
    <section aria-labelledby={`rail-${rail.key}`} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={`rail-${rail.key}`} className="text-2xl font-semibold capitalize">
          {heading}
        </h2>
        {fallback ? (
          <p className="text-xs text-muted-foreground">Fallback · recently added</p>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rail.edges.length === 0
            ? "No titles in this rail."
            : "These titles are no longer in the current collection."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((title) => (
            <li key={title.id}>
              <h3>
                <Link
                  prefetch={false}
                  href={`/title/${title.id}?locale=${locale}`}
                  lang={title.localized.locale}
                  className="block rounded-xl border border-border bg-card p-5 text-lg font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  {title.localized.title}
                </Link>
              </h3>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HomeDiscovery({ variables }: { variables: HomeVariables }) {
  const { data, pending, refresh } = usePublicQuery(HOME_PUBLIC, variables);
  const available =
    data?.homeRails.code === "COMPLETED" ||
    data?.homeRails.code === "PARTIAL" ||
    (data?.homeRails.code === "STALE" && data.homeRails.generation !== null);
  const payload = available ? data.homeRails : undefined;
  const fixed = payload
    ? [
        { key: "featured", result: payload.featured },
        { key: "recently-added", result: payload.recentlyAdded },
        { key: "trending", result: payload.trending },
      ]
    : [];
  return (
    <div className="space-y-14">
      <section aria-labelledby="home-discovery-heading" className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">DISCOVER</p>
            <h2 id="home-discovery-heading" className="text-3xl font-semibold">
              Stories for right now.
            </h2>
          </div>
          <Link prefetch={false} className="text-sm underline underline-offset-4" href="/search">
            Search the collection
          </Link>
        </div>
        {payload ? (
          <div className="space-y-10">
            {payload.code === "STALE" ? (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Discovery is refreshing. These rails are a recent bounded snapshot.
              </p>
            ) : null}
            {fixed.map(({ key, result }) =>
              result?.rail ? (
                <Rail
                  key={result.rail.key}
                  rail={result.rail}
                  locale={variables.locale}
                  fallback={result.code === "FALLBACK"}
                />
              ) : (
                <p key={key} className="text-sm text-muted-foreground">
                  One discovery rail is temporarily unavailable.
                </p>
              ),
            )}
            {payload.genres?.rails.map((rail) => (
              <Rail key={rail.key} rail={rail} locale={variables.locale} />
            ))}
            {payload.genres &&
            payload.genres.code !== "COMPLETED" &&
            payload.genres.code !== "EMPTY" ? (
              <p className="text-sm text-muted-foreground">
                Genre discovery is temporarily unavailable.
              </p>
            ) : null}
          </div>
        ) : null}
        <DiscoveryFeedback
          available={available}
          pending={pending}
          refresh={refresh}
          reloadHref={`/?locale=${variables.locale}`}
        />
        {!available ? (
          <Link
            prefetch={false}
            className="inline-block underline underline-offset-4"
            href="/browse"
          >
            Browse the current Catalog
          </Link>
        ) : null}
      </section>
      <HomePersonalization locale={variables.locale} />
    </div>
  );
}
