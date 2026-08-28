import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import {
  localPublicationStorage,
  preparePublicationStorage,
  publicationStorageClient,
} from "../../src/infrastructure/media/publication-storage.js";
import { createAsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { createAsterTelemetry } from "@aster/telemetry";
import { reuseOriginal } from "../../src/infrastructure/media/reuse-original.js";

const ports = process.argv.slice(2).map(Number);
assert.equal(ports.length, 2);
assert.ok(ports.every((port) => Number.isSafeInteger(port) && port > 1023 && port < 65536));
const endpoint = "http://127.0.0.1:" + String(ports[0]);
const origin = "http://127.0.0.1:" + String(ports[1]);
const client = publicationStorageClient(endpoint);
const readonly = publicationStorageClient(origin);
const signal = AbortSignal.timeout(20000);
const telemetry = createAsterTelemetry({
  serviceName: "media-origin-test",
  serviceVersion: "0.0.0",
  environment: "test",
  export: { mode: "none" },
});
const storage = createAsterObjectStorageAdapter({
  ...localPublicationStorage,
  bucket: "aster-media-originals",
  endpoint,
  telemetry,
  maxInFlightOperations: 1,
});
const key = "publications/" + "a".repeat(64) + "/master.m3u8";
const content = "#EXTM3U\n#EXT-X-VERSION:3\n";
const get = (path: string, init: RequestInit = {}) =>
  fetch(origin + path, { ...init, signal, redirect: "error" });
const denied = async (response: Response) => {
  await response.arrayBuffer();
  assert.ok(response.status === 403 || response.status === 405, String(response.status));
};
try {
  await preparePublicationStorage(client, signal);
  await preparePublicationStorage(client, signal);
  await client.send(
    new PutObjectCommand({
      Bucket: localPublicationStorage.bucket,
      Key: key,
      Body: content,
      ContentType: "application/vnd.apple.mpegurl",
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { abortSignal: signal },
  );
  await client.send(
    new PutObjectCommand({
      Bucket: localPublicationStorage.bucket,
      Key: "private.txt",
      Body: "private fixture",
    }),
    { abortSignal: signal },
  );
  await client.send(new CreateBucketCommand({ Bucket: "aster-media-originals" }), {
    abortSignal: signal,
  });
  const original = Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 1, 2, 3, 4]);
  const sha256 = createHash("sha256").update(original).digest("hex");
  const originalKey = "originals/sha256/" + sha256;
  await client.send(
    new PutObjectCommand({ Bucket: "aster-media-originals", Key: originalKey, Body: original }),
    { abortSignal: signal },
  );
  assert.deepEqual(
    await reuseOriginal(
      {
        url: "https://download.blender.org/peach/bigbuckbunny_movies/fixture.zip",
        bytes: original.length,
        etag: '"fixture"',
        sha256,
        container: "zip",
      },
      storage,
      signal,
    ),
    { sha256, bytes: original.length, key: originalKey },
  );
  const response = await get("/" + localPublicationStorage.bucket + "/" + key, {
    headers: { Origin: "http://127.0.0.1:3000" },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), content);
  assert.equal(response.headers.get("content-type"), "application/vnd.apple.mpegurl");
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000");
  const path = "/" + localPublicationStorage.bucket + "/" + key;
  const head = await get(path, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(content)));
  const range = await get(path, { headers: { Range: "bytes=0-6" } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "#EXTM3U");
  assert.equal(
    range.headers.get("content-range"),
    "bytes 0-6/" + String(Buffer.byteLength(content)),
  );
  const cors = await get(path, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:3000",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "range",
    },
  });
  await cors.arrayBuffer();
  assert.ok(cors.ok);
  assert.equal(cors.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000");
  const other = await get(path, { headers: { Origin: "https://untrusted.invalid" } });
  await other.arrayBuffer();
  assert.equal(other.headers.get("access-control-allow-origin"), null);
  for (const target of [
    "/",
    "/aster-media-published?list-type=2",
    "/aster-media-published/private.txt",
    "/aster-media-originals/" + originalKey,
  ]) {
    await denied(await get(target));
  }
  for (const method of ["PUT", "DELETE", "POST"] as const) {
    await denied(await get(path, { method, ...(method === "PUT" ? { body: "replace" } : {}) }));
  }
  for (const command of [
    new PutObjectCommand({ Bucket: localPublicationStorage.bucket, Key: key, Body: "replace" }),
    new DeleteObjectCommand({ Bucket: localPublicationStorage.bucket, Key: key }),
  ]) {
    await assert.rejects(
      readonly.send(command, { abortSignal: signal }),
      (error: unknown) => error instanceof Error && error.name === "AccessDenied",
    );
  }
  assert.equal(await (await get(path)).text(), content);
  // Unexpected retained policy is a blocker, never silently widened or replaced.
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: localPublicationStorage.bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: ["arn:aws:s3:::aster-media-published/*"],
          },
        ],
      }),
    }),
    { abortSignal: signal },
  );
  await assert.rejects(
    preparePublicationStorage(client, signal),
    /Unexpected publication bucket policy/u,
  );
  process.stdout.write(
    JSON.stringify({
      event: "media_origin_verified",
      anonymousRead: true,
      privateAndListingDenied: true,
      anonymousWritesDenied: true,
      signedWritesDenied: true,
      cors: true,
      range: true,
      immutableHeaders: true,
      originalReuse: true,
      unexpectedPolicyRefused: true,
    }) + "\n",
  );
} finally {
  client.destroy();
  readonly.destroy();
  await storage.close();
  await telemetry.shutdown();
}
