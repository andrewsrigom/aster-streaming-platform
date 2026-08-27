import { notFound } from "next/navigation";
import { PreloadQuery, readBrowseVariables } from "../../../lib/apollo/server";
import { TITLE_DETAIL, titleIdentifier } from "../../../lib/apollo/operations";
import { TitleDetail } from "../../../features/catalog/catalog";

export const dynamic = "force-dynamic";

export default async function Title({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { locale } = readBrowseVariables(await searchParams);
  if (!titleIdentifier(id)) {
    notFound();
  }
  return (
    <PreloadQuery query={TITLE_DETAIL} variables={{ id, locale }} errorPolicy="all">
      <TitleDetail id={id} locale={locale} />
    </PreloadQuery>
  );
}
