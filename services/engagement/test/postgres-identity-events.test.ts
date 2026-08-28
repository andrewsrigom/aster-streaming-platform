import assert from "node:assert/strict";
import test from "node:test";
import type { AsterPostgresAdapter, AsterPostgresQuery, AsterPostgresRows } from "@aster/postgres";
import { createPostgresIdentityEvents } from "../src/infrastructure/postgres-identity-events.js";
import { deletionFact, eventId, signedIdentityRecord } from "./identity-event-fixture.js";

function fixture(
  answer: AsterPostgresRows,
  result: "normal" | "indeterminate" | "failed" = "normal",
) {
  const queries: AsterPostgresQuery[] = [];
  const decisions: string[] = [];
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work) {
      try {
        const decision = await work({
          query: (query) => {
            queries.push(query);
            return Promise.resolve(answer);
          },
        });
        decisions.push(decision.action);
        return result === "normal"
          ? {
              status: decision.action === "commit" ? "committed" : "rolled_back",
              value: decision.value,
            }
          : { status: result };
      } catch {
        return { status: "failed" };
      }
    },
  };
  return { store: createPostgresIdentityEvents(database, () => eventId(10)), queries, decisions };
}
const rows = (outcome: unknown) => ({ rowCount: 1, rows: [{ outcome }] });
const signal = () => new AbortController().signal;

test("deletion commits success only; capacity and identity conflicts roll back a possibly new guard", async () => {
  for (const outcome of ["applied", "duplicate", "full", "conflict"] as const) {
    const f = fixture(rows(outcome));
    assert.equal(await f.store.deleteProfile(deletionFact, signal()), outcome);
    assert.deepEqual(f.decisions, [
      outcome === "applied" || outcome === "duplicate" ? "commit" : "rollback",
    ]);
    assert.deepEqual(f.queries[0]?.values, [
      deletionFact.eventId,
      deletionFact.accountId,
      deletionFact.profileId,
      deletionFact.version,
      deletionFact.occurredAt,
    ]);
    for (const status of ["indeterminate", "failed"] as const) {
      assert.equal(
        await fixture(rows(outcome), status).store.deleteProfile(deletionFact, signal()),
        "unavailable",
      );
    }
  }
});
test("quarantine acknowledges definite persistence, retains bounded exact bytes, and rolls back capacity/conflict", async () => {
  const record = signedIdentityRecord();
  for (const outcome of ["stored", "duplicate", "full", "conflict"] as const) {
    const f = fixture(rows(outcome));
    assert.equal(
      await f.store.quarantine(record, "signature", signal()),
      outcome === "conflict" ? "unavailable" : outcome,
    );
    assert.deepEqual(f.decisions, [
      outcome === "stored" || outcome === "duplicate" ? "commit" : "rollback",
    ]);
    assert.equal(f.queries[0]?.values?.[5], Buffer.from(record.value).toString("hex"));
    assert.equal(
      await fixture(rows(outcome), "indeterminate").store.quarantine(record, "signature", signal()),
      "unavailable",
    );
  }
});
test("replay decodes only an exact bounded stored record and requires a definite removal commit", async () => {
  const input = signedIdentityRecord();
  const record = {
    id: eventId(10),
    topic: input.topic,
    partition: input.partition,
    offset: input.offset,
    keyHex: Buffer.from(input.key ?? []).toString("hex"),
    valueHex: Buffer.from(input.value).toString("hex"),
    headers: Object.fromEntries(
      Object.entries(input.headers).map(([name, value]) => [
        name,
        Buffer.from(value).toString("hex"),
      ]),
    ),
  };
  const response = (value: unknown) => ({ rowCount: 1, rows: [{ record: value }] });
  const f = fixture(response(record));
  const decoded = await f.store.readQuarantine(eventId(10), signal());
  assert.ok(decoded);
  assert.deepEqual(Buffer.from(decoded.value), Buffer.from(input.value));
  assert.deepEqual(f.decisions, ["rollback"]);
  for (const value of [
    null,
    { ...record, id: eventId(11) },
    { ...record, topic: "foreign" },
    { ...record, valueHex: "zz" },
    { ...record, valueHex: "00".repeat(8193) },
    { ...record, headers: { bad: "zz" } },
    { ...record, extra: true },
  ]) {
    assert.equal(
      await fixture(response(value)).store.readQuarantine(eventId(10), signal()),
      undefined,
    );
  }
  for (const status of ["normal", "indeterminate", "failed"] as const) {
    assert.equal(
      await fixture({ rowCount: 1, rows: [{ removed: true }] }, status).store.completeReplay(
        eventId(10),
        signal(),
      ),
      status === "normal",
    );
  }
});
test("maximum quarantine bytes fit fixed SQL parameters without changing the wire record", async () => {
  const value = new Uint8Array(8192).fill(255);
  const headers = Object.fromEntries(
    ["a", "b", "c", "d"].map((name) => [name, new Uint8Array(1023).fill(128)]),
  );
  const f = fixture(rows("stored"));
  assert.equal(
    await f.store.quarantine({ ...signedIdentityRecord(), value, headers }, "signature", signal()),
    "stored",
  );
  const parameters = f.queries[0]?.values;
  assert.ok(parameters);
  assert.equal(parameters.length, 13);
  assert.ok(
    parameters.every((parameter) => typeof parameter !== "string" || parameter.length <= 4096),
  );
  assert.equal(parameters.slice(5, 9).join(""), Buffer.from(value).toString("hex"));
  assert.deepEqual(
    JSON.parse(parameters.slice(9, 12).join("")),
    Object.fromEntries(
      Object.entries(headers).map(([name, bytes]) => [name, Buffer.from(bytes).toString("hex")]),
    ),
  );
});
test("malformed responses, cancellation and invalid identifiers cannot acknowledge or dispatch invalid SQL", async () => {
  for (const response of [
    rows("invented"),
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [{ outcome: "applied" }] },
  ]) {
    const f = fixture(response);
    assert.equal(await f.store.deleteProfile(deletionFact, signal()), "unavailable");
    assert.equal(
      await f.store.quarantine(signedIdentityRecord(), "envelope", signal()),
      "unavailable",
    );
  }
  const f = fixture(rows("applied"));
  assert.equal(
    await f.store.deleteProfile({ ...deletionFact, version: 0 }, signal()),
    "unavailable",
  );
  assert.equal(await f.store.deleteProfile(deletionFact, AbortSignal.abort()), "unavailable");
  assert.equal(
    await f.store.quarantine(signedIdentityRecord(), "envelope", AbortSignal.abort()),
    "unavailable",
  );
  assert.equal(await f.store.readQuarantine("invalid", signal()), undefined);
  assert.equal(await f.store.completeReplay("invalid", signal()), false);
  assert.deepEqual(f.queries, []);
});
