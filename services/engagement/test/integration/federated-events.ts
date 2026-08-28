import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { createAsterKafkaBrokerAdapter, type AsterKafkaConsumedRecord } from "@aster/broker-kafka";
import { createAsterPostgresAdapter } from "@aster/postgres";
import {
  EVENT_TOPICS,
  eventIdentifier,
  loadLocalIdentityEventCredential,
  normalizeEvent,
} from "@aster/event-delivery";
import { createIdentityEventConsumer } from "../../src/application/consume-identity-event.js";
import { createIdentityEventInspector } from "../../src/infrastructure/identity-event-wire.js";
import { createPostgresIdentityEvents } from "../../src/infrastructure/postgres-identity-events.js";
import type { IdentityEventRecord } from "../../src/application/identity-event-ports.js";

const fixtureId = process.env["ASTER_FIXTURE_ID"] ?? "";
assert.match(fixtureId, /^aster-engagement-proof-[a-f0-9-]{36}$/u);
const mode = process.env["ASTER_EVENT_PROOF_MODE"];
assert.ok(["prepare", "ready", "verify", "outage", "recovered"].includes(mode ?? ""));
const titleId = "00000000-0000-4000-8000-000000000002";
const catalogId = "00000000-0000-4000-8000-000000080809";
const signal = () => AbortSignal.timeout(5000);
const now = () => Math.floor(Date.now() / 1000);
const emit = (event: string, facts: object = {}) =>
  process.stdout.write(JSON.stringify({ event, ...facts }) + "\n");
const admin = new Pool({
  host: "postgres",
  port: 5432,
  database: "aster",
  user: "aster",
  password: "aster-test-only",
  max: 1,
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
  query_timeout: 2500,
});
admin.on("error", () => undefined);
const telemetry = {
  startDependencyOperation: () => ({
    status: "rejected" as const,
    reason: "telemetry_closed" as const,
  }),
};
let cookie = "";
interface Result {
  code: string;
  profileId?: string;
  session?: { id: string };
  progress?: { version: number; positionMs: number };
}
async function call(query: string, variables: object = {}, credential = cookie) {
  const operationName = /^(?:query|mutation)\s+(\w+)/u.exec(query)?.[1];
  const body = JSON.stringify({
    query,
    variables,
    operationName,
  });
  return new Promise<Result>((resolve, reject) => {
    const outgoing = request(
      "http://router:4000/graphql",
      {
        method: "POST",
        agent: false,
        signal: AbortSignal.timeout(4000),
        maxHeaderSize: 8192,
        headers: {
          host: "127.0.0.1:4000",
          origin: "http://127.0.0.1:4000",
          "content-type": "application/json",
          "x-aster-csrf": "1",
          "content-length": String(Buffer.byteLength(body)),
          ...(credential ? { cookie: credential } : {}),
        },
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("error", reject);
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16384) {
            incoming.destroy(new Error("Bounded proof response exceeded."));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          try {
            assert.equal(incoming.statusCode, 200);
            const decoded = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              data?: Record<string, Result>;
              errors?: unknown;
            };
            assert.equal(decoded.errors, undefined, operationName);
            const result = Object.values(decoded.data ?? {})[0];
            assert.ok(result);
            assert.equal(result.code, "COMPLETED");
            const issued = incoming.headers["set-cookie"]?.[0]?.split(";")[0];
            if (issued) {
              cookie = issued;
            }
            resolve(result);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Invalid proof response."));
          }
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}
async function signIn() {
  await call("mutation DemoSignIn { demoSignIn { code } }", {}, "");
  assert.ok(cookie);
}
async function createProfile(name: string) {
  const result = await call(
    "mutation CreateProfile($input:CreateProfileInput!) { createProfile(input:$input) { code profileId } }",
    {
      input: {
        mutationId: randomUUID(),
        profile: { displayName: name, locale: "pt-BR", maturity: "GENERAL" },
      },
    },
  );
  assert.ok(eventIdentifier(result.profileId));
  return result.profileId;
}
async function save(profileId: string, sequence: number) {
  const playback = await call(
    "mutation StartPlayback($titleId:ID!) { createPlaybackSession(titleId:$titleId) { code session { id } } }",
    { titleId },
    "",
  );
  assert.ok(playback.session);
  const saved = await call(
    "mutation RecordProgress($input:RecordProgressInput!) { recordProgress(input:$input) { code progress { version positionMs } } }",
    {
      input: {
        profileId,
        titleId,
        playbackSessionId: playback.session.id,
        sequence,
        positionMs: sequence * 1000,
        durationMs: 6000,
        occurredAt: now(),
        idempotencyKey: randomUUID(),
      },
    },
  );
  assert.equal(saved.progress?.version, sequence);
}
async function until(check: () => boolean | Promise<boolean>, label: string) {
  const deadline = performance.now() + 25000;
  do {
    if (await check()) {
      return;
    }
    await delay(100);
  } while (performance.now() < deadline);
  assert.fail("Event proof deadline: " + label);
}
async function pending() {
  const result = await admin.query<{ count: number }>(
    "SELECT ((SELECT count(*) FROM identity.profile_outbox) + (SELECT count(*) FROM catalog.publication_outbox) + (SELECT count(*) FROM engagement.outbox))::integer AS count",
  );
  assert.ok(result.rows[0]);
  return result.rows[0].count;
}
function selected(name: string) {
  const value = process.env[name];
  assert.ok(eventIdentifier(value));
  return value;
}
function wire(record: AsterKafkaConsumedRecord): IdentityEventRecord {
  return {
    topic: EVENT_TOPICS.identity,
    key: record.key,
    value: record.value,
    partition: record.partition,
    offset: record.offset,
    headers: record.headers ?? {},
  };
}

async function prepare() {
  assert.notEqual(process.env["ASTER_EVENTS_ENABLED"], "true");
  await signIn();
  const deletedProfile = await createProfile("Event deletion fixture");
  const activeProfile = await createProfile("Event recovery fixture");
  await save(deletedProfile, 1);
  await save(activeProfile, 1);
  await call(
    "mutation SetWatchlist($input:SetWatchlistInput!) { setWatchlist(input:$input) { code } }",
    { input: { profileId: deletedProfile, titleId, present: true, idempotencyKey: randomUUID() } },
  );
  await call(
    "mutation DeleteProfile($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
    { input: { profileId: deletedProfile, mutationId: randomUUID(), expectedVersion: 1 } },
  );
  // A synthetic publication fact tests the real Catalog relay, without asserting media rights.
  const event = {
    eventId: randomUUID(),
    eventType: "catalog.title-retired",
    schemaVersion: 1,
    occurredAt: new Date(now() * 1000).toISOString(),
    producer: "catalog",
    aggregate: { type: "Title", id: catalogId, version: 2 },
    correlationId: randomUUID(),
    causationId: randomUUID(),
    trace: {},
    payload: { titleId: catalogId, publicationId: null, rightsRevision: null },
  };
  assert.ok(normalizeEvent("catalog", event));
  await admin.query("INSERT INTO catalog.titles(id,version,state) VALUES($1,1,'DRAFT')", [
    catalogId,
  ]);
  await admin.query(
    "INSERT INTO catalog.command_audit(id,title_id,title_version,kind,actor_id,occurred_at,correlation_id,mutation_id) VALUES($1,$2,2,'retire',$3,$4,$5,$6)",
    [randomUUID(), catalogId, randomUUID(), now(), event.correlationId, event.causationId],
  );
  await admin.query(
    "INSERT INTO catalog.publication_outbox(event_id,title_id,title_version,slot,event_type,event) VALUES($1,$2,2,1,'catalog.title-retired',$3::jsonb)",
    [event.eventId, catalogId, JSON.stringify(event)],
  );
  assert.ok((await pending()) >= 5);
  emit("event_backlog_prepared", { committedBeforeActivation: true, realProfileMutation: true });
  emit("event_proof_control", { deletedProfile, activeProfile });
}

async function verify() {
  assert.equal(process.env["ASTER_EVENTS_ENABLED"], "true");
  const deletedProfile = selected("ASTER_EVENT_DELETED_PROFILE");
  const activeProfile = selected("ASTER_EVENT_ACTIVE_PROFILE");
  await until(async () => (await pending()) === 0, "three owner backlogs");
  await until(
    async () =>
      (
        await admin.query(
          "SELECT profile_id FROM engagement.profile_deletions WHERE profile_id=$1",
          [deletedProfile],
        )
      ).rowCount === 1,
    "signed deletion completion",
  );
  const audit = await admin.query<{
    removed_progress: number;
    removed_watchlists: number;
    removed_progress_receipts: number;
  }>(
    "SELECT removed_progress, removed_watchlists, removed_progress_receipts FROM engagement.profile_deletions WHERE profile_id=$1",
    [deletedProfile],
  );
  assert.deepEqual(audit.rows, [
    { removed_progress: 1, removed_watchlists: 1, removed_progress_receipts: 1 },
  ]);
  const gone = await admin.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM engagement.progress WHERE profile_id=$1",
    [deletedProfile],
  );
  assert.equal(gone.rows[0]?.count, 0);
  emit("event_owner_backlogs", {
    owners: 3,
    pending: 0,
    signedDeletion: "applied",
    progressAndWatchlist: "removed",
  });

  const credential = await loadLocalIdentityEventCredential();
  const inspect = createIdentityEventInspector(credential);
  const consumerEndpoint = new URL("postgresql://postgres:5432/aster");
  consumerEndpoint.username = "aster_engagement_consumer_local";
  consumerEndpoint.password = "aster-test-only";
  const database = createAsterPostgresAdapter({
    connectionString: consumerEndpoint.href,
    maxConnections: 1,
    connectionTimeoutMs: 500,
    operationTimeoutMs: 1000,
    statementTimeoutMs: 900,
    telemetry,
  });
  const store = createPostgresIdentityEvents(database, randomUUID);
  const consumer = createIdentityEventConsumer({ inspect, store });
  const broker = createAsterKafkaBrokerAdapter({
    brokers: ["broker:19092"],
    clientId: "aster-event-proof",
    groupId: fixtureId,
    telemetry,
    maxInFlightPublishes: 1,
    maxMessageBytes: 16384,
    connectionTimeoutMs: 1000,
    operationTimeoutMs: 2000,
    closeTimeoutMs: 2000,
    retryMaxAttempts: 2,
  });
  let deletion: IdentityEventRecord | undefined;
  let deliveries = 0;
  let handlerFailure: Error | undefined;
  let expectedOffset: string | undefined;
  const injectedFailure = new Error("Fixture crash after durable handling, before Kafka commit.");
  try {
    assert.equal((await broker.connect(signal())).status, "completed");
    const handle = async (raw: AsterKafkaConsumedRecord) => {
      try {
        const record = wire(raw);
        const inspected = inspect(record);
        assert.equal(inspected.status, "valid");
        if (inspected.fact.profileId !== deletedProfile || !inspected.fact.deleted) {
          return;
        }
        assert.equal(await consumer.handle(record, raw.signal), "duplicate");
        deliveries++;
        if (deliveries === 1) {
          deletion = record;
          expectedOffset = record.offset;
          throw injectedFailure;
        }
        assert.equal(record.offset, expectedOffset);
        assert.deepEqual(record.value, deletion?.value);
      } catch (error) {
        if (error !== injectedFailure) {
          handlerFailure = error instanceof Error ? error : new Error("Proof handler failed.");
        }
        throw error;
      }
    };
    assert.equal(
      (
        await broker.startConsumer(
          { topic: EVENT_TOPICS.identity, fromBeginning: true, handle },
          signal(),
        )
      ).status,
      "completed",
    );
    await until(() => {
      if (handlerFailure) {
        throw handlerFailure;
      }
      return deliveries === 1 && broker.snapshot().consumerState !== "running";
    }, "injected consumer failure");
    assert.equal((await broker.stopConsumer(signal())).status, "completed");
    assert.equal(
      (
        await broker.startConsumer(
          { topic: EVENT_TOPICS.identity, fromBeginning: true, handle },
          signal(),
        )
      ).status,
      "completed",
    );
    await until(() => {
      if (handlerFailure) {
        throw handlerFailure;
      }
      return deliveries === 2;
    }, "uncommitted record redelivery");
    assert.ok(deletion);
    assert.equal((await broker.stopConsumer(signal())).status, "completed");
    assert.equal(
      (
        await admin.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM engagement.profile_deletions WHERE profile_id=$1",
          [deletedProfile],
        )
      ).rows[0]?.count,
      1,
    );
    emit("event_consumer_redelivery", { deliveries, durableEffects: 1, sameOffsetAndBytes: true });

    for (const owner of ["catalog", "engagement"] as const) {
      let found = false;
      handlerFailure = undefined;
      assert.equal(
        (
          await broker.startConsumer(
            {
              topic: EVENT_TOPICS[owner],
              fromBeginning: true,
              handle: (record) => {
                try {
                  const event = normalizeEvent(
                    owner,
                    JSON.parse(Buffer.from(record.value).toString("utf8")) as unknown,
                  );
                  assert.ok(event && event.producer === owner);
                  assert.equal(Buffer.from(record.key ?? []).toString("utf8"), event.aggregate.id);
                  if (
                    owner === "catalog"
                      ? event.aggregate.id === catalogId
                      : event.payload["profileId"] === activeProfile
                  ) {
                    found = true;
                  }
                  return Promise.resolve();
                } catch (error) {
                  handlerFailure =
                    error instanceof Error ? error : new Error("Invalid proof event.");
                  return Promise.reject(handlerFailure);
                }
              },
            },
            signal(),
          )
        ).status,
        "completed",
      );
      await until(() => {
        if (handlerFailure) {
          throw handlerFailure;
        }
        return found;
      }, owner + " retained fact");
      assert.equal((await broker.stopConsumer(signal())).status, "completed");
    }
    emit("event_retained_topics", { owners: 3, contractAndPartitionKey: "valid" });

    const account = await admin.query<{ account_id: string }>(
      "SELECT account_id FROM engagement.profile_guards WHERE profile_id=$1",
      [activeProfile],
    );
    assert.ok(account.rows[0]);
    const forged = {
      ...(JSON.parse(Buffer.from(deletion.value).toString("utf8")) as object),
      eventId: randomUUID(),
      aggregate: { type: "Profile", id: activeProfile, version: 2 },
      payload: { profileId: activeProfile, accountId: account.rows[0].account_id },
    };
    const forgedValue = Buffer.from(JSON.stringify(forged));
    assert.equal(
      (
        await broker.publish(
          { topic: EVENT_TOPICS.identity, key: Buffer.from(activeProfile), value: forgedValue },
          signal(),
        )
      ).status,
      "completed",
    );
    let invalidId: string | undefined;
    await until(async () => {
      invalidId = (
        await admin.query<{ id: string }>(
          "SELECT id FROM engagement.event_quarantine WHERE value_hex=$1 AND reason='signature'",
          [forgedValue.toString("hex")],
        )
      ).rows[0]?.id;
      return invalidId !== undefined;
    }, "durable poison quarantine");
    const retained = await admin.query<{ deleted: boolean; progress: number }>(
      "SELECT deleted, (SELECT count(*)::integer FROM engagement.progress WHERE profile_id=$1) AS progress FROM engagement.profile_guards WHERE profile_id=$1",
      [activeProfile],
    );
    assert.deepEqual(retained.rows, [{ deleted: false, progress: 1 }]);
    assert.equal(await store.quarantine(deletion, "identity_conflict", signal()), "stored");
    const validId = (
      await admin.query<{ id: string }>(
        "SELECT id FROM engagement.event_quarantine WHERE topic=$1 AND partition=$2 AND broker_offset=$3",
        [deletion.topic, deletion.partition, deletion.offset],
      )
    ).rows[0]?.id;
    assert.ok(eventIdentifier(validId) && eventIdentifier(invalidId));
    emit("event_poison_quarantine", {
      signature: "rejected",
      activeProgress: "unchanged",
      durableBeforeAck: true,
    });
    emit("event_proof_control", { validId, invalidId, groupId: fixtureId });
  } finally {
    const result = await broker.close(signal());
    assert.ok(["completed", "already_completed"].includes(result.status));
    assert.equal((await database.close(signal())).status, "completed");
  }
}

try {
  if (mode === "prepare") {
    await prepare();
  } else if (mode === "ready") {
    await signIn();
    emit("event_runtime_ready", { federatedIdentity: "available", ownerReplacement: "completed" });
  } else if (mode === "verify") {
    await verify();
  } else if (mode === "outage") {
    await signIn();
    await save(selected("ASTER_EVENT_ACTIVE_PROFILE"), 2);
    const outageDeletedProfile = await createProfile("Event outage deletion");
    await call(
      "mutation DeleteProfile($input:DeleteProfileInput!) { deleteProfile(input:$input) { code } }",
      { input: { profileId: outageDeletedProfile, mutationId: randomUUID(), expectedVersion: 1 } },
    );
    assert.ok((await pending()) > 0);
    emit("event_broker_outage", {
      committedProgress: true,
      anonymousPlayback: "available",
      pendingFact: "retained",
    });
    emit("event_proof_control", { outageDeletedProfile });
  } else {
    await until(async () => (await pending()) === 0, "outage recovery");
    const deletedProfile = selected("ASTER_EVENT_OUTAGE_DELETED_PROFILE");
    await until(
      async () =>
        (
          await admin.query(
            "SELECT profile_id FROM engagement.profile_deletions WHERE profile_id=$1",
            [deletedProfile],
          )
        ).rowCount === 1,
      "consumer recovery after outage",
    );
    const result = await admin.query<{ version: number; position_ms: number }>(
      "SELECT version, position_ms FROM engagement.progress WHERE profile_id=$1",
      [selected("ASTER_EVENT_ACTIVE_PROFILE")],
    );
    assert.deepEqual(result.rows, [{ version: 2, position_ms: 2000 }]);
    emit("event_broker_recovered", {
      pending: 0,
      durableProgress: "unchanged",
      backgroundRetry: "completed",
      signedDeletionConsumer: "recovered",
    });
  }
} finally {
  await admin.end();
}
