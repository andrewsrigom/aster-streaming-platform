import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { pathToFileURL } from "node:url";
import { selectCurrentOperation } from "./verify-trusted-operations.mjs";

const MAXIMUM_RESPONSE_BYTES = 32_768;
const timeout = () => globalThis.AbortSignal.timeout(10_000);

export function parserTokenFlood() {
  return `query TokenFlood(${Array.from(
    { length: 600 },
    (_, index) => `$v${String(index)}:Int`,
  ).join(" ")}) { __typename }`;
}

export function assertSafeGraphqlRejection(response, label) {
  assert.equal(response.cacheControl, "no-store", `${label} did not disable response caching.`);
  assert.ok(
    [200, 400, 413, 422, 429].includes(response.status),
    `${label} returned ${response.status}.`,
  );
  assert.ok(
    typeof response.text === "string" &&
      response.text.length > 0 &&
      Buffer.byteLength(response.text, "utf8") <= MAXIMUM_RESPONSE_BYTES,
    `${label} returned an invalid response bound.`,
  );
  assert.doesNotMatch(
    response.text,
    /TokenFlood|IntrospectionProbe|OversizedBody|aster-private-batch-canary|__schema|\bf\d{1,4}\b|catalog:3200|identity:3100|postgres|redis|node_modules|\bat\s+[^\n]+:\d+/iu,
    `${label} exposed request or topology detail.`,
  );
  if (response.status === 200) {
    assert.ok(response.body, `${label} returned an unstructured successful response.`);
  }
  if (response.body !== undefined) {
    assert.equal(response.body?.data, undefined, `${label} returned data.`);
    assert.ok(
      Array.isArray(response.body?.errors) &&
        response.body.errors.length >= 1 &&
        response.body.errors.length <= 4,
    );
  }
}

async function rawCall(encoded) {
  const response = await new Promise((resolve, reject) => {
    const client = request(
      "http://127.0.0.1:4000/graphql",
      {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4000",
          host: "127.0.0.1:4000",
          "x-aster-csrf": "1",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(encoded),
          connection: "close",
        },
        signal: timeout(),
      },
      (message) => {
        let text = "";
        message.setEncoding("utf8");
        message.on("data", (chunk) => {
          text += chunk;
          if (Buffer.byteLength(text, "utf8") > MAXIMUM_RESPONSE_BYTES) {
            message.destroy(new Error("GraphQL demand response exceeded its bound."));
          }
        });
        message.on("error", reject);
        message.on("end", () => {
          let body;
          try {
            body = JSON.parse(text);
          } catch {
            body = undefined;
          }
          resolve({
            status: message.statusCode,
            text,
            body,
            cacheControl: message.headers["cache-control"],
          });
        });
      },
    );
    client.on("error", reject);
    client.end(encoded);
  });
  return response;
}

const call = (body) => rawCall(JSON.stringify(body));

async function main() {
  assert.deepEqual(process.argv.slice(2), []);
  const persistedManifest = JSON.parse(
    await readFile("infra/router/generated/persisted-query-manifest.json", "utf8"),
  );
  const schemaManifest = JSON.parse(await readFile("infra/router/generated/manifest.json", "utf8"));
  const canonical = selectCurrentOperation(persistedManifest, schemaManifest, "Browse");

  const accepted = await call({
    operationName: canonical.name,
    query: canonical.body,
    variables: { first: 1, locale: "en" },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.cacheControl, "no-store");
  assert.equal(accepted.body?.errors, undefined);
  assert.ok(accepted.body?.data);

  const introspection = await call({
    operationName: "IntrospectionProbe",
    query: "query IntrospectionProbe { __schema { queryType { name } } }",
    variables: {},
  });
  assertSafeGraphqlRejection(introspection, "introspection");
  assert.deepEqual(introspection.body, {
    errors: [
      {
        message: "GraphQL operation failed.",
        extensions: { code: "UNAVAILABLE" },
      },
    ],
  });

  const tokenFlood = await call({
    operationName: "TokenFlood",
    query: parserTokenFlood(),
    variables: {},
  });
  assertSafeGraphqlRejection(tokenFlood, "parser-token");

  const batch = await call([
    {
      operationName: canonical.name,
      query: canonical.body,
      variables: { first: 1, locale: "en", probe: "aster-private-batch-canary" },
    },
    { operationName: canonical.name, query: canonical.body, variables: { first: 1, locale: "en" } },
  ]);
  assertSafeGraphqlRejection(batch, "batching");

  const oversized = await rawCall(
    JSON.stringify({
      operationName: "OversizedBody",
      query: "query OversizedBody { __typename }" + " ".repeat(32_768),
      variables: {},
    }),
  );
  assertSafeGraphqlRejection(oversized, "request-body");

  process.stdout.write(
    JSON.stringify({
      event: "aster.router.graphql_demand_controls_verified",
      accepted: 1,
      rejected: { batching: 1, body: 1, introspection: 1, parserTokens: 1 },
    }) + "\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
