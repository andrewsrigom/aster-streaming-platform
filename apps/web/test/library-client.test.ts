import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Kind, parse, print } from "graphql";
import { createEngagementClient } from "../features/engagement/client.ts";
import {
  libraryOperations,
  WATCHLIST_MEMBERSHIP,
  SET_WATCHLIST,
  readLibraryVariables,
  readLibraryPage,
  readWatchlistCommand,
  readWatchlistOutcome,
  readWatchlistMembership,
  type LibraryKind,
  type LibraryData,
  type WatchlistCommand,
  type WatchlistOutcome,
} from "../features/engagement/library-operations.ts";
import {
  createWatchlistIntent,
  type WatchlistIntentState,
} from "../features/engagement/watchlist-intent.ts";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const variables = { profileId: id(1), first: 20, after: null };
const scope = { profileId: id(1), expiresAt: 1060000 };
const input: WatchlistCommand = {
  profileId: id(1),
  titleId: id(2),
  idempotencyKey: id(3),
  present: true,
};
function page(kind: LibraryKind, n = 2) {
  const cursor = `e1.${kind}.${id(1)}.1000.${id(n)}`;
  return {
    code: "COMPLETED",
    correlationId: id(9),
    connection: {
      edges: [
        {
          cursor,
          node: {
            id: id(n + 100),
            titleId: id(n),
            title: { id: id(n), localized: { title: "Synthetic title" } },
            ...(kind === "watchlist"
              ? { profileId: id(1), addedAt: 1000 }
              : {
                  positionMs: 15000,
                  durationMs: 60000,
                  status: "IN_PROGRESS",
                }),
          },
        },
      ],
      pageInfo: { endCursor: cursor, hasNextPage: true },
    },
  };
}
function completed(command = input): WatchlistOutcome {
  return {
    code: "COMPLETED",
    correlationId: id(9),
    change: {
      id: id(8),
      profileId: command.profileId,
      titleId: command.titleId,
      present: command.present,
      version: 1,
      updatedAt: 1000,
    },
  };
}
test("library and watchlist documents exactly match the first-party inventory", async () => {
  const known = parse(
    await readFile(
      new URL("../../../infra/router/known-operations.graphql", import.meta.url),
      "utf8",
    ),
  );
  for (const document of [
    ...Object.values(libraryOperations).map((op) => op.document),
    WATCHLIST_MEMBERSHIP,
    SET_WATCHLIST,
  ]) {
    const operation = document.definitions[0];
    assert.ok(operation?.kind === Kind.OPERATION_DEFINITION);
    const entry = known.definitions.find(
      (node) =>
        node.kind === Kind.OPERATION_DEFINITION && node.name?.value === operation.name?.value,
    );
    assert.ok(entry);
    assert.equal(print(operation), print(entry));
  }
});
test("library variables bound page sizes, scope and traversal bytes", () => {
  assert.deepEqual(readLibraryVariables(variables, id(1)), variables);
  for (const patch of [
    { profileId: id(99) },
    { first: 0 },
    { first: 21 },
    { first: 1.5 },
    { after: "x".repeat(129) },
    { after: "../?bad" },
  ]) {
    assert.throws(() => readLibraryVariables({ ...variables, ...patch }, id(1)));
  }
});
test("library projection handles retained history and strips unselected private fields", () => {
  for (const kind of Object.keys(libraryOperations) as LibraryKind[]) {
    const data = page(kind);
    assert.deepEqual(readLibraryPage(data, variables, kind), data);
    const projected = readLibraryPage({ ...data, private: "canary" }, variables, kind);
    assert.equal(JSON.stringify(projected).includes("canary"), false);
  }
  const data = page("history");
  const edge = data.connection.edges[0];
  assert.ok(edge);
  assert.equal(
    readLibraryPage(
      {
        ...data,
        connection: {
          ...data.connection,
          edges: [{ ...edge, node: { ...edge.node, title: null, status: "COMPLETED" } }],
        },
      },
      variables,
      "history",
    ).connection.edges[0]?.node.title,
    null,
  );
});
test("unavailable, oversized, substituted and stalled pages never become empty success", () => {
  const data = page("continue");
  const edge = data.connection.edges[0];
  assert.ok(edge);
  const bad = [
    null,
    { ...data, code: "UNAVAILABLE", connection: null },
    { ...data, connection: { ...data.connection, edges: Array.from({ length: 21 }, () => edge) } },
    { ...data, connection: { ...data.connection, edges: [edge, edge] } },
    {
      ...data,
      connection: { ...data.connection, pageInfo: { endCursor: null, hasNextPage: true } },
    },
    ...[
      { status: "COMPLETED" },
      { positionMs: 60001 },
      { title: { id: id(99), localized: { title: "Foreign" } } },
    ].map((patch) => ({
      ...data,
      connection: { ...data.connection, edges: [{ ...edge, node: { ...edge.node, ...patch } }] },
    })),
  ];
  for (const value of bad) {
    assert.throws(() => readLibraryPage(value, variables, "continue"));
  }
  assert.throws(() => readLibraryPage(data, { ...variables, after: edge.cursor }, "continue"));
  const owned = page("watchlist");
  assert.throws(() => readLibraryPage(owned, { ...variables, profileId: id(99) }, "watchlist"));
  const empty = {
    ...data,
    connection: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
  };
  assert.deepEqual(readLibraryPage(empty, variables, "continue"), empty);
});
test("real Apollo library requests replace pages, preserve bounded views and use canonical documents", async (t) => {
  let current = 2;
  const calls: string[] = [];
  const runtime = createEngagementClient(
    scope,
    (url, init) => {
      assert.equal(url, "http://127.0.0.1:4000/graphql");
      assert.equal(init?.credentials, "include");
      assert.equal(init.redirect, "error");
      assert.ok(typeof init.body === "string");
      const request = JSON.parse(init.body) as {
        operationName: string;
        query: string;
        variables: typeof variables;
      };
      assert.deepEqual(Object.keys(request).sort(), ["operationName", "query", "variables"]);
      const match = Object.entries(libraryOperations).find(
        ([, op]) => op.name === request.operationName,
      );
      assert.ok(match);
      const [kind, op] = match;
      assert.equal(request.query, print(op.document));
      assert.equal(request.variables.profileId, scope.profileId);
      calls.push(request.operationName);
      return Promise.resolve(
        Response.json({ data: { [op.field]: page(kind as LibraryKind, current) } }),
      );
    },
    () => 1000000,
  );
  t.after(() => {
    runtime.dispose();
  });
  for (const op of Object.values(libraryOperations)) {
    let after: string | null = null;
    for (let n = 2; n < 28; n++) {
      current = n;
      const result: { data?: LibraryData | undefined } = await runtime.client.query({
        query: op.document,
        variables: { ...variables, after },
      });
      after = result.data?.[op.field]?.connection.pageInfo.endCursor ?? null;
      assert.equal(result.data?.[op.field]?.connection.edges[0]?.node.titleId, id(n));
    }
  }
  assert.equal(calls.length, 78);
  const cached = JSON.stringify(runtime.client.cache.extract());
  assert.ok(cached.length < 6000);
  assert.equal(cached.includes(id(2)), false);
  assert.ok(cached.includes(id(27)));
});
test("membership null, partial failure and foreign profile never appear as false", async (t) => {
  for (const value of [
    null,
    { id: id(1), inWatchlist: null },
    { id: id(99), inWatchlist: false },
  ]) {
    assert.throws(() => readWatchlistMembership(value, input));
  }
  assert.deepEqual(readWatchlistMembership({ id: id(1), inWatchlist: false }, input), {
    id: id(1),
    inWatchlist: false,
  });
  const runtime = createEngagementClient(
    scope,
    () =>
      Promise.resolve(
        Response.json({
          data: { profile: { id: id(1), inWatchlist: false } },
          errors: [{ message: "private canary" }],
        }),
      ),
    () => 1000000,
  );
  t.after(() => {
    runtime.dispose();
  });
  await assert.rejects(
    runtime.client.query({ query: WATCHLIST_MEMBERSHIP, variables: input }),
    (error: Error) => !error.message.includes("canary"),
  );
});
test("watchlist commands and acknowledgements cannot substitute scope or action", () => {
  assert.deepEqual(readWatchlistCommand(input, id(1)), input);
  for (const patch of [
    { profileId: id(99) },
    { present: "true" },
    { titleId: "bad" },
    { extra: 1 },
  ]) {
    assert.throws(() => readWatchlistCommand({ ...input, ...patch }, id(1)));
  }
  assert.deepEqual(readWatchlistOutcome(completed(), input), completed());
  const limited = {
    code: "LIMIT_EXCEEDED",
    correlationId: id(6),
    retryAfterMs: 1_000,
    change: null,
  } as const;
  assert.deepEqual(readWatchlistOutcome(limited, input), limited);
  assert.throws(() => readWatchlistOutcome({ ...limited, retryAfterMs: 30_001 }, input));
  assert.throws(() => readWatchlistOutcome({ ...limited, retryAfterMs: undefined }, input));
  for (const patch of [
    { profileId: id(99) },
    { titleId: id(99) },
    { present: false },
    { version: 0 },
  ]) {
    assert.throws(() =>
      readWatchlistOutcome({ ...completed(), change: { ...completed().change, ...patch } }, input),
    );
  }
  assert.throws(() => readWatchlistOutcome({ ...completed(), code: "UNAVAILABLE" }, input));
});
test("watchlist intent coalesces clicks and retries at most twice with the identical immutable command", async () => {
  const states: WatchlistIntentState[] = [];
  const calls: WatchlistCommand[] = [];
  let resolved = () => {};
  const held = new Promise<void>((resolve) => {
    resolved = resolve;
  });
  const intent = createWatchlistIntent({
    ...input,
    identifier: () => input.idempotencyKey,
    onState: (state) => {
      states.push(state);
    },
    onCompleted() {
      assert.fail("Not acknowledged");
    },
    async send(command) {
      calls.push(command);
      await held;
      throw new Error("network failure");
    },
  });
  const first = intent.submit();
  await intent.submit();
  assert.equal(calls.length, 1);
  resolved();
  await first;
  assert.equal(states.at(-1)?.canRetry, true);
  await intent.submit();
  await intent.submit();
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]);
  assert.ok(Object.isFrozen(calls[0]));
  assert.deepEqual(states.at(-1), { status: "unconfirmed", canRetry: false });
  intent.dispose();
});
test("watchlist durable acknowledgement is required and disposal ignores late completion", async () => {
  for (const dispose of [false, true]) {
    const states: WatchlistIntentState[] = [];
    let completions = 0;
    let respond: (outcome: WatchlistOutcome) => void = () => {};
    let signal: AbortSignal | undefined;
    const response = new Promise<WatchlistOutcome>((resolve) => {
      respond = resolve;
    });
    const intent = createWatchlistIntent({
      ...input,
      identifier: () => input.idempotencyKey,
      onState: (state) => {
        states.push(state);
      },
      onCompleted() {
        completions++;
      },
      send(_command, cancellation) {
        signal = cancellation;
        return response;
      },
    });
    const pending = intent.submit();
    if (dispose) {
      intent.dispose();
      assert.equal(signal?.aborted, true);
    }
    respond(completed());
    await pending;
    assert.equal(completions, dispose ? 0 : 1);
    assert.equal(states.at(-1)?.status, dispose ? "saving" : "saved");
    intent.dispose();
  }
});
