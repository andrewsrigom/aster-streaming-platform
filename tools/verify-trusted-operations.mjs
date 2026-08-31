import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";

const args = process.argv.slice(2);
assert.deepEqual(args, args[0] === "--metrics" ? ["--metrics"] : []);
const timeout = () => globalThis.AbortSignal.timeout(10_000);

if (args[0] === "--metrics") {
  const response = await globalThis.fetch("http://router:9091/metrics", { signal: timeout() });
  assert.equal(response.status, 200);
  const source = await response.text();
  assert.ok(source.length > 0 && source.length <= 2_000_000);
  for (const result of ["matched", "unknown", "missing"]) {
    assert.ok(
      source.includes(`aster_trusted_operation="${result}"`),
      `Missing Router metric for ${result} trusted-operation result.`,
    );
  }
  process.stdout.write(
    JSON.stringify({ event: "aster.router.trusted_operation_metrics_verified" }) + "\n",
  );
} else {
  const source = JSON.parse(
    await readFile("infra/router/generated/persisted-query-manifest.json", "utf8"),
  );
  const canonical = source.operations.find((entry) => entry.name === "Browse");
  assert.ok(canonical);

  const call = async (body) => {
    const encoded = JSON.stringify(body);
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
            if (Buffer.byteLength(text) > 32768) {
              message.destroy(new Error("Trusted-operation response exceeded its bound."));
            }
          });
          message.on("error", reject);
          message.on("end", () => resolve({ status: message.statusCode, text }));
        },
      );
      client.on("error", reject);
      client.end(encoded);
    });
    return { status: response.status, body: JSON.parse(response.text) };
  };

  const accepted = await call({
    operationName: canonical.name,
    query: canonical.body,
    variables: { first: 1, locale: "en" },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.errors, undefined);
  assert.ok(accepted.body.data);

  const rejected = [
    await call({ operationName: canonical.name, query: canonical.body + "\n", variables: {} }),
    await call({ operationName: "Unknown", query: "query Unknown { __typename }", variables: {} }),
    await call({ query: canonical.body, variables: {} }),
  ];
  for (const response of rejected) {
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      errors: [
        {
          message: "GraphQL operation failed.",
          extensions: { code: "TRUSTED_OPERATION_REQUIRED" },
        },
      ],
    });
  }
  process.stdout.write(
    JSON.stringify({
      event: "aster.router.trusted_operations_verified",
      accepted: 1,
      rejected: { altered: 1, unknown: 1, missing: 1 },
    }) + "\n",
  );
}
