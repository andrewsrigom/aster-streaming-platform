import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";

assert.match(process.env["ASTER_FIXTURE_ID"] ?? "", /^aster-engagement-proof-[a-f0-9-]{36}$/u);
interface GraphResult {
  data?: {
    [operation: string]: {
      code: string;
      correlationId: string;
      session?: null | { id: string; titleId: string; manifestUrl: string; expiresAt: number };
      profileId?: string;
      progress?: null | Record<string, string | number>;
      change?: null | Record<string, string | number | boolean>;
      connection?: null | {
        edges: {
          cursor: string;
          node: {
            id: string;
            titleId: string;
            status: string;
            updatedAt: number;
            title: null | { id: string; localized: { title: string } };
          };
        }[];
        pageInfo: { endCursor: string | null; hasNextPage: boolean };
      };
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
    cookie: readonly string[] | undefined;
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
    evidenceLocations: ["evidence/phase-08/federated-runtime.txt"],
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

const progressMutation =
  "mutation RecordProgress($input: RecordProgressInput!) { recordProgress(input: $input) { code correlationId progress { id profileId titleId sequence version positionMs durationMs status occurredAt updatedAt } } }";
let cookie = "";
async function call(query: string, variables: object = {}, credential = cookie) {
  return post(
    "router",
    4000,
    {
      query,
      operationName: /^(?:query|mutation)\s+(\w+)/u.exec(query)?.[1],
      variables,
    },
    credential ? { cookie: credential } : {},
  );
}
async function counts() {
  return (
    await admin.query(
      "SELECT (SELECT count(*)::int FROM engagement.progress) AS progress, (SELECT count(*)::int FROM engagement.progress_receipts) AS receipts, (SELECT count(*)::int FROM engagement.outbox) AS outbox",
    )
  ).rows[0] as { progress: number; receipts: number; outbox: number };
}
const record = (input: object, credential = cookie) =>
  call(progressMutation, { input }, credential);
const page = (
  kind: "history" | "continue",
  variables: { profileId: string; first?: number; after?: string | null },
  credential = cookie,
) => {
  const operation = kind === "history" ? "ProgressHistory" : "ContinueWatching";
  const field = kind === "history" ? "progressHistory" : "continueWatching";
  return call(
    `query ${operation}($profileId: ID!, $first: Int! = 20, $after: String) {
      ${field}(profileId: $profileId, first: $first, after: $after) {
        code correlationId connection {
          edges { cursor node { id titleId status updatedAt title { id localized { title } } } }
          pageInfo { endCursor hasNextPage }
        }
      }
    }`,
    variables,
    credential,
  );
};
const payload = (response: Awaited<ReturnType<typeof post>>, name: string) => {
  assert.equal(response.status, 200);
  assert.equal(response.body.errors, undefined);
  const result = response.body.data?.[name];
  assert.ok(result);
  return result;
};
try {
  assert.deepEqual(await counts(), { progress: 0, receipts: 0, outbox: 0 });
  await seed(1);
  await seed(2);
  const signed = await call("mutation DemoSignIn { demoSignIn { code } }");
  assert.equal(payload(signed, "demoSignIn").code, "COMPLETED");
  const issued = signed.cookie?.[0]?.split(";")[0];
  assert.ok(issued);
  cookie = issued;
  const profile = payload(
    await call(
      "mutation CreateProfile($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
      {
        input: {
          mutationId: randomUUID(),
          profile: { displayName: "Progress synthetic", locale: "pt-BR", maturity: "GENERAL" },
        },
      },
    ),
    "createProfile",
  );
  assert.equal(profile.code, "COMPLETED");
  assert.ok(profile.profileId);
  const profileId = profile.profileId;
  const session = payload(await start(id(1)), "createPlaybackSession").session;
  const otherSession = payload(await start(id(2)), "createPlaybackSession").session;
  assert.ok(session && otherSession);
  const input = {
    profileId,
    titleId: id(1),
    playbackSessionId: session.id,
    idempotencyKey: randomUUID(),
    sequence: 1,
    positionMs: 1000,
    durationMs: 6000,
    occurredAt: Math.floor(Date.now() / 1000),
  };
  const savedResponse = await record(input);
  const saved = payload(savedResponse, "recordProgress");
  assert.equal(saved.code, "COMPLETED");
  assert.equal(saved.progress?.["status"], "IN_PROGRESS");
  assert.equal(saved.progress["positionMs"], 1000);
  assert.equal(savedResponse.noStore, true);
  assert.equal(savedResponse.cookie, undefined);
  assert.doesNotMatch(
    savedResponse.text,
    /accountId|playbackSessionId|manifestUrl|aster_local_session/u,
  );
  assert.deepEqual(await counts(), { progress: 1, receipts: 1, outbox: 1 });
  const stored = await admin.query<{ result: unknown; event: Record<string, unknown> }>(
    "SELECT r.result, o.event FROM engagement.progress_receipts r JOIN engagement.outbox o ON o.aggregate_id = (r.result->>'id')::uuid AND o.aggregate_version = (r.result->>'version')::int WHERE r.idempotency_key = $1",
    [input.idempotencyKey],
  );
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0]?.event["correlationId"], saved.correlationId);
  assert.doesNotMatch(
    JSON.stringify(stored.rows[0].event),
    /accountId|aster_local_session|manifestUrl/u,
  );
  emit("engagement_federated_commit", {
    currentIdentityAndPlayback: true,
    durableProgressReceiptOutbox: true,
    correlationId: saved.correlationId,
    mediaFetches: 0,
  });

  const duplicates = await Promise.all([record(input), record(input)]);
  for (const duplicate of duplicates) {
    assert.deepEqual(payload(duplicate, "recordProgress").progress, saved.progress);
  }
  assert.equal(
    payload(await record({ ...input, positionMs: 1500 }), "recordProgress").code,
    "CONFLICT",
  );
  const newer = { ...input, idempotencyKey: randomUUID(), sequence: 2, positionMs: 800 };
  assert.equal(payload(await record(newer), "recordProgress").code, "COMPLETED");
  assert.equal(
    payload(await record({ ...input, idempotencyKey: randomUUID() }), "recordProgress").code,
    "STALE",
  );
  assert.deepEqual(await counts(), { progress: 1, receipts: 2, outbox: 2 });
  assert.deepEqual(payload(await record(input), "recordProgress").progress, saved.progress);
  assert.equal(
    payload(
      await record({
        ...input,
        titleId: id(2),
        playbackSessionId: otherSession.id,
      }),
      "recordProgress",
    ).code,
    "CONFLICT",
  );
  assert.deepEqual(await counts(), { progress: 1, receipts: 2, outbox: 2 });
  emit("engagement_federated_ordering", {
    exactConcurrentReplay: true,
    conflictAndStaleRejected: true,
    intentionalBackseek: true,
    changedTitleSameKey: "conflict",
  });

  await admin.query(
    "INSERT INTO identity.accounts(id, issuer, subject) VALUES ($1, 'synthetic-foreign', 'synthetic-foreign')",
    [id(991)],
  );
  await admin.query(
    "INSERT INTO identity.profiles(id, account_id, slot, display_name, locale, maturity, version) VALUES ($1,$2,1,'Foreign synthetic','pt-BR','GENERAL',1)",
    [id(992), id(991)],
  );
  const next = { ...input, sequence: 3, idempotencyKey: randomUUID() };
  for (const [change, expected] of [
    [{ profileId: id(992) }, "NOT_FOUND"],
    [{ profileId: id(993) }, "NOT_FOUND"],
    [{ playbackSessionId: otherSession.id }, "NOT_PLAYABLE"],
    [{ playbackSessionId: id(994) }, "NOT_PLAYABLE"],
  ] as const) {
    const rejected = payload(await record({ ...next, ...change }), "recordProgress");
    assert.equal(rejected.code, expected);
    assert.equal(rejected.progress, null);
  }
  assert.equal(payload(await record(input, ""), "recordProgress").code, "UNAUTHENTICATED");
  const privateRead = await call(
    'query Hidden { _engagementProfile(profileId: "' + profileId + '") { code } }',
  );
  assert.ok(privateRead.body.errors?.length);
  assert.equal(
    (
      await post(
        "router",
        4000,
        {
          query: progressMutation,
          operationName: "RecordProgress",
          variables: { input: next },
        },
        { cookie, "x-aster-engagement-credential": "forged" },
      )
    ).status,
    403,
  );
  assert.deepEqual(await counts(), { progress: 1, receipts: 2, outbox: 2 });
  emit("engagement_federated_authorization", {
    foreignAndMissingProfile: "denied",
    wrongAndMissingPlayback: "denied",
    privateFieldsHidden: true,
    forgedTrust: "denied",
  });

  const blocker = await admin.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT id FROM identity.accounts WHERE id = (SELECT account_id FROM identity.profiles WHERE id = $1) FOR UPDATE",
      [profileId],
    );
    const blocked = await record(next);
    assert.notEqual(blocked.body.data?.["recordProgress"]?.code, "COMPLETED");
    assert.deepEqual(await counts(), { progress: 1, receipts: 2, outbox: 2 });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  assert.equal(payload(await record(next), "recordProgress").code, "COMPLETED");
  assert.deepEqual(await counts(), { progress: 1, receipts: 3, outbox: 3 });
  const expired = Math.floor(Date.now() / 1000) - 1;
  await admin.query(
    "UPDATE playback.sessions SET created_at=$2-60, catalog_checked_at=$2-60, expires_at=$2 WHERE id=$1",
    [session.id, expired],
  );
  assert.deepEqual(payload(await record(input), "recordProgress").progress, saved.progress);
  assert.equal(
    payload(await record({ ...next, sequence: 4, idempotencyKey: randomUUID() }), "recordProgress")
      .code,
    "NOT_PLAYABLE",
  );
  emit("engagement_federated_failures", {
    ownerLock: "bounded_no_ack",
    recovery: true,
    expiredSessionReplay: true,
    expiredNewWrite: "denied",
  });

  const secondTitle = {
    ...input,
    titleId: id(2),
    playbackSessionId: otherSession.id,
    idempotencyKey: randomUUID(),
  };
  assert.equal(payload(await record(secondTitle), "recordProgress").code, "COMPLETED");
  const beforeReads = await counts();
  const firstResponse = await page("history", { profileId, first: 1 });
  const firstPage = payload(firstResponse, "progressHistory");
  assert.equal(firstPage.code, "COMPLETED");
  assert.equal(firstResponse.noStore, true);
  assert.doesNotMatch(
    firstResponse.text,
    /accountId|playbackSessionId|manifestUrl|aster_local_session/u,
  );
  assert.ok(firstPage.connection);
  assert.equal(firstPage.connection.edges.length, 1);
  assert.equal(firstPage.connection.pageInfo.hasNextPage, true);
  const cursor = firstPage.connection.pageInfo.endCursor;
  assert.ok(cursor);
  const secondPage = payload(
    await page("history", { profileId, first: 1, after: cursor }),
    "progressHistory",
  );
  assert.equal(secondPage.code, "COMPLETED");
  assert.ok(secondPage.connection);
  assert.equal(secondPage.connection.edges.length, 1);
  assert.equal(secondPage.connection.pageInfo.hasNextPage, false);
  const nodes = [...firstPage.connection.edges, ...secondPage.connection.edges].map(
    (edge) => edge.node,
  );
  assert.deepEqual(new Set(nodes.map((node) => node.titleId)), new Set([id(1), id(2)]));
  assert.deepEqual(
    nodes,
    [...nodes].sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id)),
  );
  for (const node of nodes) {
    assert.equal(node.title?.id, node.titleId);
    assert.equal(node.title.localized.title, "Synthetic session contract fixture");
  }
  assert.equal(
    payload(await page("continue", { profileId }), "continueWatching").connection?.edges.length,
    2,
  );
  assert.equal(
    payload(await page("history", { profileId: id(992) }), "progressHistory").code,
    "NOT_FOUND",
  );
  assert.equal(
    payload(await page("history", { profileId }, ""), "progressHistory").code,
    "UNAUTHENTICATED",
  );
  for (const rejected of [
    await page("history", { profileId, first: 21 }),
    await page("continue", { profileId, after: cursor }),
  ]) {
    assert.ok(rejected.body.errors?.length);
    assert.equal(rejected.body.data?.["progressHistory"]?.connection, undefined);
    assert.equal(rejected.body.data?.["continueWatching"]?.connection, undefined);
  }
  assert.deepEqual(await counts(), beforeReads);
  const hiddenTitle = nodes[0]?.titleId;
  const remainingTitle = nodes[1]?.titleId;
  assert.ok(hiddenTitle && remainingTitle);
  await admin.query(
    "UPDATE catalog.titles SET state = 'RETIRED', version = version + 1 WHERE id = $1",
    [hiddenTitle],
  );
  const sparse = payload(await page("continue", { profileId, first: 1 }), "continueWatching");
  assert.equal(sparse.code, "COMPLETED");
  assert.deepEqual(
    sparse.connection?.edges.map((edge) => edge.node.titleId),
    [remainingTitle],
  );
  assert.equal(sparse.connection.pageInfo.hasNextPage, false);
  await admin.query(
    "UPDATE catalog.titles SET state = 'PUBLISHED', version = version + 1 WHERE id = $1",
    [hiddenTitle],
  );
  assert.equal(
    payload(
      await record({ ...secondTitle, sequence: 2, positionMs: 6000, idempotencyKey: randomUUID() }),
      "recordProgress",
    ).code,
    "COMPLETED",
  );
  const continuing = payload(await page("continue", { profileId }), "continueWatching");
  assert.deepEqual(
    continuing.connection?.edges.map((edge) => edge.node.titleId),
    [id(1)],
  );
  const rightsClient = await admin.connect();
  try {
    await rightsClient.query("BEGIN");
    const review = { id: randomUUID(), revision: 2, status: "DISPUTED" };
    await rightsClient.query(
      "INSERT INTO catalog.rights_revisions(id, title_id, revision, status, record) SELECT $2, title_id, 2, 'DISPUTED', record || $3::jsonb FROM catalog.rights_revisions WHERE title_id = $1 AND revision = 1",
      [id(1), review.id, JSON.stringify(review)],
    );
    await rightsClient.query(
      "INSERT INTO catalog.rights_audit SELECT id, 2, version + 1, $2, $3, $4 FROM catalog.titles WHERE id = $1",
      [id(1), id(999), Math.floor(Date.now() / 1000), randomUUID()],
    );
    await rightsClient.query(
      "UPDATE catalog.titles SET latest_rights_revision = 2, version = version + 1 WHERE id = $1",
      [id(1)],
    );
    await rightsClient.query("COMMIT");
  } catch (error) {
    await rightsClient.query("ROLLBACK");
    throw error;
  } finally {
    rightsClient.release();
  }
  const disputed = payload(await page("continue", { profileId }), "continueWatching");
  assert.equal(disputed.code, "COMPLETED");
  assert.deepEqual(disputed.connection, {
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  });
  await admin.query(
    "UPDATE catalog.titles SET state = 'RETIRED', version = version + 1 WHERE id = $1",
    [id(1)],
  );
  const retired = payload(await page("history", { profileId }), "progressHistory");
  assert.equal(retired.code, "COMPLETED");
  assert.equal(retired.connection?.edges.length, 2);
  assert.equal(
    retired.connection.edges.find((edge) => edge.node.titleId === id(1))?.node.title,
    null,
  );
  const completed = retired.connection.edges.find((edge) => edge.node.titleId === id(2))?.node;
  assert.equal(completed?.status, "COMPLETED");
  assert.equal(completed.title?.id, id(2));
  const hiddenContinue = payload(await page("continue", { profileId }), "continueWatching");
  assert.equal(hiddenContinue.code, "COMPLETED");
  assert.deepEqual(hiddenContinue.connection, {
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  });
  assert.deepEqual(await counts(), { progress: 2, receipts: 5, outbox: 5 });
  emit("engagement_federated_pages", {
    pages: [1, 1],
    strictKeysetOrder: true,
    catalogMetadata: "federated_owner",
    completed: "history_only",
    retiredMetadata: null,
    retiredContinue: "excluded_before_pagination",
    hiddenGapLookahead: "passed",
    disputedRights: "excluded_before_pagination",
    foreignAndAnonymous: "denied",
    oversizedAndWrongKindCursor: "rejected",
    readWrites: 0,
  });

  assert.equal(
    payload(
      await call(
        "mutation DeleteProfile($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
        { input: { mutationId: randomUUID(), profileId, expectedVersion: 1 } },
      ),
      "deleteProfile",
    ).code,
    "COMPLETED",
  );
  assert.equal(payload(await record(input), "recordProgress").code, "NOT_FOUND");
  assert.equal(payload(await page("history", { profileId }), "progressHistory").code, "NOT_FOUND");
  assert.equal(
    payload(await call("mutation SignOut { signOut { code } }"), "signOut").code,
    "COMPLETED",
  );
  assert.equal(payload(await record(input), "recordProgress").code, "UNAUTHENTICATED");
  assert.equal(
    payload(await page("continue", { profileId }), "continueWatching").code,
    "UNAUTHENTICATED",
  );
  assert.deepEqual(await counts(), { progress: 2, receipts: 5, outbox: 5 });
  emit("engagement_federated_revocation", {
    deletedProfileAndRevokedSession: "no_disclosure",
    cleanupConsumer: "planned",
  });

  const signedAgain = await call("mutation DemoSignIn { demoSignIn { code } }");
  assert.equal(payload(signedAgain, "demoSignIn").code, "COMPLETED");
  const nextCookie = signedAgain.cookie?.[0]?.split(";")[0];
  assert.ok(nextCookie);
  cookie = nextCookie;
  const watchProfile = payload(
    await call(
      "mutation CreateProfile($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
      {
        input: {
          mutationId: randomUUID(),
          profile: { displayName: "Watchlist synthetic", locale: "pt-BR", maturity: "GENERAL" },
        },
      },
    ),
    "createProfile",
  );
  assert.equal(watchProfile.code, "COMPLETED");
  assert.ok(watchProfile.profileId);
  const watchProfileId = watchProfile.profileId;
  await seed(3);
  const playbackBefore = (await admin.query("SELECT count(*)::int AS count FROM playback.sessions"))
    .rows;
  const watchMutation =
    "mutation SetWatchlist($input:SetWatchlistInput!) { setWatchlist(input:$input) { code correlationId change { id profileId titleId present version updatedAt } } }";
  const watchQuery =
    "query Watchlist($profileId:ID!, $first:Int! = 20, $after:String) { watchlist(profileId:$profileId, first:$first, after:$after) { code correlationId connection { edges { cursor node { id titleId addedAt title { id localized { title } } } } pageInfo { endCursor hasNextPage } } } }";
  // Pace this longer proof below the unchanged four-per-second production admission rate.
  const watchCall = async (query: string, variables: object, credential = cookie) => {
    await delay(260);
    return call(query, variables, credential);
  };
  const setMember = (value: object, credential = cookie) =>
    watchCall(watchMutation, { input: value }, credential);
  const watchPage = (variables: object, credential = cookie) =>
    watchCall(watchQuery, variables, credential);
  const add = {
    profileId: watchProfileId,
    titleId: id(2),
    idempotencyKey: randomUUID(),
    present: true,
  };
  const addedResponse = await setMember(add);
  const added = payload(addedResponse, "setWatchlist");
  assert.equal(added.code, "COMPLETED");
  assert.equal(added.change?.["version"], 1);
  assert.equal(added.change["present"], true);
  assert.equal(addedResponse.noStore, true);
  assert.doesNotMatch(addedResponse.text, /accountId|manifestUrl|aster_local_session/u);
  for (const replay of await Promise.all([setMember(add), setMember(add)])) {
    assert.deepEqual(payload(replay, "setWatchlist").change, added.change);
  }
  assert.equal(
    payload(await setMember({ ...add, titleId: id(3) }), "setWatchlist").code,
    "CONFLICT",
  );
  assert.equal(
    payload(await setMember({ ...add, present: false }), "setWatchlist").code,
    "CONFLICT",
  );
  const otherAdd = { ...add, titleId: id(3), idempotencyKey: randomUUID() };
  assert.equal(payload(await setMember(otherAdd), "setWatchlist").change?.["version"], 2);
  const watchFirstResponse = await watchPage({ profileId: watchProfileId, first: 1 });
  const watchFirst = payload(watchFirstResponse, "watchlist");
  assert.equal(watchFirst.code, "COMPLETED");
  assert.equal(watchFirstResponse.noStore, true);
  assert.ok(watchFirst.connection);
  assert.equal(watchFirst.connection.edges.length, 1);
  assert.equal(watchFirst.connection.pageInfo.hasNextPage, true);
  const watchCursor = watchFirst.connection.pageInfo.endCursor;
  assert.ok(watchCursor);
  const watchSecond = payload(
    await watchPage({ profileId: watchProfileId, first: 1, after: watchCursor }),
    "watchlist",
  );
  assert.equal(watchSecond.code, "COMPLETED");
  assert.equal(watchSecond.connection?.edges.length, 1);
  assert.equal(watchSecond.connection.pageInfo.hasNextPage, false);
  const watchNodes = [...watchFirst.connection.edges, ...watchSecond.connection.edges].map(
    (edge) => edge.node,
  );
  assert.deepEqual(new Set(watchNodes.map((node) => node.titleId)), new Set([id(2), id(3)]));
  for (const node of watchNodes) {
    assert.equal(node.title?.id, node.titleId);
    assert.equal(node.title.localized.title, "Synthetic session contract fixture");
  }
  const retiredWatchTitle = watchNodes[0]?.titleId;
  const visibleWatchTitle = watchNodes[1]?.titleId;
  assert.ok(retiredWatchTitle && visibleWatchTitle);
  await admin.query("UPDATE catalog.titles SET state='RETIRED', version=version+1 WHERE id=$1", [
    retiredWatchTitle,
  ]);
  const filtered = payload(await watchPage({ profileId: watchProfileId, first: 1 }), "watchlist");
  assert.equal(filtered.code, "COMPLETED");
  assert.deepEqual(
    filtered.connection?.edges.map((edge) => edge.node.titleId),
    [visibleWatchTitle],
  );
  assert.equal(filtered.connection.pageInfo.hasNextPage, false);
  assert.equal(
    payload(
      await setMember({ ...add, titleId: retiredWatchTitle, idempotencyKey: randomUUID() }),
      "setWatchlist",
    ).code,
    "NOT_VISIBLE",
  );
  assert.deepEqual(payload(await setMember(add), "setWatchlist").change, added.change);
  const removeHidden = {
    ...add,
    titleId: retiredWatchTitle,
    present: false,
    idempotencyKey: randomUUID(),
  };
  assert.equal(payload(await setMember(removeHidden), "setWatchlist").change?.["version"], 3);
  assert.equal(
    payload(
      await setMember({
        ...removeHidden,
        titleId: visibleWatchTitle,
        idempotencyKey: randomUUID(),
      }),
      "setWatchlist",
    ).change?.["version"],
    4,
  );
  assert.deepEqual(payload(await setMember(add), "setWatchlist").change, added.change);
  assert.deepEqual(
    payload(await watchPage({ profileId: watchProfileId }), "watchlist").connection,
    { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  );
  for (const [foreign, credential, expected] of [
    [id(992), cookie, "NOT_FOUND"],
    [watchProfileId, "", "UNAUTHENTICATED"],
  ] as const) {
    assert.equal(
      payload(await watchPage({ profileId: foreign }, credential), "watchlist").code,
      expected,
    );
    assert.equal(
      payload(await setMember({ ...add, profileId: foreign }, credential), "setWatchlist").code,
      expected,
    );
  }
  const watchStored = (
    await admin.query<{ heads: number; entries: number; receipts: number; outbox: number }>(
      "SELECT (SELECT count(*)::int FROM engagement.watchlists WHERE profile_id=$1) AS heads, (SELECT count(*)::int FROM engagement.watchlist_entries WHERE profile_id=$1) AS entries, (SELECT count(*)::int FROM engagement.watchlist_receipts WHERE profile_id=$1) AS receipts, (SELECT count(*)::int FROM engagement.outbox WHERE profile_id=$1) AS outbox",
      [watchProfileId],
    )
  ).rows[0];
  assert.deepEqual(watchStored, { heads: 1, entries: 0, receipts: 4, outbox: 4 });
  assert.deepEqual(await counts(), { progress: 2, receipts: 5, outbox: 9 });
  assert.deepEqual(
    (await admin.query("SELECT count(*)::int AS count FROM playback.sessions")).rows,
    playbackBefore,
  );
  emit("engagement_federated_watchlist", {
    currentIdentityAndCatalog: true,
    federatedMetadata: true,
    concurrentReplay: "original_result",
    oppositeCommandReplay: "original_result",
    titleAndActionConflict: "rejected",
    pages: [1, 1],
    retired: "filtered_before_pagination",
    hiddenRemoval: "completed",
    foreignAndAnonymous: "denied",
    ...watchStored,
    playbackWrites: 0,
  });
  await admin.query("UPDATE catalog.titles SET state='PUBLISHED', version=version+1 WHERE id=$1", [
    retiredWatchTitle,
  ]);
  assert.equal(
    payload(
      await call(
        "mutation DeleteProfile($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
        { input: { mutationId: randomUUID(), profileId: watchProfileId, expectedVersion: 1 } },
      ),
      "deleteProfile",
    ).code,
    "COMPLETED",
  );
  assert.equal(payload(await setMember(add), "setWatchlist").code, "NOT_FOUND");
  assert.equal(
    payload(await watchPage({ profileId: watchProfileId }), "watchlist").code,
    "NOT_FOUND",
  );
  assert.equal(
    payload(await call("mutation SignOut { signOut { code } }"), "signOut").code,
    "COMPLETED",
  );
  assert.equal(payload(await setMember(add), "setWatchlist").code, "UNAUTHENTICATED");
  emit("engagement_watchlist_revocation", {
    deletedProfileAndRevokedSession: "no_disclosure",
    cleanupConsumer: "planned",
  });
} finally {
  await admin.end();
}
