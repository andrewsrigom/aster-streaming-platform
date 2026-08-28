import assert from "node:assert/strict";
import test from "node:test";
import type { AsterPostgresAdapter, AsterPostgresQuery, AsterPostgresRows } from "@aster/postgres";
import { createPostgresOutbox } from "../src/infrastructure/postgres-outbox.js";
import { EVENT_TOPICS, type EventOwner } from "../src/domain/envelope.js";
import { EVENT_ID, PROFILE_ID, TOKEN, OTHER_ID, profileEvent } from "./event-fixture.js";

const claim = {
  token: TOKEN,
  eventId: EVENT_ID,
  aggregateId: PROFILE_ID,
  aggregateVersion: 2,
  event: profileEvent(),
};
function fixture(
  answer: AsterPostgresRows,
  outcome: "committed" | "rolled_back" | "indeterminate" = "committed",
  owner: EventOwner = "identity",
) {
  const queries: AsterPostgresQuery[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work, signal) {
      signals.push(signal);
      try {
        const decision = await work({
          query: (query) => {
            queries.push(query);
            return Promise.resolve(answer);
          },
        });
        assert.equal(decision.action, "commit");
        return outcome === "indeterminate"
          ? { status: outcome }
          : { status: outcome, value: decision.value };
      } catch {
        return { status: "failed" };
      }
    },
  };
  return { store: createPostgresOutbox(owner, database), queries, signals };
}
const rows = (result: unknown): AsterPostgresRows => ({ rowCount: 1, rows: [{ result }] });

test("owner claim is disclosed only after a definite transaction commit", async () => {
  const signal = new AbortController().signal;
  for (const owner of Object.keys(EVENT_TOPICS) as EventOwner[]) {
    const response = { status: "claimed", value: claim };
    const f = fixture(rows(response), "committed", owner);
    assert.deepEqual(await f.store.claim(TOKEN, signal), response);
    assert.deepEqual(f.queries, [
      { text: `SELECT ${owner}.claim_outbox($1::uuid) AS result`, values: [TOKEN] },
    ]);
    assert.deepEqual(f.signals, [signal]);
    for (const outcome of ["rolled_back", "indeterminate"] as const) {
      assert.deepEqual(await fixture(rows(response), outcome, owner).store.claim(TOKEN, signal), {
        status: "unavailable",
      });
    }
  }
});

test("empty and busy claims still finish their short transaction", async () => {
  for (const status of ["empty", "busy"] as const) {
    assert.deepEqual(
      await fixture(rows({ status })).store.claim(TOKEN, new AbortController().signal),
      { status },
    );
  }
});

test("untrusted claim rows cannot invent or coerce token, identity or version", async () => {
  for (const response of [
    { status: "claimed", value: { ...claim, token: OTHER_ID } },
    { status: "claimed", value: { ...claim, aggregateVersion: "2" } },
    { status: "claimed", value: { ...claim, eventId: "invalid" } },
    { status: "claimed", value: { ...claim, extra: true } },
    { status: "empty", value: claim },
    null,
  ]) {
    assert.deepEqual(
      await fixture(rows(response)).store.claim(TOKEN, new AbortController().signal),
      { status: "unavailable" },
    );
  }
  for (const malformed of [
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [{ result: { status: "empty" } }] },
  ]) {
    assert.deepEqual(await fixture(malformed).store.claim(TOKEN, new AbortController().signal), {
      status: "unavailable",
    });
  }
});

test("acknowledgement requires exact live claim identifiers and definite commit", async () => {
  for (const acknowledged of [true, false]) {
    const answer = { rowCount: 1, rows: [{ acknowledged }] };
    const f = fixture(answer);
    assert.equal(
      await f.store.acknowledge(claim, new AbortController().signal),
      acknowledged ? "acknowledged" : "not_owned",
    );
    assert.deepEqual(f.queries, [
      {
        text: "SELECT identity.acknowledge_outbox($1::uuid, $2::uuid) AS acknowledged",
        values: [TOKEN, EVENT_ID],
      },
    ]);
    for (const outcome of ["rolled_back", "indeterminate"] as const) {
      assert.equal(
        await fixture(answer, outcome).store.acknowledge(claim, new AbortController().signal),
        "unavailable",
      );
    }
  }
  assert.equal(
    await fixture({ rowCount: 1, rows: [{ acknowledged: "true" }] }).store.acknowledge(
      claim,
      new AbortController().signal,
    ),
    "unavailable",
  );
});

test("invalid identifiers and pre-cancellation avoid database dispatch", async () => {
  const f = fixture(rows({ status: "empty" }));
  assert.deepEqual(await f.store.claim("invalid", new AbortController().signal), {
    status: "unavailable",
  });
  assert.deepEqual(await f.store.claim(TOKEN, AbortSignal.abort()), { status: "unavailable" });
  assert.equal(
    await f.store.acknowledge({ ...claim, token: "invalid" }, new AbortController().signal),
    "unavailable",
  );
  assert.equal(await f.store.acknowledge(claim, AbortSignal.abort()), "unavailable");
  assert.equal(f.queries.length, 0);
});
