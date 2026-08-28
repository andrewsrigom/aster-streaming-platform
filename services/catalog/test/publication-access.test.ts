import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  createPublicationAccess,
  PublicationAccessRecoveryError,
} from "../src/infrastructure/media/publication-access.js";
import {
  publicationPolicy,
  publicationStorageClient,
  readPublicationPolicy,
} from "../src/infrastructure/media/publication-storage.js";

const prefix = "publications/" + "a".repeat(64) + "/";
const confirmed = () => Promise.resolve();

test("ambiguous lock creation requires recovery, while definite contention and pre-abort do not", async (t) => {
  for (const failure of ["lost-response", "cancelled", "contended", "pre-aborted"] as const) {
    await t.test(failure, async (child) => {
      const client = publicationStorageClient();
      const controller = new AbortController();
      let sends = 0;
      let durableLock = false;
      const contention = Object.assign(new Error("busy"), {
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      });
      child.mock.method(client, "send", (command: unknown) => {
        sends++;
        assert.ok(command instanceof PutObjectCommand);
        assert.equal(command.input.IfNoneMatch, "*");
        if (failure === "contended") {
          return Promise.reject(contention);
        }
        durableLock = true;
        if (failure === "cancelled") {
          controller.abort();
        }
        return Promise.reject(new Error("accepted write, response unavailable"));
      });
      try {
        if (failure === "pre-aborted") {
          controller.abort();
        }
        await assert.rejects(
          createPublicationAccess(client).reveal(prefix, controller.signal, confirmed),
          (error: unknown) => {
            if (failure === "contended") {
              return error === contention;
            }
            if (failure === "pre-aborted") {
              return error === controller.signal.reason;
            }
            return error instanceof PublicationAccessRecoveryError;
          },
        );
        assert.equal(sends, failure === "pre-aborted" ? 0 : 1);
        assert.equal(durableLock, failure === "lost-response" || failure === "cancelled");
      } finally {
        client.destroy();
      }
    });
  }
});

function accessFixture(t: TestContext, previous: readonly string[]) {
  const client = publicationStorageClient();
  const state = {
    policy: previous.length ? publicationPolicy(previous) : undefined,
    locked: false,
    restoring: false,
    failRestore: false,
    failRestoreReadback: false,
    mutations: 0,
  };
  t.mock.method(client, "send", (command: unknown, options: { abortSignal: AbortSignal }) => {
    assert.equal(options.abortSignal.aborted, false, "cleanup must not inherit cancellation");
    if (command instanceof PutObjectCommand) {
      if (command.input.IfNoneMatch) {
        assert.equal(state.locked, false);
        state.locked = true;
      } else {
        assert.equal(state.locked, true);
        assert.equal(typeof command.input.Body, "string");
        const snapshot = JSON.parse(command.input.Body as string) as { previousPrefixes: unknown };
        assert.deepEqual(snapshot.previousPrefixes, previous);
      }
      return Promise.resolve({});
    }
    if (command instanceof GetBucketPolicyCommand) {
      if (state.restoring && state.failRestoreReadback) {
        return Promise.reject(new Error("restore readback unavailable"));
      }
      return state.policy
        ? Promise.resolve({ Policy: state.policy })
        : Promise.reject(
            Object.assign(new Error("absent"), { $metadata: { httpStatusCode: 404 } }),
          );
    }
    if (command instanceof PutBucketPolicyCommand || command instanceof DeleteBucketPolicyCommand) {
      assert.equal(state.locked, true);
      state.mutations++;
      if (state.restoring && state.failRestore) {
        return Promise.reject(new Error("restore unavailable"));
      }
      state.policy = command instanceof PutBucketPolicyCommand ? command.input.Policy : undefined;
      return Promise.resolve({});
    }
    assert.ok(command instanceof DeleteObjectCommand);
    assert.equal(state.locked, true);
    state.locked = false;
    return Promise.resolve({});
  });
  t.after(() => {
    client.destroy();
  });
  return { state, access: createPublicationAccess(client) };
}

test("confirmation runs inside the barrier and returns the registered identity", async (t) => {
  const { state, access } = accessFixture(t, []);
  const result = await access.reveal(prefix, AbortSignal.timeout(1000), (signal) => {
    assert.equal(state.locked, true);
    assert.equal(state.policy, publicationPolicy([prefix]));
    assert.equal(signal.aborted, false);
    return Promise.resolve("publication-id");
  });
  assert.equal(result, "publication-id");
  assert.equal(state.locked, false);
  assert.equal(state.mutations, 1);
});

test("rights, expiry, registration and cancellation rejection restore only a newly added grant", async (t) => {
  const old = "publications/" + "b".repeat(64) + "/";
  for (const previous of [[], [old], [prefix]]) {
    for (const failure of ["rights", "expiry", "registration", "cancelled"]) {
      await t.test(failure + ":" + previous.join(), async (child) => {
        const { state, access } = accessFixture(child, previous);
        const controller = new AbortController();
        await assert.rejects(
          access.reveal(prefix, controller.signal, (signal) => {
            assert.equal(state.locked, true);
            state.restoring = true;
            if (failure === "cancelled") {
              controller.abort();
              signal.throwIfAborted();
            }
            return Promise.reject(new Error(failure));
          }),
        );
        assert.equal(state.policy, previous.length ? publicationPolicy(previous) : undefined);
        assert.equal(state.locked, false);
        assert.equal(state.mutations, previous.includes(prefix) ? 0 : 2);
      });
    }
  }
});

test("failed compensation or its readback retains the barrier and reports required recovery", async (t) => {
  for (const failure of ["write", "readback"]) {
    await t.test(failure, async (child) => {
      const { state, access } = accessFixture(child, []);
      await assert.rejects(
        access.reveal(prefix, AbortSignal.timeout(1000), () => {
          state.restoring = true;
          state.failRestore = failure === "write";
          state.failRestoreReadback = failure === "readback";
          return Promise.reject(new Error("rights revoked"));
        }),
        PublicationAccessRecoveryError,
      );
      assert.equal(state.locked, true);
      assert.equal(state.mutations, 2);
    });
  }
});
test("publication policy accepts only bounded exact GET prefixes, never ignored condition fields", async (t) => {
  for (const prefixes of [
    [],
    [prefix, prefix],
    ["publications/*"],
    ["publications/../"],
    Array.from({ length: 101 }, (_, i) => "publications/" + i.toString(16).padStart(64, "0") + "/"),
  ]) {
    assert.throws(() => publicationPolicy(prefixes));
  }
  const client = publicationStorageClient();
  let raw = publicationPolicy([prefix]);
  t.mock.method(client, "send", () => Promise.resolve({ Policy: raw }));
  try {
    assert.deepEqual(await readPublicationPolicy(client, AbortSignal.timeout(1000)), [prefix]);
    for (const change of [
      (value: string) => value.replace('"s3:GetObject"', '"s3:*"'),
      (value: string) =>
        value.replace('"Effect":"Allow"', '"Effect":"Allow","Condition":{"ignored":true}'),
      (value: string) => value.replace("a".repeat(64) + "/", ""),
      (value: string) =>
        value.replace('"Version":"2012-10-17"', '"Version":"2012-10-17","Other":true'),
      () => "{",
      () => " ".repeat(20001),
    ]) {
      raw = change(publicationPolicy([prefix]));
      await assert.rejects(readPublicationPolicy(client, AbortSignal.timeout(1000)));
    }
  } finally {
    client.destroy();
  }
});

test("an uncertain policy write/readback retains the recovery barrier, with no implicit retry", async (t) => {
  for (const failure of ["write", "readback", "cancelled"] as const) {
    const client = publicationStorageClient();
    const controller = new AbortController();
    const commands: string[] = [];
    let reads = 0;
    t.mock.method(client, "send", (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        commands.push(command.input.IfNoneMatch ? "lock" : "snapshot");
        assert.equal(command.input.Key, "control/publication-access.lock");
        if (command.input.IfNoneMatch) {
          assert.equal(command.input.IfNoneMatch, "*");
        } else {
          assert.equal(typeof command.input.Body, "string");
          assert.match(command.input.Body as string, /"previousPrefixes":\[\]/u);
        }
        return Promise.resolve({});
      }
      if (command instanceof GetBucketPolicyCommand) {
        commands.push("read");
        if (++reads === 1) {
          return Promise.reject(
            Object.assign(new Error("absent"), { $metadata: { httpStatusCode: 404 } }),
          );
        }
        return Promise.reject(new Error("readback unavailable"));
      }
      if (command instanceof PutBucketPolicyCommand) {
        commands.push("write");
        if (failure === "cancelled") {
          controller.abort();
        }
        return failure === "write" || failure === "cancelled"
          ? Promise.reject(new Error("uncertain write"))
          : Promise.resolve({});
      }
      assert.ok(command instanceof DeleteObjectCommand);
      commands.push("unlock");
      return Promise.resolve({});
    });
    try {
      await assert.rejects(
        createPublicationAccess(client).reveal(prefix, controller.signal, confirmed),
        PublicationAccessRecoveryError,
      );
      assert.deepEqual(
        commands,
        failure === "readback"
          ? ["lock", "read", "snapshot", "write", "read"]
          : ["lock", "read", "snapshot", "write"],
      );
    } finally {
      client.destroy();
    }
  }
});
