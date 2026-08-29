import assert from "node:assert/strict";
import test from "node:test";
import type {
  AsterKafkaBrokerAdapter,
  AsterKafkaConsumerInput,
  AsterKafkaPublishInput,
} from "@aster/broker-kafka";
import type { AsterPostgresAdapter } from "@aster/postgres";
import {
  createLocalEventDelivery,
  localEventDatabase,
  localEventDeliveryEnabled,
} from "../src/infrastructure/local-runtime.js";
import {
  createIdentityEventSignature,
  IDENTITY_EVENT_SIGNATURE,
} from "../src/infrastructure/identity-signature.js";
import { profileEvent } from "./event-fixture.js";
import { EVENT_TOPICS, type EventOwner } from "../src/domain/envelope.js";

const telemetry = {
  startDependencyOperation: () => ({
    status: "rejected" as const,
    reason: "telemetry_closed" as const,
  }),
};
const source = (owner: EventOwner) => {
  const endpoint = new URL("postgresql://postgres:5432/aster");
  endpoint.username = `aster_${owner === "catalog" ? "catalog_reader" : owner}_local`;
  endpoint.password = "aster-test-only";
  return endpoint.href;
};
async function settled(predicate: () => boolean) {
  for (let n = 0; n < 80 && !predicate(); n++) {
    await Promise.resolve();
  }
  assert.ok(predicate(), "Expected bounded fake operation to settle.");
}
test("local activation and derived credentials cannot select hosted or foreign owner authority", () => {
  assert.equal(localEventDeliveryEnabled(undefined, "local"), false);
  assert.equal(localEventDeliveryEnabled("true", "local"), true);
  for (const value of ["1", "", "TRUE"]) {
    assert.throws(() => localEventDeliveryEnabled(value, "local"));
  }
  assert.throws(() => localEventDeliveryEnabled("true", "production"));
  for (const owner of Object.keys(EVENT_TOPICS) as EventOwner[]) {
    const wrongOwner = new URL(source(owner));
    wrongOwner.username = "aster";
    assert.equal(
      new URL(localEventDatabase(owner, source(owner))).username,
      `aster_${owner}_relay_local`,
    );
    for (const value of [
      source(owner).replace("@postgres", "@example.invalid"),
      source(owner) + "?sslmode=disable",
      source(owner).replace("/aster", "/other"),
      wrongOwner.href,
    ]) {
      assert.throws(() => localEventDatabase(owner, value));
    }
  }
  assert.equal(
    new URL(localEventDatabase("engagement", source("engagement"), "consumer")).username,
    "aster_engagement_consumer_local",
  );
  assert.throws(() => localEventDatabase("catalog", source("catalog"), "consumer"));
});

function fixture(event = profileEvent()) {
  const urls: string[] = [],
    calls: string[] = [],
    waits: number[] = [];
  const published: AsterKafkaPublishInput[] = [],
    consumers: AsterKafkaConsumerInput[] = [];
  let state: "idle" | "ready" | "closed" = "idle";
  let consumerState: "idle" | "running" = "idle";
  let next: (() => void) | undefined;
  let pending = true;
  const database: AsterPostgresAdapter = {
    connect: () => Promise.resolve({ status: "completed" }),
    probe: () => Promise.resolve({ status: "completed" }),
    async transaction(work) {
      const decision = await work({
        query: (query) => {
          const ack = query.text.includes("acknowledge_outbox");
          calls.push(ack ? "ack" : "claim");
          if (ack) {
            pending = false;
          }
          return Promise.resolve({
            rowCount: 1,
            rows: ack
              ? [{ acknowledged: true }]
              : [
                  {
                    result: pending
                      ? {
                          status: "claimed",
                          value: {
                            token: query.values?.[0],
                            eventId: event.eventId,
                            aggregateId: event.aggregate.id,
                            aggregateVersion: event.aggregate.version,
                            event,
                          },
                        }
                      : { status: "empty" },
                  },
                ],
          });
        },
      });
      return {
        status: decision.action === "commit" ? "committed" : "rolled_back",
        value: decision.value,
      };
    },
    close: () => {
      calls.push("db_close");
      return Promise.resolve({ status: "completed" });
    },
    snapshot: () => ({
      state: "open",
      totalConnections: 0,
      idleConnections: 0,
      vendorWaitingConnections: 0,
      reservedSlots: 0,
    }),
    lifecycleHooks: () => ({ closeDependencies: () => Promise.resolve() }),
  };
  const broker: AsterKafkaBrokerAdapter = {
    connect: () => {
      state = "ready";
      calls.push("connect");
      return Promise.resolve({ status: "completed" });
    },
    metadata: () => Promise.resolve({ status: "completed" }),
    offsets: () => Promise.resolve({ status: "completed", value: { 0: "0" } }),
    publish: (record) => {
      calls.push("publish");
      published.push(record);
      return Promise.resolve({ status: "completed" });
    },
    startConsumer: (input) => {
      consumers.push(input);
      consumerState = "running";
      return Promise.resolve({ status: "completed" });
    },
    stopConsumer: () => {
      calls.push("consumer_stop");
      consumerState = "idle";
      return Promise.resolve({ status: "completed" });
    },
    close: () => {
      calls.push("broker_close");
      state = "closed";
      return Promise.resolve({ status: "completed" });
    },
    snapshot: () => ({ state, consumerState, inFlightPublishes: 0, inFlightHandlers: 0 }),
    lifecycleHooks: () => ({
      stopConsumers: () => Promise.resolve(),
      closeDependencies: () => Promise.resolve(),
    }),
  };
  const factories = {
    database: (options: { readonly connectionString: string }) => {
      urls.push(options.connectionString);
      return database;
    },
    broker: () => broker,
    credential: () => Promise.resolve("12".repeat(32)),
    random: () => 0,
    delay: (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        waits.push(ms);
        const done = () => {
          signal.removeEventListener("abort", done);
          next = undefined;
          resolve();
        };
        signal.addEventListener("abort", done, { once: true });
        next = done;
      }),
  };
  return {
    factories,
    urls,
    calls,
    waits,
    published,
    consumers,
    advance: () => {
      assert.ok(next);
      next();
    },
  };
}
test("Identity runtime signs exact published bytes after claim commit and before acknowledgement; stop owns all resources", async () => {
  const f = fixture();
  const runtime = await createLocalEventDelivery(
    {
      owner: "identity",
      connectionString: source("identity"),
      telemetry,
      logger: { info: () => "written" },
    },
    f.factories,
  );
  runtime.start();
  runtime.start();
  await settled(() => f.waits.length === 1);
  assert.deepEqual(f.calls, ["connect", "claim", "publish", "ack"]);
  const publication = f.published[0];
  assert.ok(publication);
  const signature = publication.headers?.[IDENTITY_EVENT_SIGNATURE];
  assert.ok(signature);
  assert.equal(
    createIdentityEventSignature("12".repeat(32)).verify(
      publication.topic,
      publication.key,
      publication.value,
      signature,
    ),
    true,
  );
  assert.equal(new URL(f.urls[0] ?? "").username, "aster_identity_relay_local");
  f.advance();
  await settled(() => f.waits.length === 2);
  assert.equal(f.waits[1], 1000);
  await runtime.stop();
  await runtime.close(new AbortController().signal);
  runtime.start();
  assert.deepEqual(f.calls.slice(-3), ["consumer_stop", "broker_close", "db_close"]);
  assert.equal(f.published.length, 1);
});
test("Engagement alone creates the narrow consumer pool and earliest-backlog handler; partial setup closes owned pools", async () => {
  const f = fixture();
  const runtime = await createLocalEventDelivery(
    {
      owner: "engagement",
      connectionString: source("engagement"),
      telemetry,
      logger: { info: () => "written" },
      identityConsumer: (_db, key) => {
        assert.equal(key, "12".repeat(32));
        return () => Promise.resolve();
      },
    },
    f.factories,
  );
  runtime.start();
  await settled(() => f.waits.length === 1);
  assert.deepEqual(
    f.urls.map((url) => new URL(url).username),
    ["aster_engagement_relay_local", "aster_engagement_consumer_local"],
  );
  assert.equal(f.consumers[0]?.topic, EVENT_TOPICS.identity);
  assert.equal(f.consumers[0].fromBeginning, true);
  await runtime.stop();
  await runtime.close(new AbortController().signal);
  const broken = fixture();
  await assert.rejects(
    createLocalEventDelivery(
      {
        owner: "engagement",
        connectionString: source("engagement"),
        telemetry,
        logger: { info: () => "written" },
        identityConsumer: () => {
          throw new Error("setup");
        },
      },
      broken.factories,
    ),
  );
  assert.deepEqual(broken.calls, ["db_close", "db_close"]);
});

test("consumer recovery cannot block the owner's independent outbox or create a hot retry loop", async () => {
  const original = profileEvent();
  const f = fixture({
    ...original,
    producer: "engagement",
    eventType: "engagement.watchlist-changed",
    causationId: original.eventId,
    aggregate: { ...original.aggregate, type: "Watchlist" },
    payload: { profileId: original.aggregate.id, titleId: original.eventId, present: true },
  });
  const broker = f.factories.broker();
  const runtime = await createLocalEventDelivery(
    {
      owner: "engagement",
      connectionString: source("engagement"),
      telemetry,
      logger: { info: () => "written" },
      identityConsumer: () => () => Promise.resolve(),
    },
    {
      ...f.factories,
      broker: () => ({
        ...broker,
        startConsumer: () => Promise.resolve({ status: "timed_out" }),
      }),
    },
  );
  runtime.start();
  await settled(() => f.waits.length === 1);
  assert.deepEqual(f.calls, ["connect", "claim", "publish", "ack"]);
  assert.equal(f.waits[0], 1000);
  f.advance();
  await settled(() => f.waits.length === 2);
  assert.equal(f.published.length, 1);
  assert.equal(f.waits[1], 2000);
  await runtime.stop();
  await runtime.close(new AbortController().signal);
});
