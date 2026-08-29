"use client";

import Link from "next/link";
import { SEARCH_TITLES, type SearchVariables } from "./operations";
import { usePublicQuery } from "../catalog/use-public-query";
import { DiscoveryFeedback } from "./query-feedback";

function SearchForm({ variables }: { variables: SearchVariables | null }) {
  return (
    <form action="/search" method="get" className="flex max-w-2xl flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="search-query">
        Search published titles
      </label>
      <input
        id="search-query"
        name="q"
        type="search"
        required
        maxLength={160}
        defaultValue={variables?.query ?? ""}
        placeholder="Title or genre"
        className="min-h-11 flex-1 rounded-md border border-input bg-background px-4"
      />
      <input type="hidden" name="locale" value={variables?.locale ?? "en"} />
      <button
        type="submit"
        className="min-h-11 rounded-md bg-primary px-6 font-medium text-primary-foreground"
      >
        Search
      </button>
    </form>
  );
}

export function SearchPrompt() {
  return (
    <div className="space-y-8">
      <SearchForm variables={null} />
      <p className="text-muted-foreground">Enter a title, creator, genre or supported metadata.</p>
    </div>
  );
}

export function SearchResults({ variables }: { variables: SearchVariables }) {
  const { data, pending, refresh } = usePublicQuery(SEARCH_TITLES, variables);
  const result = data?.searchTitles;
  const available = result?.code === "COMPLETED";
  const explicitResult =
    available ||
    result?.code === "CURSOR_EXPIRED" ||
    result?.code === "STALE" ||
    result?.code === "INVALID_INPUT";
  const connection = available ? result.connection : null;
  const startHref = `/search?q=${encodeURIComponent(variables.query)}&locale=${variables.locale}`;
  return (
    <div className="space-y-8">
      <SearchForm variables={variables} />
      {connection ? (
        connection.edges.length === 0 ? (
          <p>No published titles match this search.</p>
        ) : (
          <ul className="space-y-4">
            {connection.edges.map((edge) =>
              edge.node ? (
                <li key={edge.cursor} className="rounded-xl border border-border bg-card p-5">
                  <Link
                    prefetch={false}
                    className="text-lg font-semibold underline underline-offset-4"
                    href={`/title/${edge.node.id}?locale=${variables.locale}`}
                    lang={edge.node.localized.locale}
                  >
                    {edge.node.localized.title}
                  </Link>
                </li>
              ) : (
                <li key={edge.cursor} className="text-sm text-muted-foreground">
                  A matching title is no longer in the current Catalog.
                </li>
              ),
            )}
          </ul>
        )
      ) : result?.code === "CURSOR_EXPIRED" ? (
        <p role="alert">
          <span>Search results changed. </span>
          <Link prefetch={false} className="underline underline-offset-4" href={startHref}>
            Start this search again.
          </Link>
        </p>
      ) : result?.code === "STALE" ? (
        <p role="alert">Search is stale and is not being presented as current.</p>
      ) : result?.code === "INVALID_INPUT" ? (
        <p role="alert">The search request was rejected. Check the query and start again.</p>
      ) : null}
      <DiscoveryFeedback
        available={explicitResult}
        pending={pending}
        refresh={refresh}
        reloadHref={`${startHref}${variables.after ? `&after=${encodeURIComponent(variables.after)}` : ""}`}
      />
      {connection?.pageInfo.hasNextPage && connection.pageInfo.endCursor ? (
        <Link
          prefetch={false}
          className="inline-block underline underline-offset-4"
          href={`${startHref}&after=${encodeURIComponent(connection.pageInfo.endCursor)}`}
        >
          Next results
        </Link>
      ) : null}
    </div>
  );
}
