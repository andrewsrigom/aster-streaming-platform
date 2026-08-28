import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import {
  localPublicationStorage,
  preparePublicationStorage,
  publicationStorageClient,
  readPublicationPolicy,
} from "../../src/infrastructure/media/publication-storage.js";
import { createAsterObjectStorageAdapter } from "@aster/object-storage-s3";
import { createAsterTelemetry } from "@aster/telemetry";
import { reuseOriginal } from "../../src/infrastructure/media/reuse-original.js";
import { publicationBundleFixture } from "../publication-fixture.js";
import { copyPublication } from "../../src/infrastructure/media/copy-publication.js";
import {
  createPublicationAccess,
  grantPublicationAccess,
  PublicationAccessRecoveryError,
} from "../../src/infrastructure/media/publication-access.js";

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
const published = createAsterObjectStorageAdapter({
  ...localPublicationStorage,
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
const confirmed = () => Promise.resolve();
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
  const access = createPublicationAccess(client);
  await denied(await get("/" + localPublicationStorage.bucket + "/" + key));
  const initialPrefix = "publications/" + "a".repeat(64) + "/";
  assert.deepEqual(await readPublicationPolicy(client, signal), []);
  await assert.rejects(
    access.reveal(initialPrefix, signal, async () => {
      assert.equal(await (await get("/aster-media-published/" + key)).text(), content);
      throw new Error("fixture rights expired during first grant");
    }),
    /fixture rights expired/u,
  );
  assert.deepEqual(await readPublicationPolicy(client, signal), []);
  await denied(await get("/aster-media-published/" + key));
  await access.reveal(initialPrefix, signal, confirmed);
  assert.deepEqual(await readPublicationPolicy(client, signal), [initialPrefix]);
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
    "/aster-media-published/control/publication-access.lock",
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
  await assert.rejects(
    readonly.send(
      new PutBucketPolicyCommand({ Bucket: localPublicationStorage.bucket, Policy: "{}" }),
      { abortSignal: signal },
    ),
    (error: unknown) => error instanceof Error && error.name === "AccessDenied",
  );
  assert.equal(await (await get(path)).text(), content);
  const bundleFixture = publicationBundleFixture();
  for (const [key, bytes] of bundleFixture.objects) {
    await client.send(
      new PutObjectCommand({ Bucket: "aster-media-originals", Key: key, Body: bytes }),
      { abortSignal: signal },
    );
  }
  let approvals = 0;
  await assert.rejects(
    copyPublication(
      bundleFixture.bundle,
      storage,
      published,
      () => {
        if (++approvals === 5) {
          return Promise.reject(new Error("fixture interrupted copy"));
        }
        return Promise.resolve();
      },
      signal,
    ),
  );
  await denied(
    await get("/aster-media-published/" + bundleFixture.bundle.prefix + "attribution.json"),
  );
  const first = await copyPublication(
    bundleFixture.bundle,
    storage,
    published,
    () => Promise.resolve(),
    signal,
  );
  await denied(await get("/aster-media-published/" + bundleFixture.bundle.prefix + "master.m3u8"));
  await denied(await get("/aster-media-published/" + bundleFixture.bundle.prefix + "v240-0000.ts"));
  // A held publication barrier must reject another publisher without losing the existing grant.
  const lockKey = "control/publication-access.lock";
  await client.send(
    new PutObjectCommand({
      Bucket: localPublicationStorage.bucket,
      Key: lockKey,
      Body: "fixture barrier",
      IfNoneMatch: "*",
    }),
    { abortSignal: signal },
  );
  await assert.rejects(
    access.reveal(bundleFixture.bundle.prefix, signal, confirmed),
    (error: unknown) => error instanceof Error && error.name === "PreconditionFailed",
  );
  assert.deepEqual(await readPublicationPolicy(client, signal), [initialPrefix]);
  await client.send(
    new DeleteObjectCommand({ Bucket: localPublicationStorage.bucket, Key: lockKey }),
    { abortSignal: signal },
  );
  // Change rights after the write/readback; no rejected new grant survives confirmation.
  let newlyExposed = false;
  await assert.rejects(
    grantPublicationAccess(
      bundleFixture.bundle,
      published,
      access,
      async () => {
        if ((await readPublicationPolicy(client, signal)).includes(bundleFixture.bundle.prefix)) {
          newlyExposed = true;
          throw new Error("fixture concurrent rights dispute");
        }
      },
      signal,
      confirmed,
    ),
    /fixture concurrent rights dispute/u,
  );
  assert.equal(newlyExposed, true);
  assert.deepEqual(await readPublicationPolicy(client, signal), [initialPrefix]);
  await denied(await get("/aster-media-published/" + bundleFixture.bundle.prefix + "master.m3u8"));
  assert.equal(await (await get(path)).text(), content);
  // A SQL rejection after the last read also compensates under the same barrier.
  await assert.rejects(
    grantPublicationAccess(bundleFixture.bundle, published, access, confirmed, signal, () =>
      Promise.reject(new Error("fixture registration rejected")),
    ),
    /fixture registration rejected/u,
  );
  assert.deepEqual(await readPublicationPolicy(client, signal), [initialPrefix]);
  await denied(await get("/aster-media-published/" + bundleFixture.bundle.prefix + "v240-0000.ts"));
  await grantPublicationAccess(
    bundleFixture.bundle,
    published,
    access,
    () => Promise.resolve(),
    signal,
    confirmed,
  );
  await access.reveal(bundleFixture.bundle.prefix, signal, confirmed);
  assert.deepEqual(
    await readPublicationPolicy(client, signal),
    [initialPrefix, bundleFixture.bundle.prefix].sort(),
  );
  assert.equal(await (await get(path)).text(), content);
  await preparePublicationStorage(client, signal);
  assert.deepEqual(
    await copyPublication(
      bundleFixture.bundle,
      storage,
      published,
      () => Promise.resolve(),
      signal,
    ),
    first,
  );
  for (const [name, mime] of [
    ["master.m3u8", "application/vnd.apple.mpegurl"],
    ["v240-0000.ts", "video/mp2t"],
    ["poster-640.jpg", "image/jpeg"],
    ["attribution.json", "application/json"],
  ] as const) {
    const response = await get("/aster-media-published/" + bundleFixture.bundle.prefix + name);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), mime);
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    await response.arrayBuffer();
  }
  process.stdout.write(
    JSON.stringify({
      event: "media_bundle_storage_verified",
      ...first,
      immutableReplay: true,
      allObjectTypes: true,
      currentCopyImplementation: true,
      partialObjectsPrivate: true,
      completeCopyPrivateBeforeGrant: true,
      competingPolicyWriterDenied: true,
      previousGrantPreserved: true,
      expiredFirstGrantRemoved: true,
      concurrentRightsChangeCompensated: true,
      registrationRejectionCompensated: true,
    }) + "\n",
  );
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
  await assert.rejects(
    access.reveal(bundleFixture.bundle.prefix, signal, confirmed),
    PublicationAccessRecoveryError,
  );
  await client.send(
    new HeadObjectCommand({ Bucket: localPublicationStorage.bucket, Key: lockKey }),
    { abortSignal: signal },
  );
  await assert.rejects(
    access.reveal(bundleFixture.bundle.prefix, signal, confirmed),
    (error: unknown) => error instanceof Error && error.name === "PreconditionFailed",
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
      failedGrantRetainsBarrier: true,
    }) + "\n",
  );
} finally {
  client.destroy();
  readonly.destroy();
  await storage.close();
  await published.close();
  await telemetry.shutdown();
}
