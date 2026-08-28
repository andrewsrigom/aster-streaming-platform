import Link from "next/link";
import { PreloadQuery, readBrowseVariables } from "../../lib/apollo/server";
import { BROWSE } from "../../lib/apollo/operations";
import { AttributionList } from "../../features/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function Attribution({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const variables = readBrowseVariables(await searchParams);
  return (
    <article className="max-w-2xl space-y-6 py-16">
      <p className="eyebrow">OPEN DOES NOT MEAN OWNERLESS</p>
      <h1 className="text-5xl font-semibold tracking-tight">Credit where it belongs.</h1>
      <p className="text-lg leading-relaxed text-muted-foreground">
        Every published title carries its creator and license. Rights are reviewed before a title
        enters the collection. Generated demonstration content is labeled separately.
      </p>
      <p className="text-muted-foreground">
        See each title page for its attribution and license. Aster's application source is
        MIT-licensed; individual works retain their own terms.
      </p>
      <Link
        prefetch={false}
        className="inline-block text-primary underline underline-offset-4"
        href="/browse"
      >
        Explore the collection
      </Link>
      <PreloadQuery query={BROWSE} variables={variables} errorPolicy="all">
        <AttributionList variables={variables} />
      </PreloadQuery>
    </article>
  );
}
