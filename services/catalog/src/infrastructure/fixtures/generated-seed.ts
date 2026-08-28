import { createHash } from "node:crypto";
import {
  UI_SEED_ACTOR_ID,
  UI_SEED_TITLE_ID,
  UI_SEED_PUBLICATION_ID,
  UI_SEED_REPORT_ID,
  UI_SEED_MANIFEST,
  uiSeedMetadata,
  uiSeedRights,
  validateUiSeedReport,
} from "./generated-ui-fixture.js";

export type GeneratedSeedMode = "evidence" | "playable";
export type GeneratedFile = Readonly<{ name: string; bytes: number; sha256: string }>;

export function generatedSeed(report: unknown, mode: GeneratedSeedMode = "evidence") {
  const checksum = validateUiSeedReport(report, mode);
  const files = (report as { files: GeneratedFile[] }).files
    .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const playable = mode === "playable";
  const metadata = uiSeedMetadata();
  const rights = uiSeedRights(checksum);
  const identity = createHash("sha256")
    .update(JSON.stringify({ recipe: "aster-generated-hls-v1", files }))
    .digest("hex");
  const prefix = "publications/" + identity + "/";
  return {
    mode,
    checksum,
    files,
    prefix,
    titleId: playable ? "00000000-0000-4000-8000-000007000001" : UI_SEED_TITLE_ID,
    publicationId: playable ? "00000000-0000-4000-8000-000007000002" : UI_SEED_PUBLICATION_ID,
    reportId: playable ? "00000000-0000-4000-8000-000007000003" : UI_SEED_REPORT_ID,
    actorId: playable ? "00000000-0000-4000-8000-000007000004" : UI_SEED_ACTOR_ID,
    mutationPrefix: playable
      ? "00000000-0000-4000-8000-00000700001"
      : "00000000-0000-4000-8000-00000500001",
    manifest: playable
      ? "http://127.0.0.1:9001/aster-media-published/" + prefix + "master.m3u8"
      : UI_SEED_MANIFEST,
    metadata: playable
      ? {
          ...metadata,
          editorialLabels: ["playable-seed-v1", "synthetic-fixture"],
          localizations: [
            {
              locale: "en",
              title: "Signal / 02",
              synopsis:
                "Six seconds of generated color, motion and sound with English captions. Playable technical demo, not a film.",
            },
            {
              locale: "pt-BR",
              title: "Sinal / 02",
              synopsis:
                "Seis segundos de cor, movimento e som gerados, com legendas em inglês. Demo técnica reproduzível, não um filme.",
            },
          ],
        }
      : metadata,
    rights: playable
      ? {
          ...rights,
          workTitle: "Signal / 02 — generated playable fixture",
        }
      : rights,
  };
}
