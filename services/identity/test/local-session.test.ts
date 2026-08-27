import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import test from "node:test";

import { createExpressHttpAdapter } from "@aster/http-express";

import { createLocalSessionTransport } from "../src/transport/local-session.js";

const NOW = 1_787_814_000;
const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signature";
const configuration = {
  environment: "local",
  localDemoEnabled: true,
  publicOrigin: "http://127.0.0.1:3100",
};

test("cookie policy is guarded by the same local-only activation contract", () => {
  for (const override of [
    { environment: "production" },
    { environment: "integration" },
    { localDemoEnabled: false },
    { localDemoEnabled: "true" },
    { publicOrigin: "http://localhost:3100" },
    { publicOrigin: "http://127.0.0.1:3100/" },
    { publicOrigin: "https://127.0.0.1:3100" },
    { publicOrigin: "http://127.0.0.1:80" },
    { publicOrigin: "http://127.0.0.1:3100@attacker.invalid" },
  ]) {
    assert.throws(() => createLocalSessionTransport({ ...configuration, ...override }), {
      message: "Local identity configuration is invalid.",
    });
  }
});

test("cookies stay HttpOnly/host-only, fit the envelope and retain absolute expiry", () => {
  let now = NOW;
  const policy = createLocalSessionTransport(configuration, () => now);
  const cookie = policy.issueCookie(TOKEN, NOW + 1_800);
  assert.equal(
    cookie,
    `aster_local_session=${TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800; Expires=Thu, 27 Aug 2026 07:30:00 GMT`,
  );
  assert.equal(/Domain|Secure|__Host-/.test(cookie), false);
  now += 60;
  assert.ok(policy.issueCookie(TOKEN, NOW + 1_800).includes("Max-Age=1740"));
  assert.ok(policy.issueCookie("a".repeat(3_796) + ".b.c", NOW + 1_800).length < 4_096);
  assert.equal(
    policy.clearCookie(),
    "aster_local_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  );
  for (const value of [
    "",
    "plain",
    "a.b.c; injected=true",
    "a.b.c\r\nSet-Cookie: bad=1",
    "a".repeat(3_801) + ".b.c",
  ]) {
    assert.throws(() => policy.issueCookie(value, NOW + 1_800), {
      message: "Local session cookie is invalid.",
    });
  }
  for (const expires of [now, now - 1, now + 1_801, Infinity, NaN, 0.5]) {
    assert.throws(() => policy.issueCookie(TOKEN, expires));
  }
  now = NaN;
  assert.throws(() => policy.issueCookie(TOKEN, NOW + 1_800));
  assert.throws(() => policy.credential({} as IncomingMessage), {
    message: "Local session request context is unavailable.",
  });
});

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

async function fixture() {
  const adapter = createExpressHttpAdapter();
  const server = createServer({ maxHeaderSize: 16_384 }, adapter.requestListener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const policy = createLocalSessionTransport({ ...configuration, publicOrigin: origin }, () => NOW);
  let calls = 0;
  let lastCredential: string | undefined;
  adapter.mountGraphql(
    policy.wrap(async (req, res) => {
      calls++;
      lastCredential = policy.credential(req);
      const body = req.body as { fail?: boolean; clear?: boolean };
      if (body.fail) {
        await Promise.resolve();
        throw new Error("sensitive transport failure");
      }
      res.set(
        "Set-Cookie",
        body.clear ? policy.clearCookie() : policy.issueCookie(TOKEN, NOW + 1_800),
      );
      res.json({ data: { accepted: true } });
    }),
  );
  const baseHeaders = () => [
    "Host",
    `127.0.0.1:${address.port}`,
    "Origin",
    origin,
    "X-Aster-CSRF",
    "1",
    "Content-Type",
    "application/json",
  ];
  return {
    calls: () => calls,
    credential: () => lastCredential,
    headers: baseHeaders,
    async send(
      options: { headers?: string[]; method?: string; path?: string; body?: string } = {},
    ): Promise<Reply> {
      const body = options.body ?? "{}";
      return new Promise((resolve, reject) => {
        const client = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            method: options.method ?? "POST",
            path: options.path ?? "/graphql",
            setDefaultHeaders: false,
            headers: [
              ...(options.headers ?? baseHeaders()),
              "Content-Length",
              String(Buffer.byteLength(body)),
              "Connection",
              "close",
            ],
          },
          (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => {
              text += chunk;
              if (text.length > 8_192) {
                response.destroy(new Error("Response bound exceeded."));
              }
            });
            response.once("error", reject);
            response.once("end", () => {
              resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                body: text,
              });
            });
          },
        );
        client.setTimeout(2_000, () => client.destroy(new Error("HTTP test deadline.")));
        client.once("error", reject);
        client.end(body);
      });
    },
    async close() {
      const closed = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      server.closeAllConnections();
      await closed;
    },
  };
}

function replaceHeader(headers: string[], name: string, value?: string): string[] {
  const index = headers.findIndex(
    (item, offset) => offset % 2 === 0 && item.toLowerCase() === name.toLowerCase(),
  );
  if (index >= 0) {
    headers.splice(index, 2);
  }
  if (value !== undefined) {
    headers.push(name, value);
  }
  return headers;
}

test("real HTTP protects even anonymous issuance, parses one credential and emits no credential body", async () => {
  const http = await fixture();
  try {
    const anonymous = await http.send();
    assert.equal(anonymous.status, 200);
    assert.equal(http.credential(), undefined);
    assert.equal(anonymous.headers["cache-control"], "no-store");
    assert.equal(anonymous.headers["x-content-type-options"], "nosniff");
    assert.equal(anonymous.headers["access-control-allow-origin"], undefined);
    assert.equal(anonymous.body.includes(TOKEN), false);
    assert.equal(anonymous.headers["set-cookie"]?.length, 1);
    const resumed = await http.send({
      headers: [
        ...http.headers(),
        "Cookie",
        `theme="dark"; aster_local_session=${TOKEN}`,
        "Sec-Fetch-Site",
        "same-origin",
      ],
    });
    assert.equal(resumed.status, 200);
    assert.equal(http.credential(), TOKEN);
    assert.equal(http.calls(), 2);
    const cleared = await http.send({ body: '{"clear":true}' });
    assert.ok(cleared.headers["set-cookie"]?.[0]?.includes("Max-Age=0"));
    const failed = await http.send({ body: '{"fail":true}' });
    assert.equal(failed.status, 500);
    assert.equal(failed.body, '{"error":{"code":"INTERNAL_HTTP_ERROR"}}');
    assert.equal(failed.headers["set-cookie"], undefined);
  } finally {
    await http.close();
  }
});

test("real HTTP rejects origin/host/CSRF/forwarding and non-POST requests before issuance", async (t) => {
  const http = await fixture();
  try {
    for (const [name, value] of [
      ["Origin", undefined],
      ["Origin", "null"],
      ["Origin", "http://attacker.invalid"],
      ["Origin", configuration.publicOrigin + "/"],
      ["Host", "attacker.invalid"],
      ["X-Aster-CSRF", undefined],
      ["X-Aster-CSRF", "0"],
      ["X-Aster-CSRF", "1, 1"],
      ["Sec-Fetch-Site", "same-site"],
      ["Sec-Fetch-Site", "cross-site"],
      ["Authorization", "Bearer untrusted"],
      ["Forwarded", "host=attacker.invalid"],
      ["X-Forwarded-Host", "127.0.0.1:3100"],
      ["X-Aster-Account-Id", "untrusted"],
    ] as const) {
      await t.test(`${name}:${value ?? "absent"}`, async () => {
        const result = await http.send({ headers: replaceHeader(http.headers(), name, value) });
        assert.equal(result.status, 403);
        assert.equal(
          result.body,
          '{"errors":[{"message":"Request rejected.","extensions":{"code":"FORBIDDEN"}}]}',
        );
        assert.equal(result.headers["set-cookie"], undefined);
      });
    }
    for (const method of ["GET", "OPTIONS", "PUT"]) {
      const result = await http.send({ method });
      assert.equal(result.status, 405);
      assert.equal(result.headers["allow"], "POST");
      assert.equal(result.headers["access-control-allow-origin"], undefined);
    }
    assert.equal(http.calls(), 0);
  } finally {
    await http.close();
  }
});

test("real HTTP rejects ambiguity, cookie abuse and simple bodies without executing application", async () => {
  const http = await fixture();
  try {
    for (const name of ["Host", "Origin", "X-Aster-CSRF", "Content-Type", "Cookie"]) {
      const base =
        name === "Cookie"
          ? [...http.headers(), "Cookie", `aster_local_session=${TOKEN}`]
          : http.headers();
      const index = base.indexOf(name);
      const value = base[index + 1];
      assert.ok(value);
      const result = await http.send({ headers: [...base, name.toLowerCase(), value] });
      assert.equal(result.status, 400);
      assert.equal(result.headers["set-cookie"], undefined);
    }
    for (const cookie of [
      `aster_local_session=${TOKEN}; aster_local_session=${TOKEN}`,
      'aster_local_session="a.b.c"',
      "aster_local_session=a%2Eb%2Ec",
      "aster_local_session=",
      "aster_local_session=a.b.c,other=value",
      "invalid",
      "x=1;",
      "x=1; x=2",
      "aster_local_session=" + "a".repeat(3_801) + ".b.c",
      Array.from({ length: 33 }, (_, index) => `c${index}=v`).join("; "),
      "irrelevant=" + "a".repeat(8_193),
    ]) {
      const result = await http.send({ headers: [...http.headers(), "Cookie", cookie] });
      assert.equal(result.status, 400);
    }
    const many = Array.from({ length: 64 }, (_, index) => [`X-Extra-${index}`, "1"]).flat();
    assert.equal((await http.send({ headers: [...http.headers(), ...many] })).status, 400);
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      assert.equal(
        (
          await http.send({
            headers: replaceHeader(http.headers(), "Content-Type", type),
          })
        ).status,
        415,
      );
    }
    assert.equal((await http.send({ path: "/graphql?credential=untrusted" })).status, 400);
    assert.equal((await http.send({ body: "{" })).status, 400);
    assert.equal(http.calls(), 0);
  } finally {
    await http.close();
  }
});
