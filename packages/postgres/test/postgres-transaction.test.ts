import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import type { AsterPostgresTransaction } from "../src/index.js";
import {
  createAsterPostgresAdapterWithPoolFactory,
  type AsterPostgresPoolClient,
} from "../src/infrastructure/postgres-adapter.js";

type Query = Parameters<AsterPostgresPoolClient["query"]>[0];
const empty = { rowCount: 0, rows: [] };

function fixture(
  handler: (query: Query) => ReturnType<AsterPostgresPoolClient["query"]> = () =>
    Promise.resolve(empty),
  budget = 100,
) {
  const queries: Query[] = [];
  const releases: boolean[] = [];
  let connections = 0;
  const client: AsterPostgresPoolClient = {
    query(query) {
      queries.push(query);
      return handler(query);
    },
    release(destroy = false) {
      releases.push(destroy);
    },
  };
  const adapter = createAsterPostgresAdapterWithPoolFactory(
    {
      connectionString: "postgresql://aster@127.0.0.1/aster",
      telemetry: {
        startDependencyOperation: () => ({ status: "rejected", reason: "telemetry_closed" }),
      },
      maxConnections: 1,
      operationTimeoutMs: budget,
    },
    () => ({
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      connect: () => {
        connections += 1;
        return Promise.resolve(client);
      },
      end: () => Promise.resolve(),
    }),
  );
  return { adapter, queries, releases, connections: () => connections };
}

test("one lease commits parameterized work or acknowledges a requested rollback", async () => {
  const f = fixture();
  for (const action of ["commit", "rollback"] as const) {
    const result = await f.adapter.transaction(async (tx) => {
      await tx.query({ text: "SELECT $1 AS value", values: ["not-sql;secret"] });
      return { action, value: 42 };
    });
    assert.deepEqual(result, {
      status: action === "commit" ? "committed" : "rolled_back",
      value: 42,
    });
  }
  assert.equal(f.connections(), 2);
  assert.deepEqual(
    f.queries.map((q) => q.text),
    [
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "SELECT $1 AS value",
      "COMMIT",
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "SELECT $1 AS value",
      "ROLLBACK",
    ],
  );
  assert.deepEqual(f.queries[1]?.values, ["not-sql;secret"]);
  assert.deepEqual(f.releases, [false, false]);
  assert.equal((await f.adapter.close()).status, "completed");
});

test("failed queries poison the transaction even when application code catches them", async () => {
  const f = fixture((q) =>
    q.text.startsWith("SELECT")
      ? Promise.reject(new Error("private-vendor-detail"))
      : Promise.resolve(empty),
  );
  const result = await f.adapter.transaction(async (tx) => {
    await assert.rejects(tx.query({ text: "SELECT 1" }), {
      message: "PostgreSQL transaction statement failed.",
    });
    return { action: "commit", value: "must-not-return" };
  });
  assert.deepEqual(result, { status: "unavailable" });
  assert.equal(
    f.queries.some((q) => q.text === "COMMIT"),
    false,
  );
  assert.deepEqual(f.releases, [true]);
  await f.adapter.close();
});

test("callback failure retires its connection and never commits partial work", async () => {
  const f = fixture();
  assert.deepEqual(
    await f.adapter.transaction(async (tx) => {
      await tx.query({ text: "INSERT INTO demo VALUES ($1)", values: [1] });
      throw new Error("private-application-detail");
    }),
    { status: "failed" },
  );
  assert.deepEqual(f.releases, [true]);
  assert.equal(f.queries.at(-1)?.text, "INSERT INTO demo VALUES ($1)");
  await f.adapter.close();
});

test("query count, inputs, parallel work and escaped leases fail closed", async (t) => {
  for (const mode of ["count", "control", "value", "rows", "parallel", "escaped"] as const) {
    await t.test(mode, async () => {
      const f = fixture((q) =>
        mode === "rows" && q.text.startsWith("SELECT")
          ? Promise.resolve({ rowCount: 65, rows: Array.from({ length: 65 }, () => ({})) })
          : Promise.resolve(empty),
      );
      let escaped: AsterPostgresTransaction | undefined;
      const result = await f.adapter.transaction(async (tx) => {
        escaped = tx;
        if (mode === "count") {
          for (let i = 0; i < 33; i += 1) {
            await tx.query({ text: "SELECT 1" });
          }
        } else if (mode === "control") {
          await tx.query({ text: "COMMIT" });
        } else if (mode === "value") {
          await tx.query({ text: "SELECT $1", values: ["x".repeat(4_097)] });
        } else if (mode === "parallel") {
          await Promise.allSettled([
            tx.query({ text: "SELECT 1" }),
            tx.query({ text: "SELECT 2" }),
          ]);
        } else {
          await tx.query({ text: "SELECT 1" });
        }
        return { action: "commit", value: 1 };
      });
      assert.equal(result.status, mode === "escaped" ? "committed" : "failed");
      const count = f.queries.length;
      assert.ok(escaped);
      await assert.rejects(escaped.query({ text: "SELECT 2" }));
      assert.equal(f.queries.length, count);
      assert.deepEqual(f.releases, [mode !== "escaped"]);
      await f.adapter.close();
    });
  }
});

test("one total deadline bounds the callback; late work cannot use a retired lease", async () => {
  const f = fixture(undefined, 20);
  let finish: (() => void) | undefined;
  const late = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const keepAlive = setInterval(() => undefined, 100);
  try {
    const result = await f.adapter.transaction(async (tx) => {
      await delay(50);
      await assert.rejects(tx.query({ text: "SELECT 1" }));
      finish?.();
      return { action: "commit", value: 1 };
    });
    assert.deepEqual(result, { status: "timed_out" });
    assert.deepEqual(f.releases, [true]);
    await late;
    assert.equal(f.queries.length, 1);
  } finally {
    clearInterval(keepAlive);
    await f.adapter.close();
  }
});

test("abort before admission is side-effect free; abort during a query retires the lease", async () => {
  const controller = new AbortController();
  const f = fixture((q) => {
    if (q.text.startsWith("SELECT")) {
      controller.abort();
    }
    return Promise.resolve(empty);
  });
  assert.deepEqual(
    await f.adapter.transaction(async (tx) => {
      await tx.query({ text: "SELECT 1" });
      return { action: "commit", value: 1 };
    }, controller.signal),
    { status: "aborted" },
  );
  assert.equal(f.connections(), 1);
  assert.deepEqual(
    await f.adapter.transaction(
      () => Promise.resolve({ action: "commit", value: 1 }),
      controller.signal,
    ),
    { status: "aborted" },
  );
  assert.equal(f.connections(), 1);
  assert.deepEqual(f.releases, [true]);
  await f.adapter.close();
});

test("lost COMMIT acknowledgment is indeterminate and never retried", async () => {
  const f = fixture((q) =>
    q.text === "COMMIT" ? Promise.reject(new Error("socket lost")) : Promise.resolve(empty),
  );
  const result = await f.adapter.transaction(() =>
    Promise.resolve({ action: "commit", value: "credential" }),
  );
  assert.deepEqual(result, { status: "indeterminate" });
  assert.equal(f.connections(), 1);
  assert.equal(f.queries.filter((q) => q.text === "COMMIT").length, 1);
  assert.deepEqual(f.releases, [true]);
  await f.adapter.close();
});

test("cancellation and timeout during COMMIT never claim rollback", async (t) => {
  for (const mode of ["abort", "timeout"] as const) {
    await t.test(mode, async () => {
      const controller = new AbortController();
      const keepAlive = setInterval(() => undefined, 100);
      const f = fixture((q) => {
        if (q.text !== "COMMIT") {
          return Promise.resolve(empty);
        }
        if (mode === "abort") {
          controller.abort();
        }
        return new Promise(() => undefined);
      }, 20);
      try {
        const result = await f.adapter.transaction(
          () => Promise.resolve({ action: "commit", value: "not-returned" }),
          controller.signal,
        );
        assert.deepEqual(result, { status: "indeterminate" });
        assert.deepEqual(f.releases, [true]);
        assert.equal(f.connections(), 1);
      } finally {
        clearInterval(keepAlive);
        await f.adapter.close();
      }
    });
  }
});

test("shutdown closes admission and prevents queries after lease retirement", async () => {
  const f = fixture();
  let closure: ReturnType<typeof f.adapter.close> | undefined;
  const result = await f.adapter.transaction(async (tx) => {
    assert.equal(f.adapter.snapshot().reservedSlots, 1);
    assert.deepEqual(
      await f.adapter.transaction(() => Promise.resolve({ action: "commit", value: 1 })),
      {
        status: "rejected",
        reason: "capacity_exceeded",
      },
    );
    closure = f.adapter.close();
    await assert.rejects(tx.query({ text: "SELECT 1" }));
    return { action: "commit", value: 1 };
  });
  assert.equal(result.status, "unavailable");
  assert.equal((await closure)?.status, "completed");
  assert.deepEqual(
    f.queries.map((q) => q.text),
    ["BEGIN ISOLATION LEVEL READ COMMITTED"],
  );
  assert.deepEqual(f.releases, [true]);
  assert.equal(f.adapter.snapshot().reservedSlots, 0);
});
