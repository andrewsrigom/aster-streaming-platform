import assert from "node:assert/strict";
import test from "node:test";
import {
  DeleteObjectCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createPublicationAccess } from "../src/infrastructure/media/publication-access.js";
import {
  publicationPolicy,
  publicationStorageClient,
  readPublicationPolicy,
} from "../src/infrastructure/media/publication-storage.js";

const prefix = "publications/" + "a".repeat(64) + "/";
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
        commands.push("lock");
        assert.equal(command.input.Key, "control/publication-access.lock");
        assert.equal(command.input.IfNoneMatch, "*");
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
      await assert.rejects(createPublicationAccess(client).reveal(prefix, controller.signal));
      assert.deepEqual(
        commands,
        failure === "readback" ? ["lock", "read", "write", "read"] : ["lock", "read", "write"],
      );
    } finally {
      client.destroy();
    }
  }
});
