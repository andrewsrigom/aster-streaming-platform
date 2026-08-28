import assert from "node:assert/strict";
import test from "node:test";
import { createProgressQueries, type ProgressReadStore } from "../src/application/read-progress.js";
import type { ProgressPorts, ProgressRequest } from "../src/application/progress-ports.js";
import { normalizeProgressPageInput, progressCursor } from "../src/domain/progress-page.js";
import type { ProgressState } from "../src/domain/progress.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { profileId: id(2), first: 2, after: null };
const row = (n: number, patch: Partial<ProgressState> = {}): ProgressState => ({
  id: id(n),
  accountId: id(1),
  profileId: id(2),
  titleId: id(n + 100),
  playbackSessionId: id(3),
  sequence: 1,
  version: 1,
  positionMs: 1000,
  durationMs: 6000,
  status: "IN_PROGRESS",
  occurredAt: 100,
  updatedAt: 100,
  ...patch,
});
function fixture(rows: readonly ProgressState[] = []) {
  let now = 100;
  const calls = { owner: 0, store: 0 };
  const controller = new AbortController();
  const request: ProgressRequest = {
    credential: "synthetic-read-credential",
    correlationId: id(4),
    signal: controller.signal,
  };
  const authority = { accountId: id(1), profileId: id(2), checkedAt: 100, expiresAt: 900 };
  const identity: ProgressPorts["identity"] = {
    authorizeProfile: (credential, profileId, context) => {
      assert.equal(credential, request.credential);
      assert.equal(profileId, input.profileId);
      assert.equal(context.correlationId, request.correlationId);
      calls.owner++;
      return Promise.resolve({ status: "completed", value: authority });
    },
  };
  const store: ProgressReadStore = {
    page: (key, signal) => {
      calls.store++;
      assert.equal(key.accountId, id(1));
      assert.equal(key.input.profileId, input.profileId);
      assert.equal(signal.aborted, false);
      return Promise.resolve({ status: "completed", value: rows });
    },
  };
  return {
    queries: createProgressQueries({ identity, store, now: () => now }),
    identity,
    store,
    calls,
    request,
    controller,
    authority,
    setTime(value: number) {
      now = value;
    },
  };
}

test("cursor is canonical, bounded and tied to profile/list; hostile input does not invoke getters", () => {
  const cursor = progressCursor(id(2), "history", row(10));
  assert.deepEqual(normalizeProgressPageInput({ ...input, after: cursor }, "history"), {
    ...input,
    after: { updatedAt: 100, id: id(10) },
  });
  for (const after of [
    cursor + ".",
    cursor.replace("e1", "e2"),
    cursor.replace(".100.", ".0100."),
    cursor.replace(".100.", ".1e2."),
    cursor.replace(".100.", ".Infinity."),
    cursor.replace(".100.", ".253402300800."),
    cursor.replace(id(2), id(5)),
    cursor.replace("history", "continue"),
    "x".repeat(129),
    "",
    0,
  ]) {
    assert.equal(normalizeProgressPageInput({ ...input, after }, "history"), undefined);
  }
  for (const first of [0, 21, 1.5, NaN, "2", undefined]) {
    assert.equal(normalizeProgressPageInput({ ...input, first }, "history"), undefined);
  }
  assert.equal(normalizeProgressPageInput({ ...input, accountId: id(1) }, "history"), undefined);
  assert.equal(
    normalizeProgressPageInput({ ...input, [Symbol("foreign")]: true }, "history"),
    undefined,
  );
  assert.equal(
    normalizeProgressPageInput(
      {
        ...input,
        get after() {
          throw new Error("must not execute");
        },
      },
      "history",
    ),
    undefined,
  );
});

test("history is a descending tied-key page with one-row lookahead and completed retention", async () => {
  const f = fixture([
    row(12, { status: "COMPLETED" }),
    row(11),
    row(10, { status: "NOT_STARTED" }),
  ]);
  const result = await f.queries.page("history", input, f.request);
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.value.edges.map((edge) => edge.node.id),
    [id(12), id(11)],
  );
  assert.deepEqual(result.value.pageInfo, {
    hasNextPage: true,
    endCursor: progressCursor(id(2), "history", row(11)),
  });
  assert.deepEqual(f.calls, { owner: 1, store: 1 });
  const next = fixture([row(10)]);
  const second = await next.queries.page(
    "history",
    { ...input, after: result.value.pageInfo.endCursor },
    next.request,
  );
  assert.equal(second.status, "completed");
  assert.deepEqual(
    second.value.edges.map((edge) => edge.node.id),
    [id(10)],
  );
  assert.equal(second.value.pageInfo.hasNextPage, false);
});

test("empty page succeeds, but dependency failure is never represented as empty success", async () => {
  const f = fixture();
  assert.deepEqual(await f.queries.page("continue", input, f.request), {
    status: "completed",
    value: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  });
  f.store.page = () => Promise.resolve({ status: "unavailable" });
  assert.deepEqual(await f.queries.page("continue", input, f.request), { status: "unavailable" });
});

test("input and missing authority stop before SQL; each page freshly checks ownership", async () => {
  const f = fixture();
  assert.equal(
    (await f.queries.page("history", { ...input, first: 21 }, f.request)).status,
    "invalid_input",
  );
  assert.equal(
    (await f.queries.page("history", input, { ...f.request, credential: undefined })).status,
    "unauthenticated",
  );
  assert.deepEqual(f.calls, { owner: 0, store: 0 });
  await f.queries.page("history", input, f.request);
  f.identity.authorizeProfile = () => Promise.resolve({ status: "not_found" });
  assert.deepEqual(await f.queries.page("history", input, f.request), { status: "not_found" });
  assert.equal(f.calls.store, 1);
});

test("foreign, expired, future and malformed Identity snapshots disclose nothing", async () => {
  for (const patch of [
    { profileId: id(9) },
    { accountId: "invalid" },
    { checkedAt: 97 },
    { checkedAt: 101 },
    { expiresAt: 100 },
    { expiresAt: Infinity },
  ]) {
    const f = fixture([row(10)]);
    Object.assign(f.authority, patch);
    assert.equal((await f.queries.page("history", input, f.request)).status, "unavailable");
    assert.equal(f.calls.store, 0);
  }
});

test("authorization is rechecked after SQL and cancelled reads cannot disclose late rows", async () => {
  const f = fixture([row(10)]);
  f.store.page = () => {
    f.setTime(103);
    return Promise.resolve({ status: "completed", value: [row(10)] });
  };
  assert.equal((await f.queries.page("history", input, f.request)).status, "unavailable");
  const cancelled = fixture();
  cancelled.controller.abort();
  assert.equal(
    (await cancelled.queries.page("history", input, cancelled.request)).status,
    "cancelled",
  );
  assert.deepEqual(cancelled.calls, { owner: 0, store: 0 });
  const late = fixture();
  const entered = Promise.withResolvers<undefined>();
  const completed = Promise.withResolvers<Awaited<ReturnType<ProgressReadStore["page"]>>>();
  late.store.page = () => {
    entered.resolve(undefined);
    return completed.promise;
  };
  const pending = late.queries.page("history", input, late.request);
  await entered.promise;
  late.controller.abort();
  assert.equal((await pending).status, "cancelled");
  completed.resolve({ status: "completed", value: [row(10)] });
  await Promise.resolve();
});

test("invalid order, duplicate title, oversize, foreign and future SQL rows fail closed", async () => {
  for (const rows of [
    [row(10), row(11)],
    [row(10), row(10)],
    [row(11), row(10, { titleId: row(11).titleId })],
    [row(13), row(12), row(11), row(10)],
    [row(10, { accountId: id(9) })],
    [row(10, { profileId: id(9) })],
    [row(10, { updatedAt: 101 })],
    [row(10, { positionMs: -1 })],
  ]) {
    const f = fixture(rows);
    assert.equal((await f.queries.page("history", input, f.request)).status, "unavailable");
  }
  const f = fixture([row(10, { status: "COMPLETED" })]);
  assert.equal((await f.queries.page("continue", input, f.request)).status, "unavailable");
});

test("live traversal rejects rows at/ahead of its cursor; a fresh traversal can see moved titles", async () => {
  const after = progressCursor(id(2), "history", row(12));
  const f = fixture([row(12)]);
  assert.equal(
    (await f.queries.page("history", { ...input, after }, f.request)).status,
    "unavailable",
  );
  assert.equal((await f.queries.page("history", input, f.request)).status, "completed");
});
