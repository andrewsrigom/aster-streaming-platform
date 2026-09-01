import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { request } from "node:http";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";

assert.match(process.env["ASTER_FIXTURE_ID"] ?? "", /^aster-engagement-proof-[a-f0-9-]{36}$/u);
const mode = process.env["ASTER_QUERY_COUNT_MODE"];
assert.ok(mode === "setup" || mode === "measure");
const measuredProfileId = process.env["ASTER_QUERY_COUNT_PROFILE_ID"] ?? "";
if (mode === "setup") {
  assert.equal(measuredProfileId, "");
} else {
  assert.match(
    measuredProfileId,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
  );
}
const operation = JSON.parse(
  Buffer.from(process.env["ASTER_QUERY_COUNT_OPERATION"] ?? "", "base64").toString("utf8"),
) as { body: string; id: string; name: string; type: string };
assert.deepEqual(Object.keys(operation).sort(), ["body", "id", "name", "type"]);
assert.equal(operation.name, "ContinueWatching");
assert.equal(operation.type, "query");
assert.equal(createHash("sha256").update(operation.body).digest("hex"), operation.id);
const countSql = Buffer.from(process.env["ASTER_QUERY_COUNT_SQL"] ?? "", "base64").toString("utf8");
assert.match(countSql, /pg_stat_statements/u);

interface GraphResult {
  data?: Record<
    string,
    {
      code: string;
      profileId?: string;
      session?: { id: string } | null;
      connection?: { edges: unknown[] } | null;
    }
  >;
  errors?: unknown[];
}

async function post(body: object, cookie = "") {
  return new Promise<{ body: GraphResult; cookie: readonly string[] | undefined }>(
    (resolve, reject) => {
      const encoded = JSON.stringify(body);
      const outgoing = request(
        {
          hostname: "router",
          port: 4000,
          path: "/graphql",
          method: "POST",
          agent: false,
          signal: AbortSignal.timeout(4_000),
          headers: {
            host: "127.0.0.1:4000",
            origin: "http://127.0.0.1:4000",
            "x-aster-csrf": "1",
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(encoded)),
            ...(cookie ? { cookie } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on("error", reject);
          response.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 16_384) {
              response.destroy(new Error("Query-count response exceeded bound."));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            assert.equal(response.statusCode, 200);
            resolve({
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as GraphResult,
              cookie: response.headers["set-cookie"],
            });
          });
        },
      );
      outgoing.on("error", reject);
      outgoing.end(encoded);
    },
  );
}

const admin = new Pool({
  host: "postgres",
  port: 5432,
  database: "aster",
  user: "aster",
  password: "aster-test-only",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 2_000,
  query_timeout: 2_500,
});
admin.on("error", () => undefined);

try {
  const signed = await post({ query: "mutation DemoSignIn { demoSignIn { code } }" });
  assert.equal(signed.body.errors, undefined);
  assert.equal(signed.body.data?.["demoSignIn"]?.code, "COMPLETED");
  const cookie = signed.cookie?.[0]?.split(";")[0];
  assert.ok(cookie);
  const call = (query: string, variables: object = {}) =>
    post(
      {
        query,
        operationName: /^(?:query|mutation)\s+(\w+)/u.exec(query)?.[1],
        variables,
      },
      cookie,
    );
  if (mode === "setup") {
    const created = await call(
      "mutation CreateProfile($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
      {
        input: {
          mutationId: randomUUID(),
          profile: { displayName: "Query count", locale: "pt-BR", maturity: "GENERAL" },
        },
      },
    );
    assert.equal(created.body.errors, undefined);
    const profileId = created.body.data?.["createProfile"]?.profileId;
    assert.ok(profileId);
    const progress =
      "mutation RecordProgress($input:RecordProgressInput!) { recordProgress(input:$input) { code } }";
    for (const titleId of [
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]) {
      const started = await call(
        "mutation StartPlayback($titleId:ID!) { createPlaybackSession(titleId:$titleId) { code session { id } } }",
        { titleId },
      );
      assert.equal(started.body.errors, undefined);
      const session = started.body.data?.["createPlaybackSession"]?.session;
      assert.ok(session);
      const recorded = await call(progress, {
        input: {
          profileId,
          titleId,
          playbackSessionId: session.id,
          idempotencyKey: randomUUID(),
          sequence: 1,
          positionMs: 1_000,
          durationMs: 6_000,
          occurredAt: Math.floor(Date.now() / 1_000),
        },
      });
      assert.equal(recorded.body.errors, undefined);
      assert.equal(recorded.body.data?.["recordProgress"]?.code, "COMPLETED");
    }
    process.stdout.write(
      JSON.stringify({ event: "phase13_query_count_control", profileId }) +
        "\n" +
        JSON.stringify({ event: "phase13_query_count_fixture", activeTitles: 2 }) +
        "\n",
    );
    process.exitCode = 0;
  } else {
    const profile = await admin.query<{ profile_id: string; titles: number }>(
      `SELECT profile_id::text, count(DISTINCT title_id)::int AS titles
      FROM engagement.progress WHERE status='IN_PROGRESS' AND profile_id=$1
      GROUP BY profile_id HAVING count(DISTINCT title_id)=2`,
      [measuredProfileId],
    );
    assert.equal(profile.rowCount, 1);
    const selectedProfile = profile.rows[0];
    assert.ok(selectedProfile);
    assert.equal(selectedProfile.titles, 2);
    await admin.query("SELECT pg_stat_statements_reset()");
    const startedAt = performance.now();
    const measured = await post(
      {
        query: operation.body,
        operationName: operation.name,
        variables: { profileId: selectedProfile.profile_id },
      },
      cookie,
    );
    const durationMs = Number((performance.now() - startedAt).toFixed(3));
    assert.equal(measured.body.errors, undefined);
    const continuePayload = measured.body.data?.["continueWatching"];
    assert.ok(continuePayload);
    assert.equal(continuePayload.code, "COMPLETED");
    assert.equal(continuePayload.connection?.edges.length, 2);
    const counted = await admin.query<{ counts: Record<string, number> }>(countSql);
    const observed = counted.rows[0]?.counts ?? {};
    const maximumByOwner = { catalog: 3, engagement: 1, identity: 3 } as const;
    const perOwner = Object.fromEntries(
      Object.keys(maximumByOwner).map((owner) => [owner, observed[owner]]),
    );
    let queries = 0;
    for (const [owner, maximum] of Object.entries(maximumByOwner)) {
      const count = perOwner[owner];
      if (count === undefined) {
        throw new Error(`Missing ${owner} query count.`);
      }
      assert.ok(
        Number.isSafeInteger(count) && count >= 1 && count <= maximum,
        `${owner} query count ${String(count)} exceeds 1..${String(maximum)}`,
      );
      queries += count;
    }
    process.stdout.write(
      JSON.stringify({
        event: "phase13_federated_query_count",
        operation: operation.name,
        operationId: operation.id,
        mode: "exact_trusted_document_through_router",
        workload: "two owned in-progress titles, first 20, current Catalog visibility",
        queries,
        perOwner,
        nonParticipantOwnerActivityExcluded: Object.keys(observed)
          .filter((owner) => !(owner in maximumByOwner))
          .sort(),
        durationMs,
        limitation: "single disposable local observation; not a throughput or SLO claim",
      }) + "\n",
    );
  }
} finally {
  await admin.end();
}
