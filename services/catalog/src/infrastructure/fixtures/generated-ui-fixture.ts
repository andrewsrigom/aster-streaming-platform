import { catalogChecksum, catalogRecord } from "../../domain/values.js";
import { normalizeTitleMetadata, type TitleMetadata } from "../../domain/metadata.js";

export const UI_SEED_TITLE_ID = "00000000-0000-4000-8000-000005000001";
export const UI_SEED_PUBLICATION_ID = "00000000-0000-4000-8000-000005000002";
export const UI_SEED_REPORT_ID = "00000000-0000-4000-8000-000005000003";
export const UI_SEED_ACTOR_ID = "00000000-0000-4000-8000-000005000004";
export const UI_SEED_MANIFEST = "https://fixture.invalid/aster-generated-hls-v1/master.m3u8";
const source =
  "https://github.com/andrewsrigom/aster-streaming-platform/blob/b6c99c432603218d0a33c833e0b9a28b1c90e43b/";

export function uiSeedMetadata(): TitleMetadata {
  const metadata = normalizeTitleMetadata({
    defaultLocale: "en",
    releaseYear: 2026,
    runtimeSeconds: 6,
    languages: ["en"],
    accessibility: ["CAPTIONS"],
    editorialLabels: ["synthetic-fixture", "ui-seed-v1"],
    localizations: [
      {
        locale: "en",
        title: "Signal / 01",
        synopsis:
          "Six seconds of generated color, motion and sound. A technical fixture for exploring Aster, not a film. Playback arrives in a later checkpoint.",
      },
      {
        locale: "pt-BR",
        title: "Sinal / 01",
        synopsis:
          "Seis segundos de cor, movimento e som gerados. Um conteúdo técnico para explorar o Aster, não um filme. A reprodução chega em uma etapa posterior.",
      },
    ],
    genres: ["experimental"],
    credits: [{ name: "Aster contributors", role: "generated fixture" }],
    artwork: null,
  });
  if (!metadata) {
    throw new Error("Invalid source-owned UI seed metadata.");
  }
  return metadata;
}

export function uiSeedRights(sourceChecksum: string) {
  return {
    workTitle: "Signal / 01 — generated technical fixture",
    creator: "Aster contributors",
    copyrightHolder: "Aster contributors",
    canonicalSourceUrl: source + "tools/media/generate-hls.mjs",
    assetSourceUrl: "https://fixture.invalid/aster-generated-hls-v1/source.mkv",
    licenseName: "MIT",
    licenseVersion: "unversioned",
    licenseUrl: source + "LICENSE",
    attributionText: "Aster contributors — generated local technical fixture. MIT source recipe.",
    modificationNotice: "Generated test signals and project-authored captions; no acquired film.",
    thirdPartyMaterialNotes: "No acquired film or music. FFmpeg runs as a separate local tool.",
    trademarkNotes: "No third-party marks in the generated signals.",
    redistributionAllowed: true,
    commercialUseAllowed: true,
    modificationAllowed: true,
    shareAlikeRequired: false,
    technicalRestrictions: "NONE",
    sourceChecksum,
    validUntil: null,
    evidenceLocations: [source + "docs/adr/0016-isolated-generated-media-fixture.md"],
  };
}

export function validateUiSeedReport(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid generated media report.");
  }
  const report = value as Record<string, unknown>;
  if (
    report["event"] !== "generated_hls_verified" ||
    report["recipe"] !== "aster-generated-hls-v1" ||
    report["repeatable"] !== true ||
    report["independentSegments"] !== true ||
    report["durationSeconds"] !== 6 ||
    report["width"] !== 320 ||
    report["height"] !== 180 ||
    report["fps"] !== 24 ||
    report["captionLanguage"] !== "en" ||
    !catalogChecksum(report["sourceChecksum"]) ||
    typeof report["image"] !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(report["image"]) ||
    !Array.isArray(report["files"]) ||
    report["files"].length !== 8
  ) {
    throw new Error("Unverified generated media report.");
  }
  const names = new Set([
    "source.mkv",
    "master.m3u8",
    "video.m3u8",
    "captions.m3u8",
    "captions.vtt",
    "segment-000.ts",
    "segment-001.ts",
    "segment-002.ts",
  ]);
  let total = 0;
  for (const value of report["files"] as unknown[]) {
    const file = catalogRecord(value, ["name", "bytes", "sha256"]);
    if (
      !file ||
      typeof file["name"] !== "string" ||
      !names.delete(file["name"]) ||
      typeof file["bytes"] !== "number" ||
      !Number.isSafeInteger(file["bytes"]) ||
      file["bytes"] <= 0 ||
      file["bytes"] > 4 * 1024 * 1024 ||
      !catalogChecksum(file["sha256"]) ||
      (file["name"] === "source.mkv" && file["sha256"] !== report["sourceChecksum"])
    ) {
      throw new Error("Invalid generated media file inventory.");
    }
    total += file["bytes"];
  }
  if (names.size !== 0 || total > 8 * 1024 * 1024 || total !== report["totalBytes"]) {
    throw new Error("Invalid generated media size.");
  }
  return report["sourceChecksum"];
}
