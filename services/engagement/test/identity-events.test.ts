import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityEventConsumer } from "../src/application/consume-identity-event.js";
import type { IdentityEventStore } from "../src/application/identity-event-ports.js";
import {
  createIdentityEventInspector,
  snapshotIdentityRecord,
} from "../src/infrastructure/identity-event-wire.js";
import {
  deletionFact,
  eventCredential,
  eventId,
  identityEnvelope,
  signedIdentityRecord,
} from "./identity-event-fixture.js";

function fixture(overrides: Partial<IdentityEventStore> = {}) {
  const calls: string[] = [];
  const store: IdentityEventStore = {
    deleteProfile: (fact) => {
      assert.deepEqual(fact, deletionFact);
      calls.push("delete_commit");
      return Promise.resolve("applied");
    },
    quarantine: () => {
      calls.push("quarantine_commit");
      return Promise.resolve("stored");
    },
    readQuarantine: () => {
      calls.push("read_quarantine");
      return Promise.resolve(signedIdentityRecord());
    },
    completeReplay: () => {
      calls.push("remove_quarantine_commit");
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return {
    calls,
    consumer: createIdentityEventConsumer({
      store,
      inspect: createIdentityEventInspector(eventCredential),
    }),
  };
}
const signal = () => new AbortController().signal;
test("valid deletion is acknowledged only after its durable effect or duplicate recognition", async () => {
  const f = fixture();
  assert.equal(await f.consumer.handle(signedIdentityRecord(), signal()), "applied");
  assert.deepEqual(f.calls, ["delete_commit"]);
  assert.equal(
    await fixture({ deleteProfile: () => Promise.resolve("duplicate") }).consumer.handle(
      signedIdentityRecord(),
      signal(),
    ),
    "duplicate",
  );
});
test("old created and updated facts never create a second Identity read model or resurrect data", async () => {
  const f = fixture();
  for (const eventType of ["identity.profile-created", "identity.profile-updated"]) {
    assert.equal(
      await f.consumer.handle(signedIdentityRecord({ ...identityEnvelope(), eventType }), signal()),
      "ignored",
    );
  }
  assert.deepEqual(f.calls, []);
});
test("poison must be durably quarantined before its offset can advance", async () => {
  const f = fixture();
  const unsigned = { ...signedIdentityRecord(), headers: {} };
  assert.equal(await f.consumer.handle(unsigned, signal()), "quarantined");
  assert.deepEqual(f.calls, ["quarantine_commit"]);
  for (const outcome of ["full", "unavailable"] as const) {
    assert.equal(
      await fixture({ quarantine: () => Promise.resolve(outcome) }).consumer.handle(
        unsigned,
        signal(),
      ),
      "retry",
    );
  }
});
test("profile identity conflicts quarantine; unavailable storage and full tombstones do not", async () => {
  const f = fixture({ deleteProfile: () => Promise.resolve("conflict") });
  assert.equal(await f.consumer.handle(signedIdentityRecord(), signal()), "quarantined");
  assert.deepEqual(f.calls, ["quarantine_commit"]);
  for (const outcome of ["full", "unavailable"] as const) {
    const rejected = fixture({ deleteProfile: () => Promise.resolve(outcome) });
    assert.equal(await rejected.consumer.handle(signedIdentityRecord(), signal()), "retry");
    assert.deepEqual(rejected.calls, []);
  }
});
test("exact replay revalidates bytes and removes quarantine only after durable handling", async () => {
  const f = fixture();
  assert.equal(await f.consumer.replay(eventId(10), signal()), "applied");
  assert.deepEqual(f.calls, ["read_quarantine", "delete_commit", "remove_quarantine_commit"]);
  for (const store of [
    { readQuarantine: () => Promise.resolve({ ...signedIdentityRecord(), headers: {} }) },
    { deleteProfile: () => Promise.resolve("conflict" as const) },
    { deleteProfile: () => Promise.resolve("unavailable" as const) },
  ]) {
    const failed = fixture(store);
    assert.equal(await failed.consumer.replay(eventId(10), signal()), "retry");
    assert.ok(!failed.calls.includes("remove_quarantine_commit"));
    assert.ok(!failed.calls.includes("quarantine_commit"));
  }
});
test("cancellation and one-handler admission bound work without acknowledging unfinished effects", async () => {
  let resolve: ((value: "applied") => void) | undefined;
  const f = fixture({
    deleteProfile: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const controller = new AbortController();
  const first = f.consumer.handle(signedIdentityRecord(), controller.signal);
  assert.equal(await f.consumer.handle(signedIdentityRecord(), signal()), "retry");
  assert.equal(await f.consumer.replay(eventId(10), signal()), "retry");
  controller.abort();
  assert.ok(resolve);
  resolve("applied");
  assert.equal(await first, "retry");
  assert.equal(await f.consumer.handle(signedIdentityRecord(), AbortSignal.abort()), "retry");
});
test("signature is checked before JSON and binds key, payload and environment", () => {
  const inspect = createIdentityEventInspector(eventCredential);
  const record = signedIdentityRecord();
  assert.equal(inspect(record).status, "valid");
  for (const changed of [
    { ...record, key: Buffer.from(eventId(9)) },
    { ...record, value: Buffer.from("invalid json") },
    signedIdentityRecord(identityEnvelope(), deletionFact.profileId, "13".repeat(32)),
  ]) {
    const outcome = inspect(changed);
    assert.equal(outcome.status, "poison");
    assert.equal(outcome.reason, "signature");
  }
  for (const bad of [
    signedIdentityRecord({ ...identityEnvelope(), producer: "catalog" }),
    signedIdentityRecord(identityEnvelope(), eventId(9)),
  ]) {
    const outcome = inspect(bad);
    assert.equal(outcome.status, "poison");
    assert.equal(outcome.reason, "envelope");
  }
});
test("wire and quarantine bounds reject oversized input without retaining it; copies resist caller mutation", async () => {
  const f = fixture(),
    record = signedIdentityRecord();
  for (const changed of [
    { ...record, value: new Uint8Array(8193) },
    { ...record, key: new Uint8Array(129) },
    { ...record, offset: "00" },
    { ...record, partition: -1 },
    { ...record, headers: { oversized: new Uint8Array(1025) } },
  ]) {
    assert.equal(snapshotIdentityRecord(changed), undefined);
    assert.equal(await f.consumer.handle(changed, signal()), "retry");
  }
  assert.deepEqual(f.calls, []);
  const copy = snapshotIdentityRecord(record);
  assert.ok(copy);
  record.value.fill(0);
  assert.notEqual(copy.value[0], 0);
});
