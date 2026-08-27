import { PreloadQuery } from "../../lib/apollo/server";
import { BROWSE, browseVariables } from "../../lib/apollo/operations";
import { Catalog } from "../../features/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function Browse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const variables = browseVariables(await searchParams);
  return (
    <div className="pt-16">
      <h1 className="sr-only">Browse the Aster collection</h1>
      <PreloadQuery query={BROWSE} variables={variables}>
        <Catalog variables={variables} />
      </PreloadQuery>
    </div>
  );
}
