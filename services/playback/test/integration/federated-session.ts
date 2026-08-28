import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";

assert.match(process.env["ASTER_FIXTURE_ID"] ?? "", /^aster-playback-proof-[a-f0-9-]{36}$/u);
interface GraphResult {
  data?: {
    createPlaybackSession?: {
      code: string;
      correlationId: string;
      session: null | { id: string; titleId: string; manifestUrl: string; expiresAt: number };
    };
  };
  errors?: unknown[];
}
const mutation =
  "mutation StartPlayback($titleId: ID!) { createPlaybackSession(titleId: $titleId) { code correlationId session { id titleId manifestUrl expiresAt } } }";
const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const emit = (event: string, facts: object) =>
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");

async function post(
  hostname: string,
  port: number,
  body: object,
  headers: Record<string, string> = {},
) {
  return new Promise<{
    status: number;
    body: GraphResult;
    text: string;
    noStore: boolean;
    cookie: unknown;
  }>((resolve, reject) => {
    const encoded = JSON.stringify(body);
    const outgoing = request(
      {
        hostname,
        port,
        path: "/graphql",
        method: "POST",
        agent: false,
        signal: AbortSignal.timeout(4000),
        maxHeaderSize: 8192,
        headers: {
          host: "127.0.0.1:4000",
          origin: "http://127.0.0.1:4000",
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(encoded)),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("error", reject);
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 16384) {
            response.destroy(new Error("Proof response exceeded bound."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(text) as GraphResult,
              text,
              noStore: response.headers["cache-control"] === "no-store",
              cookie: response.headers["set-cookie"],
            });
          } catch (error) {
            reject(new Error("Invalid proof response.", { cause: error }));
          }
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(encoded);
  });
}
const start = (titleId: string, headers: Record<string, string> = {}) =>
  post(
    "router",
    4000,
    { query: mutation, operationName: "StartPlayback", variables: { titleId } },
    headers,
  );
const admin = new Pool({
  host: "postgres",
  port: 5432,
  database: "aster",
  user: "aster",
  password: "aster-test-only",
  max: 2,
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
  query_timeout: 2500,
});
admin.on("error", () => undefined);
const manifest = "https://example.invalid/media/master.m3u8";
const now = Math.floor(Date.now() / 1000);
const cappedAt = now + 120;

async function seed(n: number, expiry: number | null = null, status = "APPROVED") {
  const titleId = id(n),
    rightsId = randomUUID(),
    publicationId = randomUUID();
  const rights = {
    id: rightsId,
    titleId,
    revision: 1,
    status,
    workTitle: "Synthetic session contract fixture",
    creator: "Synthetic creator",
    copyrightHolder: "Synthetic owner",
    canonicalSourceUrl: "https://example.invalid/work",
    assetSourceUrl: "https://example.invalid/source.mp4",
    licenseName: "Synthetic test permission",
    licenseVersion: "1.0",
    licenseUrl: "https://example.invalid/license",
    attributionText: "Synthetic creator — test only",
    modificationNotice: "Generated fixture",
    thirdPartyMaterialNotes: "None",
    trademarkNotes: "No marks",
    redistributionAllowed: true,
    commercialUseAllowed: true,
    modificationAllowed: true,
    shareAlikeRequired: false,
    technicalRestrictions: "NONE",
    sourceChecksum: "a".repeat(64),
    reviewedAt: now - 60,
    reviewedBy: id(999),
    validUntil: expiry,
    evidenceLocations: ["evidence/phase-07/federated-runtime.txt"],
  };
  const metadata = {
    defaultLocale: "en",
    releaseYear: null,
    runtimeSeconds: null,
    languages: [],
    accessibility: [],
    editorialLabels: ["synthetic"],
    localizations: [
      {
        locale: "en",
        title: rights.workTitle,
        synopsis: "No actual media. Session contract only.",
      },
    ],
    genres: ["animation"],
    credits: [{ name: "Synthetic creator", role: "director" }],
    artwork: null,
  };
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO catalog.titles(id, version, state, metadata) VALUES ($1, 1, 'DRAFT', $2::jsonb)",
      [titleId, JSON.stringify(metadata)],
    );
    await client.query(
      "INSERT INTO catalog.rights_revisions(id, title_id, revision, status, record) VALUES ($1, $2, 1, $3, $4::jsonb)",
      [rightsId, titleId, status, JSON.stringify(rights)],
    );
    await client.query("INSERT INTO catalog.rights_audit VALUES ($1, 1, 2, $2, $3, $4)", [
      titleId,
      id(999),
      now - 60,
      randomUUID(),
    ]);
    await client.query("INSERT INTO catalog.publications VALUES ($1, $2, 1, $3, $4, $5, $6)", [
      publicationId,
      titleId,
      "a".repeat(64),
      manifest,
      randomUUID(),
      now - 30,
    ]);
    await client.query(
      "UPDATE catalog.titles SET version = 5, state = 'PUBLISHED', latest_rights_revision = 1, rights_revision = 1, publication_id = $2 WHERE id = $1",
      [titleId, publicationId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const count = async () =>
  (await admin.query<{ count: number }>("SELECT count(*)::int AS count FROM playback.sessions"))
    .rows[0]?.count;

try {
  assert.equal(await count(), 0, "Proof requires a fresh isolated database.");
  for (const n of [1, 2, 3, 4]) {
    await seed(n, n === 2 ? cappedAt : n === 3 ? now - 1 : null, n === 4 ? "DISPUTED" : "APPROVED");
  }
  const created = await start(id(1), { cookie: "aster_local_session=invalid-optional-identity" });
  assert.equal(created.status, 200);
  assert.equal(created.body.errors, undefined);
  const payload = created.body.data?.createPlaybackSession;
  assert.equal(payload?.code, "COMPLETED");
  assert.ok(payload.session);
  assert.equal(payload.session.titleId, id(1));
  assert.equal(payload.session.manifestUrl, manifest);
  assert.match(payload.correlationId, /^[a-f0-9-]{36}$/u);
  assert.equal(created.noStore, true);
  assert.equal(created.cookie, undefined);
  const saved = await admin.query<{ profile_id: null; correlation_id: string }>(
    "SELECT profile_id, correlation_id FROM playback.sessions WHERE id = $1",
    [payload.session.id],
  );
  assert.deepEqual(saved.rows, [{ profile_id: null, correlation_id: payload.correlationId }]);
  const capped = (await start(id(2))).body.data?.createPlaybackSession;
  assert.equal(capped?.code, "COMPLETED");
  assert.equal(capped.session?.expiresAt, cappedAt);
  emit("playback_federated_creation", {
    persistedAnonymous: true,
    cappedRightsExpiry: true,
    noOptionalIdentityDependency: true,
    mediaFetches: 0,
    correlationId: payload.correlationId,
  });

  for (const n of [3, 4, 999]) {
    const result = (await start(id(n))).body.data?.createPlaybackSession;
    assert.equal(result?.code, "NOT_PLAYABLE");
    assert.equal(result.session, null);
  }
  await admin.query("UPDATE catalog.titles SET state = 'RETIRED', version = 6 WHERE id = $1", [
    id(1),
  ]);
  assert.equal((await start(id(1))).body.data?.createPlaybackSession?.code, "NOT_PLAYABLE");
  assert.equal(await count(), 2);
  const forged = await start(id(2), { "x-aster-playback-credential": "bad" });
  assert.equal(forged.status, 403);
  const amplified = await post("router", 4000, {
    query: `mutation Attack { a: createPlaybackSession(titleId: "${id(2)}") { code } b: createPlaybackSession(titleId: "${id(2)}") { code } }`,
    operationName: "Attack",
  });
  assert.ok(amplified.body.errors?.length);
  assert.equal(await count(), 2);
  const privateKey = await readFile("/run/aster-playback-catalog/catalog.key", "utf8");
  const routerKey = await readFile("/run/aster-router/playback.key", "utf8");
  assert.notEqual(privateKey, routerKey);
  const bypass = await post(
    "playback",
    3300,
    { query: mutation, variables: { titleId: id(2) } },
    { host: "playback:3300", "x-aster-router-credential": privateKey },
  );
  assert.equal(bypass.status, 403);
  emit("playback_federated_rejections", {
    expiredDisputedMissingRetired: "rejected",
    freshOwnerCheck: true,
    forgedTrustAndFanout: "rejected",
    persisted: 2,
  });

  const blocker = await admin.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT singleton FROM playback.session_admission FOR UPDATE");
    const result = await start(id(2));
    assert.notEqual(result.body.data?.createPlaybackSession?.code, "COMPLETED");
    assert.equal(await count(), 2);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  assert.equal((await start(id(2))).body.data?.createPlaybackSession?.code, "COMPLETED");
  const ownerBlocker = await admin.connect();
  try {
    await ownerBlocker.query("BEGIN");
    await ownerBlocker.query("LOCK TABLE catalog.rights_revisions IN ACCESS EXCLUSIVE MODE");
    assert.notEqual((await start(id(2))).body.data?.createPlaybackSession?.code, "COMPLETED");
    assert.equal(await count(), 3);
  } finally {
    await ownerBlocker.query("ROLLBACK");
    ownerBlocker.release();
  }
  // One bounded recovery window accounts for the service's five-second readiness monitor.
  let recovered = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await start(id(2));
    if (result.body.data?.createPlaybackSession?.code === "COMPLETED") {
      recovered = true;
      break;
    }
    await delay(500);
  }
  assert.equal(recovered, true);
  assert.equal(await count(), 4);
  emit("playback_federated_failures", {
    blockedStoreAndCatalog: "bounded_no_session",
    recovery: "passed",
    sessionCount: 4,
  });
} finally {
  await admin.end();
}
