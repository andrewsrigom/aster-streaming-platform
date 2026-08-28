import type { PublicTitle } from "../../lib/apollo/operations.ts";

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
