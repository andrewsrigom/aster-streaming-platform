"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { TITLE_DETAIL } from "../../lib/apollo/operations";
import { usePublicQuery } from "../catalog/use-public-query";
import { QueryFeedback } from "../catalog/query-feedback";

const Player = dynamic(() => import("./player"), {
  ssr: false,
  loading: () => <p role="status">Loading player controls…</p>,
});

export function Watch({ id, locale }: { id: string; locale: string }) {
  const { data, pending, refresh } = usePublicQuery(TITLE_DETAIL, { id, locale });
  const title = data?.title;
  return (
    <article className="space-y-8 py-10">
      <Link
        prefetch={false}
        href={`/title/${id}?locale=${locale}`}
        className="text-sm underline underline-offset-4"
      >
        ← Title and full attribution
      </Link>
      <header className="space-y-3">
        <p className="eyebrow">THE COLLECTION / WATCH</p>
        <h1
          lang={title?.localized.locale}
          className="text-3xl font-semibold tracking-tight sm:text-5xl"
        >
          {title?.localized.title ?? "Title unavailable"}
        </h1>
      </header>
      {title ? (
        <>
          <Player key={title.id} titleId={title.id} />
          <section
            aria-label="Video attribution"
            className="space-y-3 border-t border-border pt-6 text-sm text-muted-foreground"
          >
            <p>{title.attribution.attributionText}</p>
            <p>{title.attribution.modificationNotice}</p>
            <p>
              <a href={title.attribution.licenseUrl} rel="noreferrer" className="underline">
                {title.attribution.licenseName} {title.attribution.licenseVersion}
              </a>{" "}
              ·{" "}
              <a href={title.attribution.sourceUrl} rel="noreferrer" className="underline">
                Source and credits
              </a>
            </p>
          </section>
        </>
      ) : null}
      <QueryFeedback
        available={!!data}
        pending={pending}
        refresh={refresh}
        reloadHref={`?locale=${locale}`}
      />
    </article>
  );
}
