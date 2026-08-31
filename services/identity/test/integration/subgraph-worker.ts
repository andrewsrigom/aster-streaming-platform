import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { loadReferenceRuntimeConfig } from "@aster/config";
import { createAsterRedisAdapter } from "@aster/redis";
import { createAsterLogger } from "@aster/runtime";
import { createAsterTelemetry } from "@aster/telemetry";
import { Client } from "pg";

import { createIdentityServiceWithFactories } from "../../src/create-service.js";
import { migrateLocalIdentity } from "../../src/infrastructure/persistence/local-migrations.js";
import type { AsterIdentityRuntime } from "../../src/reference-runtime.js";

const postgresPort = Number(process.argv[3]);
const redisPort = Number(process.argv[4]);
assert.ok(
  [postgresPort, redisPort].every(
    (port) => Number.isSafeInteger(port) && port >= 1024 && port <= 65535,
  ),
);
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const address = reservation.address();
assert.ok(address && typeof address === "object");
const httpPort = address.port;
await new Promise<void>((resolve, reject) => {
  reservation.close((error) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
});
const origin = `http://127.0.0.1:${httpPort}`;
const databaseUrl = new URL(`postgresql://127.0.0.1:${postgresPort}/aster`);
databaseUrl.username = "aster";
databaseUrl.password = "aster-test-only";
const environment = {
  ASTER_ENV: "local",
  ASTER_HTTP_HOST: "127.0.0.1",
  ASTER_HTTP_PORT: String(httpPort),
  ASTER_SERVICE_NAME: "identity-subgraph-integration",
  ASTER_STARTUP_DEADLINE_MS: "5000",
  ASTER_LOCAL_DEMO_ENABLED: "true",
  ASTER_PUBLIC_ORIGIN: origin,
  DATABASE_URL: databaseUrl.toString(),
  REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
};
const adminConfiguration = loadReferenceRuntimeConfig(Object.entries(environment));
const admin = new Client({
  connectionString: databaseUrl.toString(),
  connectionTimeoutMillis: 1_000,
  query_timeout: 2_500,
  statement_timeout: 2_000,
});
admin.on("error", () => undefined);
databaseUrl.username = "aster_identity_local";
const runtimeEnvironment = { ...environment, DATABASE_URL: databaseUrl.toString() };
let now = 1_787_814_000;
const logs: string[] = [];
const services: AsterIdentityRuntime[] = [];
const output = (event: string, details: Record<string, unknown> = {}): void => {
  process.stdout.write(JSON.stringify({ event, ...details }) + "\n");
};
const signal = (): AbortSignal => AbortSignal.timeout(10_000);
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
async function start(configuration = runtimeEnvironment) {
  const service = await createIdentityServiceWithFactories(Object.entries(configuration), {
    clock: () => ({ now: () => new Date(now * 1_000) }),
    logger: (options) =>
      createAsterLogger({
        ...options,
        destination: {
          write: (line) => {
            logs.push(line);
          },
        },
      }),
  });
  services.push(service);
  const started = await service.start();
  return { service, started };
}
interface GraphqlReply {
  readonly data?: Record<string, unknown>;
  readonly errors?: { extensions: { code: string }; message: string }[];
}
async function send(query: string, variables: Record<string, unknown> = {}, cookie = "") {
  const response = await fetch(origin + "/graphql", {
    method: "POST",
    headers: {
      origin,
      "x-aster-csrf": "1",
      "content-type": "application/json",
      connection: "close",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  assert.equal(/postgres|signature|credentialDigest|stacktrace|node_modules/u.test(text), false);
  return {
    status: response.status,
    json: JSON.parse(text) as GraphqlReply,
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? "",
    requestId: response.headers.get("x-request-id"),
  };
}
function payload(reply: Awaited<ReturnType<typeof send>>, field: string) {
  assert.equal(reply.status, 200);
  assert.equal(reply.json.errors, undefined);
  const value = reply.json.data?.[field];
  assert.ok(typeof value === "object" && value !== null);
  return value as Record<string, unknown>;
}
const signInQuery = "mutation SignIn { demoSignIn { code viewer { accountId expiresAt } } }";
const listQuery =
  "query Owned { profiles { profiles { id displayName version } activeProfileId } }";
const createQuery =
  "mutation Create($input:CreateProfileInput!) { createProfile(input:$input) { code profileId version } }";
const updateQuery =
  "mutation Update($input:UpdateProfileInput!) { updateProfile(input:$input) { code profileId version } }";
const deleteQuery =
  "mutation Delete($input:DeleteProfileInput!) { deleteProfile(input:$input) { code profileId version } }";
const preferences = {
  displayName: "  Cine\u0301ma   viewer ",
  locale: "pt-br",
  maturity: "GENERAL",
};
const createInput = () => ({ mutationId: randomUUID(), profile: preferences });
let ownsSchema = false;

try {
  await admin.connect();
  const empty = await admin.query<{ schema: string | null }>(
    "SELECT to_regnamespace('identity')::text AS schema",
  );
  assert.equal(empty.rows[0]?.schema, null, "This worker must start on a new isolated fixture.");
  await admin.query("SELECT pg_advisory_lock(42781, 2)");
  await assert.rejects(migrateLocalIdentity(adminConfiguration, signal()), {
    message: "Local Identity migration did not complete.",
  });
  await admin.query("SELECT pg_advisory_unlock(42781, 2)");
  ownsSchema = true;
  assert.deepEqual(await migrateLocalIdentity(adminConfiguration, signal()), {
    applied: [1, 2, 3],
  });
  assert.deepEqual(await migrateLocalIdentity(adminConfiguration, signal()), { applied: [] });
  await admin.query("INSERT INTO identity.schema_migrations(version) VALUES (4)");
  await assert.rejects(migrateLocalIdentity(adminConfiguration, signal()));
  await admin.query("DELETE FROM identity.schema_migrations WHERE version = 4");
  output("identity_local_bootstrap", {
    emptyState: "passed",
    repeat: "no-op",
    concurrentMigration: "rejected",
    unknownVersion: "rejected",
  });

  const elevated = await start(environment);
  assert.deepEqual(elevated.started, { status: "started", readiness: "not_ready" });
  const unavailable = await send(signInQuery);
  assert.deepEqual(
    {
      health: elevated.service.health(),
      status: unavailable.status,
      code: unavailable.json.errors?.[0]?.extensions.code,
    },
    {
      health: {
        liveness: "live",
        phase: "ready",
        readiness: "not_ready",
        reason: "dependency_unavailable",
      },
      status: 503,
      code: "UNAVAILABLE",
    },
  );
  assert.equal((await elevated.service.shutdown()).outcome, "completed");
  const first = await start();
  assert.deepEqual(first.started, { status: "started", readiness: "ready" });
  const signed = await send(signInQuery);
  assert.equal(payload(signed, "demoSignIn")["code"], "COMPLETED");
  assert.ok(signed.cookie);
  const viewer = payload(signed, "demoSignIn")["viewer"] as { accountId: string };
  const cookie = signed.cookie;
  assert.deepEqual(payload(await send(listQuery, {}, cookie), "profiles"), {
    profiles: [],
    activeProfileId: null,
  });

  const duplicate = createInput();
  const repeated = await Promise.all(
    Array.from({ length: 8 }, () => send(createQuery, { input: duplicate }, cookie)),
  );
  const created = payload(repeated[0] as Awaited<ReturnType<typeof send>>, "createProfile");
  assert.equal(created["code"], "COMPLETED");
  assert.ok(
    repeated.every(
      (reply) => JSON.stringify(payload(reply, "createProfile")) === JSON.stringify(created),
    ),
  );
  const profileId = String(created["profileId"]);
  const atLimit = await Promise.all(
    Array.from({ length: 8 }, () => send(createQuery, { input: createInput() }, cookie)),
  );
  assert.equal(
    atLimit.filter((reply) => payload(reply, "createProfile")["code"] === "COMPLETED").length,
    4,
  );
  assert.equal(
    atLimit.filter((reply) => payload(reply, "createProfile")["code"] === "LIMIT_EXCEEDED").length,
    4,
  );
  const listed = payload(await send(listQuery, {}, cookie), "profiles")["profiles"] as {
    displayName: string;
  }[];
  assert.equal(listed.length, 5);
  assert.ok(listed.every((item) => item.displayName === "Cinéma viewer"));
  const events = await admin.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM identity.profile_outbox",
  );
  assert.equal(events.rows[0]?.count, 5);
  const accountDigest = digest(viewer.accountId);
  const requestDigest = digest(
    JSON.stringify([
      "create",
      null,
      null,
      {
        displayName: "Cinéma viewer",
        locale: "pt-BR",
        maturity: "GENERAL",
        avatarRef: null,
      },
    ]),
  );
  const admissionDigest = digest(`profile_mutation\0${duplicate.mutationId}\0${requestDigest}`);
  const keyPrefix = `aster:local:identity:rate:v1:profile_mutation:${accountDigest}`;
  const bucketKey = `${keyPrefix}:bucket`;
  const admissionKey = `${keyPrefix}:admission:${admissionDigest}`;
  const controlTelemetry = createAsterTelemetry({
    serviceName: "identity-subgraph-redis-control",
    serviceVersion: "0.0.0",
    environment: "test",
    export: { mode: "none" },
  });
  const redisControl = createAsterRedisAdapter({
    url: environment.REDIS_URL,
    telemetry: controlTelemetry,
    maxInFlightCommands: 1,
    operationTimeoutMs: 1_000,
  });
  let markerRemoved = false;
  try {
    assert.equal((await redisControl.connect(signal())).status, "completed");
    const bucket = await redisControl.read(bucketKey, signal());
    assert.equal(bucket.status, "completed");
    assert.notEqual(bucket.value, null, "The shared mutation bucket must remain exhausted.");
    const marker = await redisControl.read(admissionKey, signal());
    assert.equal(marker.status, "completed");
    const removed = await redisControl.delete(admissionKey, signal());
    assert.equal(removed.status, "completed");
    markerRemoved = marker.value !== null && removed.deleted;
    assert.deepEqual(
      payload(await send(createQuery, { input: duplicate }, cookie), "createProfile"),
      created,
    );
    assert.deepEqual(await redisControl.read(admissionKey, signal()), {
      status: "completed",
      value: null,
    });
  } finally {
    assert.equal((await redisControl.close(signal())).status, "completed");
    assert.equal((await controlTelemetry.shutdown(signal())).status, "completed");
  }
  output("identity_graphql_concurrency", {
    duplicateRequests: 8,
    duplicateFacts: 1,
    limitRequests: 8,
    admitted: 4,
    rejected: 4,
    profiles: 5,
    durableReplayAfterAdmissionMarker: "passed",
    markerRemoved,
  });
  await delay(1_250, undefined, { signal: signal() });

  const foreignAccount = randomUUID();
  const foreignProfile = randomUUID();
  await admin.query(
    "INSERT INTO identity.accounts(id, issuer, subject) VALUES ($1, 'urn:test:foreign', 'synthetic-foreign')",
    [foreignAccount],
  );
  await admin.query(
    "INSERT INTO identity.profiles(id, account_id, slot, display_name, locale, maturity, avatar_ref, version) VALUES ($1,$2,1,'Foreign synthetic','pt-BR','GENERAL',NULL,1)",
    [foreignProfile, foreignAccount],
  );
  const foreignRead = await send(
    "query Q($id:ID!) { profile(id:$id) { id } activeProfile(id:$id) { id } }",
    { id: foreignProfile },
    cookie,
  );
  assert.deepEqual(foreignRead.json.data, { profile: null, activeProfile: null });
  const foreignUpdate = await send(
    updateQuery,
    {
      input: {
        mutationId: randomUUID(),
        profileId: foreignProfile,
        expectedVersion: 1,
        profile: preferences,
      },
    },
    cookie,
  );
  assert.equal(payload(foreignUpdate, "updateProfile")["code"], "NOT_FOUND");
  const foreignDelete = await send(
    deleteQuery,
    { input: { mutationId: randomUUID(), profileId: foreignProfile, expectedVersion: 1 } },
    cookie,
  );
  assert.equal(payload(foreignDelete, "deleteProfile")["code"], "NOT_FOUND");
  const refs = [
    { __typename: "Profile", id: foreignProfile },
    { __typename: "Profile", id: profileId, displayName: "Injected" },
  ];
  const entities = await send(
    "query Entities($refs:[_Any!]!) { _entities(representations:$refs) { ... on Profile { id displayName } } }",
    { refs },
    cookie,
  );
  assert.deepEqual(entities.json.data?.["_entities"], [
    null,
    { id: profileId, displayName: "Cinéma viewer" },
  ]);

  const select = "mutation Select($id:ID!) { selectProfile(id:$id) { code profile { id } } }";
  assert.equal(
    payload(await send(select, { id: foreignProfile }, cookie), "selectProfile")["code"],
    "NOT_FOUND",
  );
  assert.equal(
    payload(await send(select, { id: profileId }, cookie), "selectProfile")["code"],
    "COMPLETED",
  );
  assert.equal(
    payload(await send(listQuery, {}, cookie), "profiles")["activeProfileId"],
    profileId,
  );
  await delay(2_750, undefined, { signal: signal() });

  const updateInput = {
    mutationId: randomUUID(),
    profileId,
    expectedVersion: 1,
    profile: { ...preferences, displayName: "Updated synthetic" },
  };
  assert.equal(
    payload(await send(updateQuery, { input: updateInput }, cookie), "updateProfile")["version"],
    2,
  );
  assert.equal(
    payload(
      await send(updateQuery, { input: { ...updateInput, mutationId: randomUUID() } }, cookie),
      "updateProfile",
    )["code"],
    "CONFLICT",
  );
  const bad = await send(
    updateQuery,
    {
      input: {
        ...updateInput,
        mutationId: randomUUID(),
        profile: { ...preferences, displayName: "" },
      },
    },
    cookie,
  );
  assert.equal(payload(bad, "updateProfile")["code"], "INVALID_INPUT");

  await admin.query("BEGIN");
  await admin.query("SELECT id FROM identity.accounts WHERE id = $1 FOR UPDATE", [
    viewer.accountId,
  ]);
  const blocked = await send(
    updateQuery,
    { input: { ...updateInput, mutationId: randomUUID(), expectedVersion: 2 } },
    cookie,
  );
  assert.equal(payload(blocked, "updateProfile")["code"], "UNAVAILABLE");
  await admin.query("ROLLBACK");
  const deletion = { mutationId: randomUUID(), profileId, expectedVersion: 2 };
  const deleted = payload(await send(deleteQuery, { input: deletion }, cookie), "deleteProfile");
  assert.equal(deleted["code"], "COMPLETED");
  assert.deepEqual(
    payload(await send(deleteQuery, { input: deletion }, cookie), "deleteProfile"),
    deleted,
  );
  assert.equal(payload(await send(listQuery, {}, cookie), "profiles")["activeProfileId"], null);
  assert.equal(
    (
      await admin.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM identity.profile_outbox",
      )
    ).rows[0]?.count,
    7,
  );
  output("identity_graphql_ownership", {
    foreignReadWriteDeleteSelect: "rejected",
    entitySubstitution: "rejected",
    optimisticConflict: "passed",
    deadline: "failed-closed",
    deletionReplay: "passed",
    outboxFacts: 7,
  });

  const logout = await send("mutation Logout { signOut { code } }", {}, cookie);
  assert.equal(payload(logout, "signOut")["code"], "COMPLETED");
  assert.equal(
    (await send(listQuery, {}, cookie)).json.errors?.[0]?.extensions.code,
    "UNAUTHENTICATED",
  );
  const expires = await send(signInQuery);
  now += 1_801;
  assert.equal(
    (await send(listQuery, {}, expires.cookie)).json.errors?.[0]?.extensions.code,
    "UNAUTHENTICATED",
  );
  const beforeRestart = await send(signInQuery);
  assert.equal((await first.service.shutdown()).outcome, "completed");
  assert.deepEqual(await migrateLocalIdentity(adminConfiguration, signal()), { applied: [] });
  const restarted = await start();
  assert.deepEqual(restarted.started, { status: "started", readiness: "ready" });
  assert.equal(
    (await send(listQuery, {}, beforeRestart.cookie)).json.errors?.[0]?.extensions.code,
    "UNAUTHENTICATED",
  );
  const restored = await send(signInQuery);
  assert.deepEqual(payload(restored, "demoSignIn")["viewer"], {
    accountId: viewer.accountId,
    expiresAt: new Date((now + 1_800) * 1_000).toISOString(),
  });
  assert.equal(
    (payload(await send(listQuery, {}, restored.cookie), "profiles")["profiles"] as unknown[])
      .length,
    4,
  );
  assert.equal((await restarted.service.shutdown()).outcome, "completed");
  output("identity_graphql_sessions", {
    revoked: "rejected",
    expired: "rejected",
    previousProcess: "rejected",
    restartProfiles: 4,
    shutdown: "completed",
  });

  const joined = logs.join("");
  assert.equal(
    /header\.|signature|aster-test-only|Cinéma|Updated synthetic|Foreign synthetic|mutation Create|postgresql:|cookie|sessionId|credential/u.test(
      joined,
    ),
    false,
  );
  const sample = logs
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((entry) => entry["event"] === "aster.identity.graphql_completed");
  assert.ok(sample);
  output("identity_sanitized_operation_trace", {
    sample,
    limitation: "correlated structured operation record; not an exported distributed trace",
  });
} catch (error) {
  const frame =
    error instanceof Error
      ? error.stack?.split("\n").find((line) => line.includes("subgraph-worker.js:"))
      : undefined;
  const code: unknown =
    typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
  output("identity_subgraph_failure", {
    location: frame?.match(/subgraph-worker\.js:\d+:\d+/u)?.[0] ?? "unknown",
    code: typeof code === "string" && /^[A-Z0-9_]{1,32}$/u.test(code) ? code : "UNKNOWN",
  });
  process.exitCode = 1;
} finally {
  for (const service of services) {
    await service.shutdown();
  }
  await admin.query("ROLLBACK").catch(() => undefined);
  if (ownsSchema) {
    await admin.query("DROP SCHEMA IF EXISTS identity CASCADE");
    await admin.query("DROP ROLE IF EXISTS aster_identity_local");
    await admin.query("DROP ROLE IF EXISTS aster_identity_runtime");
  }
  await admin.end();
  process.disconnect();
  process.once("beforeExit", () => {
    output("natural_exit", { mode: "subgraph" });
  });
}
