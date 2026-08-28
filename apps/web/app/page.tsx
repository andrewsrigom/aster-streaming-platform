import { PreloadQuery, readBrowseVariables } from "../lib/apollo/server";
import { BROWSE } from "../lib/apollo/operations";
import { Catalog } from "../features/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const variables = readBrowseVariables(await searchParams);
  return (
    <>
      <section className="max-w-4xl py-16 sm:py-24">
        <p className="eyebrow">INDEPENDENT STORIES. OPEN POSSIBILITIES.</p>
        <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight sm:text-7xl">
          A little curiosity.
          <br />
          <span className="text-primary">A different perspective.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Discover a collection built around stories worth sharing — and the people who make them.
        </p>
      </section>
      <PreloadQuery query={BROWSE} variables={variables} errorPolicy="all">
        <Catalog variables={variables} />
      </PreloadQuery>
    </>
  );
}
