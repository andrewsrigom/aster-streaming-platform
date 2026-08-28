import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLocalRouterTrust,
  loadLocalRouterTrust,
  createLocalCatalogPlaybackTrust,
  loadLocalCatalogPlaybackCredential,
  loadLocalCatalogPlaybackTrust,
} from "../src/local-router-trust.js";

const key = randomBytes(32).toString("hex");
const traceId = "a".repeat(32);
function request(owner: "identity" | "catalog", extra: string[] = []) {
  const value = new IncomingMessage(new Socket());
  value.method = "POST";
  value.url = "/graphql";
  value.rawHeaders = [
    "host",
    owner === "identity" ? "identity:3100" : "catalog:3200",
    "origin",
    "http://127.0.0.1:4000",
    "x-aster-csrf",
    "1",
    "x-aster-router-credential",
    key,
    ...extra,
  ];
  return value;
}

test("separate Router transport authenticates only its owner and correlates trusted traces", () => {
  const identity = createLocalRouterTrust("identity", key);
  assert.deepEqual(identity.accept(request("identity")), {});
  assert.deepEqual(identity.accept(request("identity", ["tracestate", ""])), {});
  assert.deepEqual(
    identity.accept(request("identity", ["traceparent", `00-${traceId}-${"b".repeat(16)}-01`])),
    { traceId },
  );
  assert.equal(identity.accept(request("catalog")), undefined);
  assert.equal(
    createLocalRouterTrust("identity", randomBytes(32).toString("hex")).accept(request("identity")),
    undefined,
  );
  assert.ok(identity.accept(request("identity", ["cookie", "aster_local_session=a.b.c"])));
  assert.equal(
    createLocalRouterTrust("catalog", key).accept(
      request("catalog", ["cookie", "aster_local_session=a.b.c"]),
    ),
    undefined,
  );
});

test("trust rejects forgery, duplicates, malformed trace and request/header bounds", () => {
  const trust = createLocalRouterTrust("identity", key);
  for (const extra of [
    ["x-aster-router-credential", key],
    ["X-Aster-Account-Id", "forged"],
    ["authorization", "Bearer forged"],
    ["x-forwarded-host", "identity:3100"],
    ["forwarded", "host=identity:3100"],
    ["baggage", "secret"],
    ["tracestate", "secret"],
    ["traceparent", "bad"],
    ["traceparent", `00-${"0".repeat(32)}-${"b".repeat(16)}-01`],
    ["traceparent", `00-${traceId}-${"0".repeat(16)}-01`],
    ["origin", "http://127.0.0.1:4000"],
    ["x-oversized", "x".repeat(16384)],
    Array.from({ length: 64 }, (_, index) => [`x-${index}`, "1"]).flat(),
  ]) {
    assert.equal(trust.accept(request("identity", extra)), undefined);
  }
  for (const name of ["host", "origin", "x-aster-csrf", "x-aster-router-credential"]) {
    const value = request("identity");
    value.rawHeaders.splice(value.rawHeaders.indexOf(name), 2);
    assert.equal(trust.accept(value), undefined);
  }
  const get = request("identity");
  get.method = "GET";
  assert.equal(trust.accept(get), undefined);
  const query = request("identity");
  query.url = "/graphql?secret=1";
  assert.equal(trust.accept(query), undefined);
  assert.throws(() => createLocalRouterTrust("identity", "invalid"), /configuration/);
});

test("Playback owner read uses separate credentials, origin and header without Router or viewer authority", () => {
  const reader = createLocalCatalogPlaybackTrust(key);
  const router = createLocalRouterTrust("catalog", key);
  const value = request("catalog");
  value.rawHeaders[value.rawHeaders.indexOf("origin") + 1] = "http://playback:3300";
  value.rawHeaders[value.rawHeaders.indexOf("x-aster-router-credential")] =
    "x-aster-playback-credential";
  assert.deepEqual(reader.accept(value), {});
  assert.equal(router.accept(value), undefined);
  assert.equal(reader.accept(request("catalog")), undefined);
  assert.equal(
    createLocalCatalogPlaybackTrust(randomBytes(32).toString("hex")).accept(value),
    undefined,
  );
  for (const extra of [
    ["cookie", "aster_local_session=forged"],
    ["x-aster-router-credential", key],
    ["x-aster-playback-credential", key],
    ["x-aster-profile-id", "forged"],
    ["origin", "http://playback:3300"],
    ["authorization", "Bearer forged"],
    ["baggage", "private"],
  ]) {
    value.rawHeaders.push(...extra);
    assert.equal(reader.accept(value), undefined);
    value.rawHeaders.splice(-extra.length);
  }
  const playback = request("catalog");
  playback.rawHeaders[1] = "playback:3300";
  assert.deepEqual(createLocalRouterTrust("playback", key).accept(playback), {});
  playback.rawHeaders.push("cookie", "forged");
  assert.equal(createLocalRouterTrust("playback", key).accept(playback), undefined);
});

test("owner-read file is separate, bounded and private with sanitized startup failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aster-playback-trust-"));
  const path = join(directory, "catalog.key");
  try {
    await assert.rejects(loadLocalCatalogPlaybackTrust(directory), /credential is unavailable/);
    await writeFile(path, key, { mode: 0o400 });
    assert.equal(await loadLocalCatalogPlaybackCredential(directory), key);
    assert.ok(await loadLocalCatalogPlaybackTrust(directory));
    await chmod(path, 0o644);
    await assert.rejects(
      loadLocalCatalogPlaybackCredential(directory),
      /credential is unavailable/,
    );
    await chmod(path, 0o600);
    await writeFile(path, Buffer.alloc(64, 0xe1));
    await assert.rejects(
      loadLocalCatalogPlaybackCredential(directory),
      /credential is unavailable/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("startup reads only a bounded private regular credential file and sanitizes failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aster-router-trust-"));
  const path = join(directory, "identity.key");
  try {
    await assert.rejects(loadLocalRouterTrust("identity", directory), /credential is unavailable/);
    await writeFile(path, key, { mode: 0o400 });
    assert.ok((await loadLocalRouterTrust("identity", directory)).accept(request("identity")));
    await chmod(path, 0o644);
    await assert.rejects(loadLocalRouterTrust("identity", directory), /credential is unavailable/);
    await rm(path);
    await writeFile(path, "x".repeat(65), { mode: 0o400 });
    await assert.rejects(loadLocalRouterTrust("identity", directory), /credential is unavailable/);
    await rm(path);
    await symlink(join(directory, "catalog.key"), path);
    await assert.rejects(loadLocalRouterTrust("identity", directory), /credential is unavailable/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
