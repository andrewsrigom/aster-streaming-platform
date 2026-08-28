import type { PublicTitle } from "../../lib/apollo/operations.ts";

/** Presentation only; Catalog still decides current session eligibility. */
export function titleOffersPlayback(title: Pick<PublicTitle, "editorialLabels">): boolean {
  return !title.editorialLabels.includes("ui-seed-v1");
}

export function titleMetadata(
  title: Pick<PublicTitle, "releaseYear" | "runtimeSeconds" | "genres">,
): string {
  return [
    title.releaseYear === null ? "" : String(title.releaseYear),
    title.runtimeSeconds === null ? "" : String(title.runtimeSeconds) + " seconds",
    title.genres.join(" / "),
  ]
    .filter((value) => value !== "")
    .join(" · ");
}
