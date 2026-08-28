import { createHash } from "node:crypto";
import type { TitleMetadata } from "../../domain/metadata.js";
import type { RightsRecord } from "../../domain/rights.js";
import { catalogChecksum } from "../../domain/values.js";
import { parseCandidateReport } from "./retain-candidate.js";
import { ARTWORK_RECIPE_VERSION } from "../../domain/media-processing.js";
import { MediaProcessingError } from "./processing-error.js";

const publicationBase = "http://127.0.0.1:9001/aster-media-published/";
export const mediaSha256 = (bytes: string | Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
const invalid = (): never => {
  throw new MediaProcessingError("INVALID_OUTPUT", "Invalid publication bundle");
};

function attributionFacts(rights: RightsRecord, artwork: boolean) {
  const fields = [
    "workTitle",
    "creator",
    "copyrightHolder",
    "canonicalSourceUrl",
    "licenseName",
    "licenseVersion",
    "licenseUrl",
    "attributionText",
    "modificationNotice",
    "thirdPartyMaterialNotes",
    "trademarkNotes",
    "redistributionAllowed",
    "commercialUseAllowed",
    "modificationAllowed",
    "shareAlikeRequired",
    "technicalRestrictions",
    "sourceChecksum",
    ...(artwork ? [] : ["assetSourceUrl"]),
  ] as const;
  const entries = fields.map((field) => [field, rights[field as keyof RightsRecord]] as const);
  if (entries.some(([, value]) => value === null) || !catalogChecksum(rights.sourceChecksum)) {
    return invalid();
  }
  return Object.fromEntries(entries);
}

// Review-generated identities and final derived URLs are excluded: editorial review must not create a hash cycle.
export function createPublicationBundle(
  identity: Readonly<{ sha256: string; bytes: number; container: "zip" | "mp4" }>,
  hlsBytes: Buffer,
  artworkBytes: Buffer,
  rights: RightsRecord,
  metadata: TitleMetadata,
) {
  const hls = parseCandidateReport(hlsBytes, identity);
  const artwork = parseCandidateReport(artworkBytes, identity, ARTWORK_RECIPE_VERSION);
  const raw = JSON.parse(hlsBytes.toString("utf8")) as Record<string, unknown>;
  const artRaw = JSON.parse(artworkBytes.toString("utf8")) as Record<string, unknown>;
  const probe = raw["probe"] as Record<string, unknown> | undefined;
  const artProbe = artRaw["probe"] as Record<string, unknown> | undefined;
  const duration = probe?.["duration"];
  if (
    !metadata.artwork ||
    rights.sourceChecksum !== identity.sha256 ||
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 1 ||
    duration > 3600 ||
    metadata.runtimeSeconds !== Math.ceil(duration) ||
    metadata.accessibility.length !== 0 ||
    !["width", "height", "duration"].every((field) => probe?.[field] === artProbe?.[field])
  ) {
    return invalid();
  }
  const poster = artwork.files.find(
    (file) =>
      file.name.startsWith("poster-") && file.sha256 === metadata.artwork?.rights.sourceChecksum,
  );
  if (!poster || metadata.artwork.rights.titleId !== rights.titleId) {
    return invalid();
  }
  const content = {
    schemaVersion: 1,
    recipe: "publication-v1",
    titleId: rights.titleId,
    sourceChecksum: identity.sha256,
    hlsReportChecksum: mediaSha256(hlsBytes),
    artworkReportChecksum: mediaSha256(artworkBytes),
    attribution: {
      film: attributionFacts(rights, false),
      artwork: attributionFacts(metadata.artwork.rights, true),
    },
  };
  const bundleHash = mediaSha256(JSON.stringify(content));
  const prefix = "publications/" + bundleHash + "/";
  const attribution = Buffer.from(JSON.stringify({ ...content, bundleHash }) + "\n");
  return {
    bundleHash,
    prefix,
    attribution,
    duration,
    poster,
    sourceChecksum: identity.sha256,
    manifestUrl: publicationBase + prefix + "master.m3u8",
    artworkUrl: publicationBase + prefix + poster.name,
    hls: {
      ...hls,
      prefix: "candidates/" + hls.processingKey + "/" + hls.manifestHash + "/",
      reportChecksum: content.hlsReportChecksum,
    },
    artwork: {
      ...artwork,
      prefix: "candidates/" + artwork.processingKey + "/" + artwork.manifestHash + "/",
      reportChecksum: content.artworkReportChecksum,
    },
  };
}
export type PublicationBundle = ReturnType<typeof createPublicationBundle>;

export function validatePublicationPlaylists(
  bundle: PublicationBundle,
  playlists: ReadonlyMap<string, string>,
): void {
  const names = new Set(bundle.hls.files.map((file) => file.name));
  const visited = new Set(["master.m3u8"]);
  const master = playlists.get("master.m3u8")?.trimEnd().split("\n");
  if (
    !master ||
    master[0] !== "#EXTM3U" ||
    master[1] !== "#EXT-X-VERSION:6" ||
    master[2] !== "#EXT-X-INDEPENDENT-SEGMENTS" ||
    master.length < 5 ||
    master.length > 11 ||
    (master.length - 3) % 2 !== 0
  ) {
    return invalid();
  }
  for (let index = 3; index < master.length; index += 2) {
    if (
      !/^#EXT-X-STREAM-INF:BANDWIDTH=[1-9][0-9]{0,7},AVERAGE-BANDWIDTH=[1-9][0-9]{0,7},RESOLUTION=[1-9][0-9]{1,3}x[1-9][0-9]{1,3},FRAME-RATE=[1-9][0-9]?\.[0-9]{3},CODECS="avc1\.64002a,mp4a\.40\.2"$/u.test(
        master[index] ?? "",
      )
    ) {
      return invalid();
    }
    const name = master[index + 1] ?? "";
    const match = /^v([0-9]{2,3})\.m3u8$/u.exec(name);
    const lines = playlists.get(name)?.trimEnd().split("\n");
    if (
      !match ||
      visited.has(name) ||
      !lines ||
      lines.length > 1209 ||
      lines[0] !== "#EXTM3U" ||
      lines[1] !== "#EXT-X-VERSION:6" ||
      !/^#EXT-X-TARGETDURATION:[1-6]$/u.test(lines[2] ?? "") ||
      lines[3] !== "#EXT-X-MEDIA-SEQUENCE:0" ||
      lines[4] !== "#EXT-X-PLAYLIST-TYPE:VOD" ||
      lines[5] !== "#EXT-X-INDEPENDENT-SEGMENTS" ||
      lines.at(-1) !== "#EXT-X-ENDLIST" ||
      lines.length < 9 ||
      (lines.length - 7) % 2 !== 0
    ) {
      return invalid();
    }
    visited.add(name);
    let duration = 0;
    for (let segment = 0; segment < (lines.length - 7) / 2; segment++) {
      const seconds = Number(
        /^#EXTINF:([0-9]+\.[0-9]{1,6}),$/u.exec(lines[6 + segment * 2] ?? "")?.[1],
      );
      const target = Number(lines[2]?.split(":")[1]);
      const key = "v" + String(match[1]) + "-" + String(segment).padStart(4, "0") + ".ts";
      if (
        !Number.isFinite(seconds) ||
        seconds <= 0 ||
        seconds > 6.5 ||
        Math.round(seconds) > target ||
        lines[7 + segment * 2] !== key
      ) {
        return invalid();
      }
      visited.add(key);
      duration += seconds;
    }
    if (Math.abs(duration - bundle.duration) > 1) {
      return invalid();
    }
  }
  if (visited.size !== names.size || [...visited].some((name) => !names.has(name))) {
    return invalid();
  }
}
