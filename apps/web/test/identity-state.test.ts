import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Kind, parse, print } from "graphql";
import { createIdentityClient } from "../features/identity/client.ts";
import { identityOperations, VIEWER } from "../features/identity/operations.ts";
import { createShellStore, shellActions } from "../store/shell/store.ts";

test("Identity Web documents match the versioned first-party inventory", async () => {
  const inventory = parse(
    await readFile(
      new URL("../../../infra/router/known-operations.graphql", import.meta.url),
      "utf8",
    ),
  );
  for (const [name, document] of Object.entries(identityOperations)) {
    const known = inventory.definitions.find(
      (node) => node.kind === Kind.OPERATION_DEFINITION && node.name?.value === name,
    );
    assert.ok(known);
    const operation = document.definitions[0];
    assert.ok(operation);
    assert.equal(print(operation), print(known));
  }
});

test("Redux stores are isolated and contain only bounded local interaction state", () => {
  const first = createShellStore();
  const second = createShellStore();
  first.dispatch(shellActions.open());
  first.dispatch(shellActions.step("create"));
  first.dispatch(shellActions.busy(true));
  first.dispatch(shellActions.step("list"));
  assert.equal(first.getState().shell.step, "create");
  assert.equal(second.getState().shell.dialog, "closed");
  first.dispatch(shellActions.close());
  assert.deepEqual(first.getState(), second.getState());
  assert.deepEqual(Object.keys(first.getState().shell).sort(), [
    "busy",
    "dialog",
    "notice",
    "step",
  ]);
  // @ts-expect-error Invalid remote data cannot become a typed flow transition.
  const invalid: Parameters<typeof shellActions.step>[0] = "profile-data";
  assert.equal(typeof invalid, "string");
});

test("Identity transport is fixed-origin, credentialed and positively projects private browser data", async () => {
  let observed: RequestInit | undefined;
  const runtime = createIdentityClient((input, init) => {
    assert.equal(input, "http://127.0.0.1:4000/graphql");
    observed = init;
    return Promise.resolve(
      Response.json({
        data: {
          me: {
            accountId: "synthetic-account",
            expiresAt: "2026-08-27T23:00:00.000Z",
            credential: "private-canary",
          },
          credential: "private-canary",
        },
        extensions: { private: "private-canary" },
      }),
    );
  });
  try {
    const result = await runtime.client.query({ query: VIEWER });
    assert.deepEqual(result.data, {
      me: { accountId: "synthetic-account", expiresAt: "2026-08-27T23:00:00.000Z" },
    });
    assert.ok(observed);
    assert.equal(observed.credentials, "include");
    assert.equal(observed.redirect, "error");
    assert.equal(observed.cache, "no-store");
    assert.deepEqual(observed.headers, {
      "content-type": "application/json",
      "x-aster-csrf": "1",
    });
    assert.ok(!JSON.stringify(runtime.client.cache.extract()).includes("private-canary"));
  } finally {
    runtime.dispose();
  }
  assert.deepEqual(runtime.client.cache.extract(), {});
});

test("discarding an Identity generation cancels and prevents late cache writes", async () => {
  let complete: (response: Response) => void = () => {};
  let started: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let signal: AbortSignal | null | undefined;
  const first = createIdentityClient((_input, init) => {
    signal = init?.signal;
    started();
    return new Promise<Response>((resolve) => {
      complete = resolve;
    });
  });
  const pending = first.client.query({ query: VIEWER });
  const rejection = assert.rejects(pending);
  await entered;
  first.dispose();
  assert.equal(signal?.aborted, true);
  complete(
    Response.json({
      data: { me: { accountId: "old-account", expiresAt: "2026-08-27T23:00:00.000Z" } },
    }),
  );
  await rejection;
  assert.deepEqual(first.client.cache.extract(), {});
  const second = createIdentityClient(() => Promise.resolve(Response.json({ data: { me: null } })));
  assert.deepEqual((await second.client.query({ query: VIEWER })).data, { me: null });
  assert.ok(!JSON.stringify(second.client.cache.extract()).includes("old-account"));
  second.dispose();
});

test("Identity errors never reflect upstream details or become cached success", async () => {
  const runtime = createIdentityClient(() =>
    Promise.resolve(Response.json({ errors: [{ message: "private SQL canary" }] })),
  );
  try {
    await assert.rejects(runtime.client.query({ query: VIEWER }), (error: Error) => {
      assert.ok(!error.message.includes("private SQL canary"));
      return true;
    });
    assert.equal(runtime.client.readQuery({ query: VIEWER }), null);
  } finally {
    runtime.dispose();
  }
});
