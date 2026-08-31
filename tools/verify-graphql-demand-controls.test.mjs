import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeGraphqlRejection, parserTokenFlood } from "./verify-graphql-demand-controls.mjs";

test("parser flood exceeds the token limit without reaching the body limit", () => {
  const source = parserTokenFlood();
  const tokens = source.match(/\$|[_A-Za-z][_0-9A-Za-z]*|[!():=@[\]{|}]/gu) ?? [];
  assert.ok(Buffer.byteLength(source, "utf8") < 32_768);
  assert.ok(tokens.length > 2_000 && tokens.length < 3_000);
  assert.equal(source.match(/\$v\d+:Int/gu)?.length, 600);
});

test("GraphQL demand rejection accepts only bounded responses without data or topology", () => {
  assert.doesNotThrow(() =>
    assertSafeGraphqlRejection(
      {
        status: 400,
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
        text: '{"errors":[{"message":"GraphQL operation failed."}]}',
        body: { errors: [{}] },
      },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      { status: 200, text: '{"data":{}}', body: { data: {}, errors: [] } },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection({ status: 200, text: "not-json", body: undefined }, "fixture"),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      { status: 400, text: "postgres failed at node_modules/a.js:4", body: undefined },
      "fixture",
    ),
  );
  assert.throws(() =>
    assertSafeGraphqlRejection(
      { status: 400, text: '{"errors":[{"message":"unexpected f321"}]}', body: undefined },
      "fixture",
    ),
  );
});
