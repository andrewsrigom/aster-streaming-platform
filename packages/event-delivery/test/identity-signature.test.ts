import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityEventSignature } from "../src/infrastructure/identity-signature.js";
import { EVENT_TOPICS } from "../src/domain/envelope.js";
import { PROFILE_ID, OTHER_ID, profileEvent } from "./event-fixture.js";

const key = Buffer.from(PROFILE_ID);
const value = Buffer.from(JSON.stringify(profileEvent()));
test("authenticates exact Identity bytes, topic and aggregate key with dedicated credential", () => {
  const signing = createIdentityEventSignature("ab".repeat(32));
  const signature = signing.sign(key, value);
  assert.equal(signature.byteLength, 64);
  assert.equal(signing.verify(EVENT_TOPICS.identity, key, value, signature), true);
  assert.equal(signing.verify(EVENT_TOPICS.catalog, key, value, signature), false);
  assert.equal(
    signing.verify(EVENT_TOPICS.identity, Buffer.from(OTHER_ID), value, signature),
    false,
  );
  assert.equal(
    signing.verify(EVENT_TOPICS.identity, key, Buffer.concat([value, Buffer.from(" ")]), signature),
    false,
  );
  assert.equal(
    createIdentityEventSignature("cd".repeat(32)).verify(
      EVENT_TOPICS.identity,
      key,
      value,
      signature,
    ),
    false,
  );
});
test("bounds signature and payload before native crypto", () => {
  const signing = createIdentityEventSignature("ab".repeat(32));
  assert.throws(() => createIdentityEventSignature("bad"), /Invalid Identity event credential/u);
  for (const signature of [Buffer.alloc(0), Buffer.alloc(65), Buffer.alloc(64, 255)]) {
    assert.equal(signing.verify(EVENT_TOPICS.identity, key, value, signature), false);
  }
  assert.throws(() => signing.sign(key, Buffer.alloc(8193)), /wire bounds/u);
  assert.throws(() => signing.sign(Buffer.alloc(37), value), /wire bounds/u);
  assert.equal(
    signing.verify(EVENT_TOPICS.identity, key, Buffer.alloc(8193), Buffer.alloc(64, 97)),
    false,
  );
});
