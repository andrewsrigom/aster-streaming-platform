import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";

assert.match(process.env["ASTER_FIXTURE_ID"] ?? "", /^aster-engagement-proof-[a-f0-9-]{36}$/u);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
interface Entity {
  id: string;
  localized?: { title: string };
  progress: null | { positionMs: number; durationMs: number; status: string };
  inWatchlist: boolean | null;
}
interface Result {
  data?: Record<
    string,
    {
      code: string;
      profileId?: string;
      session?: { id: string };
      edges?: { node: Entity }[];
      id?: string;
      progress?: Entity["progress"];
      inWatchlist?: boolean | null;
    } | null
  >;
  errors?: unknown[];
  extensions?: { apolloQueryPlan?: unknown };
}
let cookie = "";
async function call(query: string, variables: object = {}, credential = cookie, plan = false) {
  // Stay below the existing four-per-second Engagement rate, without a proof exemption.
  await delay(260);
  return new Promise<{ body: Result; cookie?: string[] }>((resolve, reject) => {
    const body = JSON.stringify({
      query,
      variables,
      operationName: /^(?:query|mutation)\s+(\w+)/u.exec(query)?.[1],
    });
    const outgoing = request(
      "http://router:4000/graphql",
      {
        method: "POST",
        signal: AbortSignal.timeout(4000),
        maxHeaderSize: 8192,
        headers: {
          host: "127.0.0.1:4000",
          origin: "http://127.0.0.1:4000",
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          ...(credential ? { cookie: credential } : {}),
          ...(plan ? { "apollo-expose-query-plan": "true" } : {}),
        },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 32768) {
            incoming.destroy(new Error("Fields proof response exceeded bound."));
          } else {
            chunks.push(chunk);
          }
        });
        incoming.on("error", reject);
        incoming.on("end", () => {
          try {
            assert.equal(incoming.statusCode, 200);
            const text = Buffer.concat(chunks).toString("utf8");
            assert.doesNotMatch(text, /stacktrace|playbackSessionId|aster_local_session=/u);
            resolve({
              body: JSON.parse(text) as Result,
              ...(incoming.headers["set-cookie"] ? { cookie: incoming.headers["set-cookie"] } : {}),
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Invalid fields proof response."));
          }
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}
const titlesQuery = `query TitlesWithEngagement($profileId:ID!, $first:Int! = 20) {
  titles(first:$first) { edges { node { id localized { title }
    progress(profileId:$profileId) { positionMs durationMs status updatedAt }
    inWatchlist(profileId:$profileId)
  } } pageInfo { hasNextPage } }
}`;
const profileQuery = `query ProfileWithEngagement($profileId:ID!, $titleId:ID!) {
  profile(id:$profileId) { id progress(titleId:$titleId) { positionMs durationMs status updatedAt } inWatchlist(titleId:$titleId) }
}`;
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
const emit = (event: string, facts: object) =>
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
const counts = async () =>
  (
    await admin.query<{ progress: number; memberships: number; events: number }>(`SELECT
  (SELECT count(*)::integer FROM engagement.progress) AS progress,
  (SELECT count(*)::integer FROM engagement.watchlist_entries) AS memberships,
  (SELECT count(*)::integer FROM engagement.outbox) AS events`)
  ).rows;
const accepted = (result: Awaited<ReturnType<typeof call>>, field: string) => {
  assert.equal(result.body.errors, undefined);
  const value = result.body.data?.[field];
  assert.ok(value);
  assert.equal(value.code, "COMPLETED");
  return value;
};
try {
  const signed = await call("mutation DemoSignIn { demoSignIn { code } }");
  accepted(signed, "demoSignIn");
  cookie = signed.cookie?.[0]?.split(";")[0] ?? "";
  assert.ok(cookie);
  const profileId = accepted(
    await call(
      "mutation CreateProfile($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
      {
        input: {
          mutationId: randomUUID(),
          profile: { displayName: "Fields synthetic", locale: "pt-BR", maturity: "GENERAL" },
        },
      },
    ),
    "createProfile",
  ).profileId;
  assert.ok(profileId);
  const session = accepted(
    await call(
      "mutation StartPlayback($titleId:ID!) { createPlaybackSession(titleId:$titleId) { code session { id } } }",
      { titleId: id(2) },
    ),
    "createPlaybackSession",
  ).session;
  assert.ok(session);
  accepted(
    await call(
      "mutation RecordProgress($input:RecordProgressInput!) { recordProgress(input:$input) { code } }",
      {
        input: {
          profileId,
          titleId: id(2),
          playbackSessionId: session.id,
          idempotencyKey: randomUUID(),
          sequence: 1,
          positionMs: 1000,
          durationMs: 6000,
          occurredAt: Math.floor(Date.now() / 1000),
        },
      },
    ),
    "recordProgress",
  );
  accepted(
    await call(
      "mutation SetWatchlist($input:SetWatchlistInput!) { setWatchlist(input:$input) { code } }",
      {
        input: {
          profileId,
          titleId: id(2),
          idempotencyKey: randomUUID(),
          present: true,
        },
      },
    ),
    "setWatchlist",
  );
  const before = await counts();
  const titles = await call(titlesQuery, { profileId }, cookie, true);
  assert.equal(titles.body.errors, undefined);
  const nodes = titles.body.data?.["titles"]?.edges?.map((edge) => edge.node);
  assert.ok(nodes && nodes.length >= 2);
  const saved = nodes.find((node) => node.id === id(2));
  assert.ok(saved?.localized?.title);
  assert.equal(saved.progress?.positionMs, 1000);
  assert.equal(saved.inWatchlist, true);
  const absent = nodes.find((node) => node.id === id(3));
  assert.ok(absent);
  assert.equal(absent.progress, null);
  assert.equal(absent.inWatchlist, false);
  const titlePlan = titles.body.extensions?.apolloQueryPlan;
  assert.ok(titlePlan);
  assert.match(JSON.stringify(titlePlan), /catalog/u);
  assert.match(JSON.stringify(titlePlan), /engagement/u);
  assert.match(JSON.stringify(titlePlan), /_entities/u);
  const profile = await call(profileQuery, { profileId, titleId: id(2) }, cookie, true);
  assert.equal(profile.body.errors, undefined);
  assert.equal(profile.body.data?.["profile"]?.progress?.positionMs, 1000);
  assert.equal(profile.body.data["profile"].inWatchlist, true);
  const profilePlan = profile.body.extensions?.apolloQueryPlan;
  assert.ok(profilePlan);
  assert.match(JSON.stringify(profilePlan), /identity/u);
  assert.match(JSON.stringify(profilePlan), /engagement/u);
  emit("engagement_fields_federated_plans", { titlePlan, profilePlan });
  const anonymous = await call(titlesQuery, { profileId }, "");
  assert.ok(anonymous.body.errors?.length);
  const publicNodes = anonymous.body.data?.["titles"]?.edges?.map((edge) => edge.node);
  assert.ok(publicNodes?.length);
  assert.ok(
    publicNodes.every(
      (node) => node.localized?.title && node.progress === null && node.inWatchlist === null,
    ),
  );
  const foreign = await call(titlesQuery, { profileId: randomUUID() });
  assert.ok(foreign.body.errors?.length);
  assert.ok(
    foreign.body.data?.["titles"]?.edges?.every(
      ({ node }) => node.progress === null && node.inWatchlist === null,
    ),
  );
  await admin.query("UPDATE catalog.titles SET state='RETIRED', version=version+1 WHERE id=$1", [
    id(2),
  ]);
  const retired = await call(profileQuery, { profileId, titleId: id(2) });
  assert.equal(retired.body.errors, undefined);
  assert.equal(retired.body.data?.["profile"]?.progress?.positionMs, 1000);
  assert.equal(retired.body.data["profile"].inWatchlist, false);
  await admin.query("UPDATE catalog.titles SET state='PUBLISHED', version=version+1 WHERE id=$1", [
    id(2),
  ]);
  assert.deepEqual(await counts(), before);
  accepted(
    await call(
      "mutation DeleteProfile($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
      {
        input: { mutationId: randomUUID(), profileId, expectedVersion: 1 },
      },
    ),
    "deleteProfile",
  );
  const deleted = await call(titlesQuery, { profileId });
  assert.ok(deleted.body.errors?.length);
  assert.ok(
    deleted.body.data?.["titles"]?.edges?.every(
      ({ node }) => node.progress === null && node.inWatchlist === null,
    ),
  );
  accepted(await call("mutation SignOut { signOut { code } }"), "signOut");
  const revoked = await call(titlesQuery, { profileId });
  assert.ok(revoked.body.errors?.length);
  emit("engagement_fields_federated", {
    titleAndProfile: "passed",
    ownership: "current Identity",
    anonymousCatalog: "available",
    optionalFields: "null_on_denial",
    currentRetirement: "membership_false_progress_retained",
    missingPair: "null_progress_false_membership",
    deletedAndRevoked: "no_disclosure",
    readWrites: 0,
  });
} finally {
  await admin.end();
}
