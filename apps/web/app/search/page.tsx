import { PreloadQuery, readSearchVariables } from "../../lib/apollo/server";
import { SEARCH_TITLES } from "../../features/discovery/operations";
import { SearchPrompt, SearchResults } from "../../features/discovery/search";

export const dynamic = "force-dynamic";

export default async function Search({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const variables = readSearchVariables(await searchParams);
  return (
    <section className="space-y-8 py-16" aria-labelledby="search-heading">
      <div>
        <p className="eyebrow">DISCOVER</p>
        <h1 id="search-heading" className="text-4xl font-semibold">
          Search the collection
        </h1>
      </div>
      {variables ? (
        <PreloadQuery query={SEARCH_TITLES} variables={variables} errorPolicy="all">
          <SearchResults variables={variables} />
        </PreloadQuery>
      ) : (
        <SearchPrompt />
      )}
    </section>
  );
}
