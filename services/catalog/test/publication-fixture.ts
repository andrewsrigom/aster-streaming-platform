import assert from "node:assert/strict";
import {
  createPublicationBundle,
  mediaSha256,
} from "../src/infrastructure/media/publication-bundle.js";
import { normalizeRightsRecord, type RightsRecord } from "../src/domain/rights.js";
import { metadataFixture, rightsFacts } from "./workflow-fixture.js";
import { catalogTestId as id, catalogTestTime } from "./rights-fixture.js";

export function publicationBundleFixture(titleId = id(1), now = catalogTestTime) {
  const identity = {
    sha256: mediaSha256("synthetic-publication-" + titleId),
    bytes: 1000,
    container: "mp4" as const,
  };
  const probe = { width: 640, height: 359, duration: 6 };
  const hlsFiles = new Map([
    ["v240-0000.ts", Buffer.from("synthetic-segment")],
    [
      "v240.m3u8",
      Buffer.from(
        "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXTINF:6.000000,\nv240-0000.ts\n#EXT-X-ENDLIST\n",
      ),
    ],
    [
      "master.m3u8",
      Buffer.from(
        '#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-INDEPENDENT-SEGMENTS\n#EXT-X-STREAM-INF:BANDWIDTH=500000,AVERAGE-BANDWIDTH=400000,RESOLUTION=426x240,FRAME-RATE=24.000,CODECS="avc1.64002a,mp4a.40.2"\nv240.m3u8\n',
      ),
    ],
  ]);
  const frame = (name: string, purpose: string, width: number, fraction: number) => ({
    name,
    purpose,
    width,
    height: Math.round((359 * width) / 640),
    atSeconds: Math.floor(6 * fraction * 1000) / 1000,
  });
  const frames = [
    frame("poster-320.jpg", "poster", 320, 0.2),
    frame("poster-640.jpg", "poster", 640, 0.2),
    ...[0.1, 0.5, 0.85].map((fraction, index) =>
      frame("thumbnail-0" + String(index + 1) + ".jpg", "thumbnail", 160, fraction),
    ),
  ];
  const artworkFiles = new Map(
    frames.map((frame) => [frame.name, Buffer.from("synthetic-jpeg-" + frame.name)]),
  );
  const report = (recipe: string, files: ReadonlyMap<string, Buffer>, extras = {}) => {
    const objects = [...files].map(([name, bytes]) => ({
      name,
      bytes: bytes.length,
      sha256: mediaSha256(bytes),
    }));
    return Buffer.from(
      JSON.stringify({
        event: "media_candidate_validated",
        recipe,
        identity,
        probe,
        ...extras,
        files: objects,
        processingKey: mediaSha256(identity.sha256 + "\0" + recipe),
        manifestHash: mediaSha256(JSON.stringify(objects)),
        publicationAuthority: false,
      }),
    );
  };
  const hlsBytes = report("hls-avc-aac-v1", hlsFiles);
  const artworkBytes = report("frame-jpeg-v1", artworkFiles, { frames });
  const rights = normalizeRightsRecord({
    ...rightsFacts({ sourceChecksum: identity.sha256 }),
    id: id(2),
    titleId,
    revision: 2,
    status: "APPROVED",
    reviewedAt: now,
    reviewedBy: id(3),
  });
  assert.ok(rights);
  const artRights: RightsRecord = {
    ...rights,
    sourceChecksum: mediaSha256(artworkFiles.get("poster-640.jpg") as Buffer),
    modificationNotice: "Synthetic extracted JPEGs",
  };
  const metadata = {
    ...metadataFixture(),
    runtimeSeconds: 6,
    artwork: {
      url: "https://example.invalid/poster.jpg",
      altText: "Synthetic frame",
      rights: artRights,
    },
  };
  const bundle = createPublicationBundle(identity, hlsBytes, artworkBytes, rights, metadata);
  metadata.artwork.url = bundle.artworkUrl;
  metadata.artwork.rights = { ...artRights, assetSourceUrl: bundle.artworkUrl };
  const objects = new Map([...hlsFiles].map(([name, bytes]) => [bundle.hls.prefix + name, bytes]));
  for (const [name, bytes] of artworkFiles) {
    objects.set(bundle.artwork.prefix + name, bytes);
  }
  objects.set(bundle.hls.prefix + "report.json", hlsBytes);
  objects.set(bundle.artwork.prefix + "report.json", artworkBytes);
  return { identity, rights, metadata, bundle, hlsBytes, artworkBytes, objects, hlsFiles };
}
