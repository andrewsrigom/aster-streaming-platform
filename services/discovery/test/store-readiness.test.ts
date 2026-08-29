import assert from "node:assert/strict";
import test from "node:test";
import { discoverySearchSchemaCompatible } from "../src/infrastructure/store-readiness.js";

test("released search readiness accepts its schema and the staged additive successor", () => {
  assert.equal(discoverySearchSchemaCompatible([{ version: 1 }, { version: 2 }]), true);
  assert.equal(
    discoverySearchSchemaCompatible([{ version: 1 }, { version: 2 }, { version: 3 }]),
    true,
  );
});

test("released search readiness rejects bootstrap, gaps, rewrites and future versions", () => {
  for (const value of [
    undefined,
    [],
    [{ version: 1 }],
    [{ version: 1 }, { version: 3 }],
    [{ version: 1 }, { version: 2 }, { version: 4 }],
    [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }],
  ]) {
    assert.equal(discoverySearchSchemaCompatible(value), false);
  }
});

test("schema compatibility does not invoke hostile row accessors", () => {
  let invoked = false;
  const hostile = Object.defineProperty({}, "version", {
    get() {
      invoked = true;
      return 2;
    },
  });
  assert.equal(discoverySearchSchemaCompatible([{ version: 1 }, hostile]), false);
  assert.equal(invoked, false);
});
