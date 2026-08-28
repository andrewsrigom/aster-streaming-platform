"use client";

import { WatchlistLauncher } from "../engagement/watchlist-launcher";

import Link from "next/link";
import {
  BROWSE,
  TITLE_DETAIL,
  type BrowseVariables,
  type PublicTitle,
} from "../../lib/apollo/operations";
import { buttonVariants } from "../../components/ui/button";
import { usePublicQuery } from "./use-public-query";
import { QueryFeedback } from "./query-feedback";
import { CollectionArtwork } from "./collection-artwork";
import { titleMetadata, titleOffersPlayback } from "./metadata";

function pageQuery(variables: BrowseVariables): string {
  return `?locale=${variables.locale}${variables.after ? `&after=${encodeURIComponent(variables.after)}` : ""}`;
}

function AttributionDetails({ title }: { title: PublicTitle }) {
  const attribution = title.attribution;
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p>{attribution.attributionText}</p>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Creator</dt>
        <dd>{attribution.creator}</dd>
        <dt className="text-muted-foreground">Copyright holder</dt>
        <dd>{attribution.copyrightHolder}</dd>
        <dt className="text-muted-foreground">License</dt>
        <dd>
          <a
            className="text-primary underline underline-offset-4"
            href={attribution.licenseUrl}
            rel="noreferrer"
          >
            {attribution.licenseName} · {attribution.licenseVersion}
          </a>
        </dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd>
          <a
            className="text-primary underline underline-offset-4"
            href={attribution.sourceUrl}
            rel="noreferrer"
          >
            Canonical source and credits
          </a>
        </dd>
      </dl>
      <p className="text-muted-foreground">{attribution.modificationNotice}</p>
    </div>
  );
}

function PageLink({ variables, endCursor }: { variables: BrowseVariables; endCursor: string }) {
  return (
    <Link
      prefetch={false}
      className={buttonVariants({ variant: "outline" })}
      href={`?locale=${variables.locale}&after=${encodeURIComponent(endCursor)}`}
    >
      Next page <span aria-hidden="true">→</span>
    </Link>
  );
}

export function Catalog({ variables }: { variables: BrowseVariables }) {
  const { data, pending, refresh } = usePublicQuery(BROWSE, variables);
  return (
    <section aria-labelledby="catalog-heading" className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">THE COLLECTION</p>
          <h2 id="catalog-heading" className="text-3xl font-semibold">
            Find your next story.
          </h2>
        </div>
        <nav aria-label="Title language" className="flex gap-4 text-sm">
          <Link
            prefetch={false}
            href="?locale=en"
            aria-current={variables.locale === "en" ? "page" : undefined}
          >
            English
          </Link>
          <Link
            prefetch={false}
            href="?locale=pt-BR"
            aria-current={variables.locale === "pt-BR" ? "page" : undefined}
            lang="pt-BR"
          >
            Português
          </Link>
        </nav>
      </div>
      {!data ? null : data.titles.edges.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-8 py-16">
          <h3 className="text-xl font-semibold">The collection is quiet. For now.</h3>
          <p className="mt-3 max-w-xl text-muted-foreground">
            No titles are published in this local catalog. Only rights-reviewed, validated content
            appears here.
          </p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.titles.edges.map(({ node }) => (
            <li key={node.id}>
              <Link
                prefetch={false}
                href={`/title/${node.id}?locale=${variables.locale}`}
                className="group block overflow-hidden rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <div className="border-b border-border">
                  <CollectionArtwork />
                </div>
                <div className="space-y-3 p-6">
                  <p className="eyebrow">
                    {node.editorialLabels.includes("synthetic-fixture")
                      ? "GENERATED DEMO"
                      : "OPENLY LICENSED"}
                  </p>
                  <h3
                    lang={node.localized.locale}
                    className="text-xl font-semibold group-hover:text-primary"
                  >
                    {node.localized.title}
                  </h3>
                  <p
                    lang={node.localized.locale}
                    className="line-clamp-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    {node.localized.synopsis}
                  </p>
                  <p className="text-xs text-muted-foreground">{node.attribution.creator}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <QueryFeedback
        available={!!data}
        pending={pending}
        refresh={refresh}
        reloadHref={pageQuery(variables)}
      />
      {data?.titles.pageInfo.hasNextPage && data.titles.pageInfo.endCursor ? (
        <PageLink variables={variables} endCursor={data.titles.pageInfo.endCursor} />
      ) : null}
    </section>
  );
}

export function TitleDetail({ id, locale }: { id: string; locale: string }) {
  const { data, pending, refresh } = usePublicQuery(TITLE_DETAIL, { id, locale });
  if (!data) {
    return (
      <article className="max-w-3xl space-y-8 py-16">
        <h1 className="text-4xl font-semibold">Title unavailable</h1>
        <QueryFeedback
          available={false}
          pending={pending}
          refresh={refresh}
          reloadHref={`?locale=${locale}`}
        />
      </article>
    );
  }
  if (!data.title) {
    return (
      <section className="py-20">
        <p className="eyebrow">NOT AVAILABLE</p>
        <h1 className="text-4xl font-semibold">This title is not in the collection.</h1>
        <Link prefetch={false} className="mt-8 inline-block underline" href="/browse">
          Browse published titles
        </Link>
      </section>
    );
  }
  const title = data.title;
  const metadata = titleMetadata(title);
  return (
    <article className="max-w-3xl space-y-8 py-16">
      <p className="eyebrow">
        {title.editorialLabels.includes("synthetic-fixture")
          ? "GENERATED TECHNICAL DEMO"
          : "THE COLLECTION / TITLE"}
      </p>
      <h1
        lang={title.localized.locale}
        className="text-5xl font-semibold tracking-tight sm:text-7xl"
      >
        {title.localized.title}
      </h1>
      {metadata ? <p className="text-sm text-muted-foreground">{metadata}</p> : null}
      <figure className="space-y-3">
        <div className="overflow-hidden rounded-xl">
          <CollectionArtwork detail />
        </div>
        <figcaption className="text-xs leading-relaxed text-muted-foreground">
          Generic Aster illustration, not film artwork. Created by Aster contributors under{" "}
          <a
            href="https://github.com/andrewsrigom/aster-streaming-platform/blob/main/LICENSE"
            className="underline underline-offset-4"
            rel="noreferrer"
          >
            MIT
          </a>
          .
        </figcaption>
      </figure>
      <p lang={title.localized.locale} className="text-lg leading-relaxed text-muted-foreground">
        {title.localized.synopsis}
      </p>
      <section className="border-t border-border pt-8" aria-labelledby="attribution-heading">
        <h2 id="attribution-heading" className="mb-4 text-xl font-semibold">
          Attribution and rights
        </h2>
        <AttributionDetails title={title} />
      </section>
      {titleOffersPlayback(title) ? (
        <Link
          prefetch={false}
          className={buttonVariants()}
          href={`/watch/${title.id}?locale=${locale}`}
        >
          Watch title <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <p>This browsing sample has no playable video.</p>
      )}
      <WatchlistLauncher titleId={title.id} />
      <QueryFeedback
        available
        pending={pending}
        refresh={refresh}
        reloadHref={`?locale=${locale}`}
      />
    </article>
  );
}

export function AttributionList({ variables }: { variables: BrowseVariables }) {
  const { data, pending, refresh } = usePublicQuery(BROWSE, variables);
  return (
    <section aria-label="Published title attribution" className="space-y-10">
      {!data ? null : data.titles.edges.length === 0 ? (
        <p>No published titles require attribution yet.</p>
      ) : (
        data.titles.edges.map(({ node }) => (
          <article key={node.id} className="space-y-4 border-t border-border pt-8">
            <h2 className="text-2xl font-semibold">
              <Link
                prefetch={false}
                href={`/title/${node.id}?locale=${variables.locale}`}
                lang={node.localized.locale}
              >
                {node.localized.title}
              </Link>
            </h2>
            <AttributionDetails title={node} />
          </article>
        ))
      )}
      <QueryFeedback
        available={!!data}
        pending={pending}
        refresh={refresh}
        reloadHref={pageQuery(variables)}
      />
      {data?.titles.pageInfo.hasNextPage && data.titles.pageInfo.endCursor ? (
        <PageLink variables={variables} endCursor={data.titles.pageInfo.endCursor} />
      ) : null}
    </section>
  );
}
