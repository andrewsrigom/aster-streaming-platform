import assert from "node:assert/strict";
import test from "node:test";
import { createWatchlistWriter } from "../src/application/set-watchlist.js";
import {
  advanceWatchlist,
  createWatchlistEvent,
  normalizeWatchlistInput,
  normalizeWatchlistPageInput,
  watchlistCursor,
  watchlistRequestPayload,
} from "../src/domain/watchlist.js";
import {
  watchlistEntry as entry,
  watchlistFixture,
  watchlistId as id,
  watchlistInput as input,
} from "./watchlist-fixture.js";

test("watchlist input/cursor are exact, canonical, bounded and profile-bound without invoking getters", () => {
  assert.deepEqual(normalizeWatchlistInput(input()), input());
  for (const value of [
    { ...input(), present: 1 },
    { ...input(), accountId: id(1) },
    { ...input(), titleId: "bad" },
    { ...input(), [Symbol("x")]: 1 },
    {
      ...input(),
      get present() {
        throw new Error("not called");
      },
    },
  ]) {
    assert.equal(normalizeWatchlistInput(value), undefined);
  }
  assert.notEqual(
    watchlistRequestPayload(input()),
    watchlistRequestPayload(input({ present: false })),
  );
  assert.notEqual(
    watchlistRequestPayload(input()),
    watchlistRequestPayload(input({ titleId: id(8) })),
  );
  const cursor = watchlistCursor(id(2), entry(10));
  const page = { profileId: id(2), first: 20, after: cursor };
  assert.deepEqual(normalizeWatchlistPageInput(page)?.after, { addedAt: 100, id: id(10) });
  for (const after of [
    cursor + ".",
    cursor.replace("w1", "w2"),
    cursor.replace(".100.", ".0100."),
    cursor.replace(id(2), id(3)),
    "x".repeat(129),
    0,
    undefined,
  ]) {
    assert.equal(normalizeWatchlistPageInput({ ...page, after }), undefined);
  }
  for (const first of [0, 21, 1.5, "20", NaN]) {
    assert.equal(normalizeWatchlistPageInput({ ...page, first }), undefined);
  }
});

test("profile watchlist version preserves identity across opposite commands and rejects corrupt history", () => {
  const context = { accountId: id(1), aggregateId: id(8), now: 100 };
  const first = advanceWatchlist(null, input(), context);
  assert.ok(first);
  assert.equal(first.version, 1);
  const removed = advanceWatchlist(first, input({ present: false }), context);
  assert.ok(removed);
  assert.equal(removed.id, first.id);
  assert.equal(removed.version, 2);
  assert.equal(removed.present, false);
  for (const current of [
    { ...first, accountId: id(7) },
    { ...first, profileId: id(7) },
    { ...first, updatedAt: 101 },
    { ...first, version: 2_147_483_647 },
  ]) {
    assert.equal(advanceWatchlist(current, input(), context), undefined);
  }
  const event = createWatchlistEvent(id(9), removed, { correlationId: id(6), causationId: id(4) });
  assert.deepEqual(event.payload, { profileId: id(2), titleId: id(3), present: false });
  assert.equal(event.aggregate.type, "Watchlist");
  assert.equal(JSON.stringify(event).includes("accountId"), false);
});

test("same-key replay survives a later removal and Catalog outage without another effect", async () => {
  const f = watchlistFixture();
  const added = await f.writer.set(input(), f.request);
  assert.equal(added.status, "completed");
  const removed = await f.writer.set(input({ present: false, idempotencyKey: id(5) }), f.request);
  assert.equal(removed.status, "completed");
  assert.equal(removed.value.version, 2);
  f.ports.catalog.visibility = () => {
    throw new Error("Catalog offline");
  };
  assert.deepEqual(await f.writer.set(input(), f.request), added);
  assert.equal(f.state().entries.length, 0);
  assert.equal(f.state().head?.present, false);
  assert.equal(f.state().events.length, 2);
  assert.equal(f.calls.transaction, 2);
  assert.equal(f.calls.identity, 3);
  assert.equal(f.calls.catalog.length, 1);
});

test("watchlist admission follows owner and replay but precedes Catalog and persistence", async () => {
  const rejected = watchlistFixture();
  let admissions = 0;
  const writer = createWatchlistWriter({
    ...rejected.ports,
    limiter: {
      admit: (_operation, accountId, admissionId) => {
        admissions++;
        assert.equal(accountId, id(1));
        assert.equal(
          admissionId,
          rejected.ports.digest(
            `${rejected.ports.digest(`set_watchlist\0${id(1)}\0${id(2)}\0${id(4)}`)}\0${rejected.ports.digest(watchlistRequestPayload(input()))}`,
          ),
        );
        return Promise.resolve({ status: "rejected", retryAfterMs: 1_000 });
      },
    },
  });
  assert.deepEqual(await writer.set(input(), rejected.request), {
    status: "limit_exceeded",
    retryAfterMs: 1_000,
  });
  assert.equal(admissions, 1);
  assert.equal(rejected.calls.receipt, 1);
  assert.equal(rejected.calls.catalog.length, 0);
  assert.equal(rejected.calls.transaction, 0);

  const replayed = watchlistFixture();
  const first = await replayed.writer.set(input(), replayed.request);
  const replayWriter = createWatchlistWriter({
    ...replayed.ports,
    limiter: {
      admit: () => {
        throw new Error("must not admit replay");
      },
    },
  });
  assert.deepEqual(await replayWriter.set(input(), replayed.request), first);
});

test("concurrent identical watchlist retries consume one admission and replay one effect", async () => {
  const f = watchlistFixture();
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let admissions = 0;
  const writer = createWatchlistWriter({
    ...f.ports,
    limiter: {
      admit: async () => {
        admissions++;
        entered.resolve(undefined);
        await release.promise;
        return { status: "allowed" };
      },
    },
  });
  const attempts = Array.from({ length: 5 }, () => writer.set(input(), f.request));
  const conflict = writer.set(input({ present: false }), f.request);
  await entered.promise;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(admissions, 1);
  release.resolve(undefined);
  const results = await Promise.all(attempts);
  assert.ok(results.every((result) => result.status === "completed"));
  assert.ok(results.every((result) => JSON.stringify(result) === JSON.stringify(results[0])));
  assert.equal(admissions, 1);
  assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.calls.transaction, 1);
  assert.equal(f.state().events.length, 1);
  assert.equal((await conflict).status, "conflict");
  assert.equal(admissions, 1);
});

test("unsaved watchlist retries share admission only for the same canonical payload across replicas", async () => {
  const f = watchlistFixture();
  f.retired.add(id(3));
  f.retired.add(id(7));
  const admissions: string[] = [];
  const ports = {
    ...f.ports,
    limiter: {
      admit: (_operation: string, _accountId: string, admissionId: string) => {
        admissions.push(admissionId);
        return Promise.resolve({ status: "allowed" as const });
      },
    },
  };
  const first = createWatchlistWriter(ports);
  const second = createWatchlistWriter(ports);
  assert.equal((await first.set(input(), f.request)).status, "not_visible");
  assert.equal((await second.set(input(), f.request)).status, "not_visible");
  assert.equal((await first.set(input({ titleId: id(7) }), f.request)).status, "not_visible");
  assert.equal(f.state().receipts.length, 0);
  assert.equal((await second.set(input({ present: false }), f.request)).status, "completed");
  assert.equal(admissions.length, 4);
  assert.equal(admissions[0], admissions[1]);
  assert.equal(new Set(admissions).size, 3);
  assert.equal(f.state().receipts.length, 1);
  assert.equal(f.calls.transaction, 1);
});

test("profile-scoped key conflicts across title and action before Catalog access", async () => {
  const f = watchlistFixture();
  assert.equal((await f.writer.set(input(), f.request)).status, "completed");
  for (const patch of [{ titleId: id(7) }, { present: false }]) {
    assert.equal((await f.writer.set(input(patch), f.request)).status, "conflict");
  }
  assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.state().events.length, 1);
});

test("repeated new-key add preserves entry order; remove is allowed for hidden titles without Catalog", async () => {
  const f = watchlistFixture();
  assert.equal((await f.writer.set(input(), f.request)).status, "completed");
  const original = f.state().entries[0];
  f.setTime(101);
  assert.equal(
    (await f.writer.set(input({ idempotencyKey: id(5) }), f.request)).status,
    "completed",
  );
  assert.deepEqual(f.state().entries[0], original);
  f.retired.add(id(3));
  assert.equal(
    (await f.writer.set(input({ idempotencyKey: id(6) }), f.request)).status,
    "not_visible",
  );
  f.ports.catalog.visibility = () => {
    throw new Error("must not call");
  };
  assert.equal(
    (await f.writer.set(input({ idempotencyKey: id(7), present: false }), f.request)).status,
    "completed",
  );
  assert.equal(f.state().entries.length, 0);
});

test("invalid input, missing/revoked/wrong/expired owner and pre-cancellation avoid writes", async () => {
  const f = watchlistFixture();
  assert.equal((await f.writer.set({ ...input(), extra: 1 }, f.request)).status, "invalid_input");
  assert.equal(
    (await f.writer.set(input(), { ...f.request, credential: undefined })).status,
    "unauthenticated",
  );
  assert.equal(f.calls.identity, 0);
  f.authority.profileId = id(8);
  assert.equal((await f.writer.set(input(), f.request)).status, "unavailable");
  f.authority.profileId = id(2);
  f.setTime(103);
  assert.equal((await f.writer.set(input(), f.request)).status, "unavailable");
  f.setTime(100);
  f.ports.identity.authorizeProfile = () => Promise.resolve({ status: "not_found" });
  assert.equal((await f.writer.set(input(), f.request)).status, "not_found");
  f.controller.abort();
  assert.equal((await f.writer.set(input(), f.request)).status, "cancelled");
  assert.equal(f.calls.transaction, 0);
});

test("expired authority, deletion fences, retained capacity and cancellation roll back", async () => {
  for (const mode of ["deleted", "receipts", "outbox", "expiry", "abort"] as const) {
    const f = watchlistFixture();
    if (mode === "deleted") {
      f.control.deleted = true;
    }
    if (mode === "receipts" || mode === "outbox") {
      f.control.counts[mode] = 1024;
    }
    if (mode === "expiry") {
      f.control.afterSave = () => {
        f.setTime(103);
      };
    }
    if (mode === "abort") {
      f.control.afterSave = () => {
        f.controller.abort();
      };
    }
    const result = await f.writer.set(input(), f.request);
    assert.equal(
      result.status,
      mode === "deleted"
        ? "not_found"
        : mode === "expiry"
          ? "unavailable"
          : mode === "abort"
            ? "indeterminate"
            : "backpressure",
    );
    assert.equal(f.state().events.length, 0);
    assert.equal(f.state().head, null);
  }
});

test("unknown COMMIT can be resolved only by same-key replay; no duplicate event", async () => {
  const f = watchlistFixture();
  f.control.indeterminate = true;
  assert.equal((await f.writer.set(input(), f.request)).status, "indeterminate");
  f.control.indeterminate = false;
  assert.equal((await f.writer.set(input(), f.request)).status, "completed");
  assert.equal(f.state().events.length, 1);
  assert.equal(f.calls.transaction, 1);
});

test("watchlist hides gaps before pagination and hasNextPage, using bounded batches and one SQL read", async () => {
  const f = watchlistFixture();
  const rows = Array.from({ length: 45 }, (_, n) => entry(100 - n));
  f.setEntries(rows);
  for (const row of rows.slice(0, 40)) {
    f.retired.add(row.titleId);
  }
  const result = await f.queries.page({ profileId: id(2), first: 2, after: null }, f.request);
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.value.edges.map((edge) => edge.node.id),
    [id(60), id(59)],
  );
  assert.equal(result.value.pageInfo.endCursor, watchlistCursor(id(2), entry(59)));
  assert.equal(result.value.pageInfo.hasNextPage, true);
  assert.deepEqual(
    f.calls.catalog.map((ids) => ids.length),
    [20, 20, 5],
  );
  assert.equal(f.calls.page, 1);
});

test("all hidden memberships produce an empty page without hidden cursors; maximum scan is thirteen batches", async () => {
  const f = watchlistFixture();
  const rows = Array.from({ length: 256 }, (_, n) => entry(500 - n));
  f.setEntries(rows);
  for (const row of rows) {
    f.retired.add(row.titleId);
  }
  assert.deepEqual(await f.queries.page({ profileId: id(2), first: 20, after: null }, f.request), {
    status: "completed",
    value: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  });
  assert.equal(f.calls.catalog.length, 13);
  assert.equal(f.calls.catalog.at(-1)?.length, 16);
});

test("visible lookahead stops subsequent Catalog work; empty membership needs no Catalog call", async () => {
  const f = watchlistFixture();
  const page = { profileId: id(2), first: 1, after: null };
  assert.equal((await f.queries.page(page, f.request)).status, "completed");
  assert.equal(f.calls.catalog.length, 0);
  f.setEntries(Array.from({ length: 40 }, (_, n) => entry(100 - n)));
  const result = await f.queries.page(page, f.request);
  assert.equal(result.status, "completed");
  assert.equal(result.value.pageInfo.hasNextPage, true);
  assert.equal(f.calls.catalog.length, 1);
});

test("pages reject wrong owner, duplicates, overflow, order, future time and rows ahead of cursor", async () => {
  const page = { profileId: id(2), first: 2, after: null };
  for (const rows of [
    [entry(10, { accountId: id(7) })],
    [entry(10, { profileId: id(7) })],
    [entry(10), entry(10)],
    [entry(9), entry(10)],
    [entry(10, { addedAt: 101 })],
    Array.from({ length: 257 }, (_, n) => entry(500 - n)),
    [entry(10), entry(9, { titleId: entry(10).titleId })],
  ]) {
    const f = watchlistFixture();
    f.setEntries(rows);
    assert.equal((await f.queries.page(page, f.request)).status, "unavailable");
    assert.equal(f.calls.catalog.length, 0);
  }
  const f = watchlistFixture();
  f.setEntries([entry(11)]);
  assert.equal(
    (await f.queries.page({ ...page, after: watchlistCursor(id(2), entry(10)) }, f.request)).status,
    "unavailable",
  );
});

test("missing/stale/reordered Catalog results and late authorization never become empty success", async () => {
  for (const mode of [
    "missing",
    "reordered",
    "expired",
    "future",
    "unbounded",
    "unavailable",
    "late",
  ] as const) {
    const f = watchlistFixture();
    f.setEntries([entry(10), entry(9)]);
    f.ports.catalog.visibility = (ids) => {
      if (mode === "unavailable") {
        return Promise.resolve({ status: "unavailable" });
      }
      if (mode === "late") {
        f.setTime(103);
      }
      const value = {
        titles: ids.map((titleId) => ({ titleId, visible: true })),
        checkedAt: mode === "future" ? 101 : 100,
        expiresAt: mode === "expired" ? 100 : mode === "unbounded" ? 1000 : 102,
      };
      if (mode === "missing") {
        value.titles.pop();
      }
      if (mode === "reordered") {
        value.titles.reverse();
      }
      return Promise.resolve({ status: "completed", value });
    };
    assert.equal(
      (await f.queries.page({ profileId: id(2), first: 1, after: null }, f.request)).status,
      "unavailable",
    );
  }
});

test("cancellation while Catalog is pending returns promptly without disclosing membership", async () => {
  const f = watchlistFixture();
  f.setEntries([entry(10)]);
  f.ports.catalog.visibility = () => {
    f.controller.abort();
    return new Promise(() => undefined);
  };
  assert.equal(
    (await f.queries.page({ profileId: id(2), first: 1, after: null }, f.request)).status,
    "cancelled",
  );
});
