import assert from "node:assert/strict";
import test from "node:test";
import { createOutboxRelay, type OutboxClaim, type RelayPorts } from "../src/application/relay.js";
import { EVENT_ID, PROFILE_ID, TOKEN, OTHER_ID, profileEvent } from "./event-fixture.js";

function fixture(overrides: Partial<RelayPorts> = {}) {
  const calls: string[] = [];
  const claim: OutboxClaim = {
    token: TOKEN,
    eventId: EVENT_ID,
    aggregateId: PROFILE_ID,
    aggregateVersion: 2,
    event: profileEvent(),
  };
  const ports: RelayPorts = {
    nextToken: () => TOKEN,
    outbox: {
      claim: (token, signal) => {
        assert.equal(token, TOKEN);
        assert.equal(signal.aborted, false);
        calls.push("claim_commit");
        return Promise.resolve({ status: "claimed", value: claim });
      },
      acknowledge: (value) => {
        assert.equal(value, claim);
        calls.push("ack_commit");
        return Promise.resolve("acknowledged");
      },
    },
    publish: (event) => {
      assert.deepEqual(event, profileEvent());
      calls.push("broker_ack");
      return Promise.resolve("acknowledged");
    },
    ...overrides,
  };
  return { calls, claim, ports, relay: createOutboxRelay("identity", ports) };
}
test("publishes only committed claimed fact and acknowledges only after broker confirmation", async () => {
  const f = fixture();
  assert.equal(await f.relay.step(new AbortController().signal), "delivered");
  assert.deepEqual(f.calls, ["claim_commit", "broker_ack", "ack_commit"]);
});
test("uncertain or failed publication retains the outbox fact without acknowledgement", async () => {
  for (const outcome of ["uncertain", "unavailable"] as const) {
    const f = fixture({ publish: () => Promise.resolve(outcome) });
    assert.equal(await f.relay.step(new AbortController().signal), outcome);
    assert.deepEqual(f.calls, ["claim_commit"]);
  }
});
test("same event can be redelivered when the broker acknowledgement preceded uncertain SQL", async () => {
  const f = fixture();
  let acknowledgements = 0,
    publishes = 0;
  const relay = createOutboxRelay("identity", {
    ...f.ports,
    publish: () => {
      publishes++;
      return Promise.resolve("acknowledged");
    },
    outbox: {
      ...f.ports.outbox,
      acknowledge: () => Promise.resolve(++acknowledgements === 1 ? "unavailable" : "acknowledged"),
    },
  });
  assert.equal(await relay.step(new AbortController().signal), "unavailable");
  assert.equal(await relay.step(new AbortController().signal), "delivered");
  assert.equal(publishes, 2);
});
test("cancellation after claim or send suppresses later stages", async () => {
  for (const stage of ["claim", "publish"] as const) {
    const controller = new AbortController(),
      f = fixture();
    const relay = createOutboxRelay("identity", {
      ...f.ports,
      outbox: {
        ...f.ports.outbox,
        claim: (token, signal) => {
          const result = f.ports.outbox.claim(token, signal);
          if (stage === "claim") {
            controller.abort();
          }
          return result;
        },
      },
      publish: () => {
        controller.abort();
        return Promise.resolve("acknowledged");
      },
    });
    assert.equal(await relay.step(controller.signal), "stopped");
    assert.deepEqual(f.calls, ["claim_commit"]);
  }
});
test("rejects divergent claim identity, version, token or event before broker I/O", async () => {
  const f = fixture();
  for (const changed of [
    { token: OTHER_ID },
    { eventId: OTHER_ID },
    { aggregateId: OTHER_ID },
    { aggregateVersion: 3 },
    { event: {} },
  ]) {
    const relay = createOutboxRelay("identity", {
      ...f.ports,
      outbox: {
        ...f.ports.outbox,
        claim: () => Promise.resolve({ status: "claimed", value: { ...f.claim, ...changed } }),
      },
    });
    assert.equal(await relay.step(new AbortController().signal), "invalid");
  }
  assert.deepEqual(f.calls, []);
});
test("admits one relay step without queue and releases admission after failure", async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  const relay = createOutboxRelay("identity", {
    ...f.ports,
    publish: () =>
      new Promise((_resolve, reject) => {
        release = () => {
          reject(new Error("unavailable"));
        };
      }),
  });
  const pending = relay.step(new AbortController().signal);
  await Promise.resolve();
  assert.equal(await relay.step(new AbortController().signal), "busy");
  assert.ok(release);
  release();
  assert.equal(await pending, "unavailable");
  assert.equal(await relay.step(AbortSignal.abort()), "stopped");
});
