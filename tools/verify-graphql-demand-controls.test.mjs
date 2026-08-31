import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSafeGraphqlRejection,
  assertSafeTransportRejection,
  parserTokenFlood,
} from "./verify-graphql-demand-controls.mjs";

test("parser flood exceeds the token limit without reaching the body limit", () => {
  const source = parserTokenFlood();
  const tokens = source.match(/\$|[_A-Za-z][_0-9A-Za-z]*|[!():=@[\]{|}]/gu) ?? [];
  assert.ok(Buffer.byteLength(source, "utf8") < 32_768);
  assert.ok(tokens.length > 2_000 && tokens.length < 3_000);
  assert.equal(source.match(/\$v\d+:Int/gu)?.length, 600);
});

test("pre-service body rejection permits only an absent or no-store cache policy", () => {
  const response = {
    status: 413,
    cacheControl: undefined,
    cacheValidators: [],
    text: '{"errors":[{"message":"request body too large"}]}',
    body: { errors: [{}] },
  };
  assert.doesNotThrow(() => assertSafeTransportRejection(response, "fixture"));
  assert.throws(() =>
    assertSafeTransportRejection({ ...response, cacheControl: "public, max-age=60" }, "fixture"),
  );
  assert.throws(() =>
    assertSafeTransportRejection({ ...response, cacheValidators: ['"shared"'] }, "fixture"),
  );
});

test("GraphQL demand rejection accepts only bounded responses without data or topology", () => {
  assert.doesNotThrow(() =>
    assertSafeGraphqlRejection(
      {
        status: 400,
        cacheControl: "no-store",
        text: '{"errors":[{"message":"GraphQL operation failed."}]}',
        body: { errors: [{}] },
      },
      "fixture",
    ),
  );
  assert.doesNotThrow(() =>
    assertSafeGraphqlRejection(
      {
        status: 200,
        cacheControl: "no-store",
        text: '{"errors":[{"message":"GraphQL operation failed."}]}',
        body: { errors: [{}] },
      },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      {
        status: 200,
        cacheControl: "no-store",
        text: '{"data":{}}',
        body: { data: {}, errors: [] },
      },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      { status: 200, cacheControl: "no-store", text: "not-json", body: undefined },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      {
        status: 400,
        cacheControl: "no-store",
        text: "postgres failed at node_modules/a.js:4",
        body: undefined,
      },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      {
        status: 400,
        cacheControl: "no-store",
        text: '{"errors":[{"message":"unexpected f321"}]}',
        body: undefined,
      },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      {
        status: 400,
        cacheControl: "public, max-age=60",
        text: '{"errors":[{}]}',
        body: { errors: [{}] },
      },
      "fixture",
    ),
  );
});
