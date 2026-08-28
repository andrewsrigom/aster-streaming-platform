import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ARTWORK_RECIPE_VERSION, processingKeyInput } from "../src/domain/media-processing.js";
import { parseCandidateReport } from "../src/infrastructure/media/retain-candidate.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const source = { sha256: "a".repeat(64), bytes: 1000, container: "zip" as const };
function fixture() {
  const frames = [
    { name: "poster-320.jpg", purpose: "poster", width: 320, height: 180, atSeconds: 120 },
    { name: "poster-640.jpg", purpose: "poster", width: 640, height: 359, atSeconds: 120 },
    ...[60, 300, 510].map((atSeconds, index) => ({
      name: "thumbnail-0" + String(index + 1) + ".jpg",
      purpose: "thumbnail",
      width: 160,
      height: 90,
      atSeconds,
    })),
  ];
  const files = frames.map(({ name }) => ({ name, bytes: 100, sha256: "b".repeat(64) }));
  return {
    event: "media_candidate_validated",
    identity: source,
    recipe: ARTWORK_RECIPE_VERSION,
    probe: { width: 640, height: 359, duration: 600 },
    frames,
    files,
    processingKey: hash(processingKeyInput(source.sha256, ARTWORK_RECIPE_VERSION)),
    manifestHash: hash(JSON.stringify(files)),
    publicationAuthority: false,
  };
}
test("artwork reports preserve source identity and cannot be consumed as HLS", () => {
  const report = fixture();
  const bytes = Buffer.from(JSON.stringify(report));
  const parsed = parseCandidateReport(bytes, source, ARTWORK_RECIPE_VERSION);
  assert.equal(parsed.files.length, 5);
  assert.equal(parsed.processingKey, report.processingKey);
  assert.notEqual(parsed.processingKey, hash(processingKeyInput(source.sha256)));
  assert.throws(() => parseCandidateReport(bytes, source));
  assert.throws(() =>
    parseCandidateReport(bytes, { ...source, sha256: "c".repeat(64) }, ARTWORK_RECIPE_VERSION),
  );
});
test("artwork reports reject omitted, oversized, duplicate or foreign frames and malformed geometry", () => {
  for (const change of [
    (report: ReturnType<typeof fixture>) => {
      report.frames.pop();
    },
    (report: ReturnType<typeof fixture>) => {
      const first = report.files[0];
      assert.ok(first);
      first.name = "../escape.jpg";
    },
    (report: ReturnType<typeof fixture>) => {
      const first = report.files[0];
      assert.ok(first);
      first.bytes = 2 * 1024 * 1024 + 1;
    },
    (report: ReturnType<typeof fixture>) => {
      const [first, second] = report.files;
      assert.ok(first && second);
      second.name = first.name;
    },
    (report: ReturnType<typeof fixture>) => {
      const first = report.frames[0];
      assert.ok(first);
      first.atSeconds = 601;
    },
    (report: ReturnType<typeof fixture>) => {
      const first = report.frames[0];
      assert.ok(first);
      first.width = 1280;
    },
    (report: ReturnType<typeof fixture>) => {
      report.probe.duration = 0;
    },
    (report: ReturnType<typeof fixture>) => {
      report.probe.width = 99999;
    },
    (report: ReturnType<typeof fixture>) => {
      report.processingKey = hash(processingKeyInput(source.sha256));
    },
  ]) {
    const report = fixture();
    change(report);
    report.manifestHash = hash(JSON.stringify(report.files));
    assert.throws(() =>
      parseCandidateReport(Buffer.from(JSON.stringify(report)), source, ARTWORK_RECIPE_VERSION),
    );
  }
});
