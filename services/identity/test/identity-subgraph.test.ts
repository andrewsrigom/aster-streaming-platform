import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createExpressHttpAdapter, createLocalEngagementReadTrust } from "@aster/http-express";
import type { AsterTraceContext } from "@aster/telemetry";
import { IDENTITY_ENGAGEMENT_OPERATION } from "../src/transport/engagement-operation.js";

import type { ProfileRequest } from "../src/application/profile-ports.js";
import type { ViewerProfile } from "../src/domain/profile.js";
import type { IdentityGraphqlApplications } from "../src/transport/identity-schema.js";
import {
  createIdentitySubgraph,
  type IdentityOperationTrace,
} from "../src/transport/identity-subgraph.js";

const NOW = 1_787_814_000;
const TOKEN_A = "header.accountA.signature";
const TOKEN_B = "header.accountB.signature";
const id = (n: number): string => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const viewer = { accountId: id(1), sessionId: id(2), expiresAt: NOW + 1_800 };
const profile = (n: number, account: number): ViewerProfile =>
  Object.freeze({
    id: id(n),
    accountId: id(account),
    displayName: "Synthetic viewer",
    locale: "pt-BR",
    maturity: "GENERAL",
    avatarRef: null,
    version: 1,
  });
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

// Controlled application ports test transport translation only, not authentication or database isolation.
function applications() {
  const calls: { operation: string; request?: ProfileRequest; value?: unknown }[] = [];
  const profiles = [profile(10, 1), profile(11, 1), profile(20, 3)];
  const unavailable = () => Promise.resolve({ status: "unavailable" } as const);
  const app: {
    sessions: Mutable<IdentityGraphqlApplications["sessions"]>;
    profiles: Mutable<IdentityGraphqlApplications["profiles"]>;
  } = {
    sessions: {
      signIn: () =>
        Promise.resolve({ status: "completed", value: { ...viewer, credential: TOKEN_A } }),
      restore: (credential) =>
        Promise.resolve(
          credential === TOKEN_A
            ? { status: "completed", value: viewer }
            : { status: "unauthenticated" },
        ),
      signOut: () => Promise.resolve({ status: "completed", value: undefined }),
    },
    profiles: {
      authorize: unavailable,
      list: (request) => {
        calls.push({ operation: "list", request });
        const account =
          request.credential === TOKEN_A ? id(1) : request.credential === TOKEN_B ? id(3) : null;
        return Promise.resolve(
          account
            ? {
                status: "completed",
                value: {
                  profiles: profiles.filter((item) => item.accountId === account),
                  activeProfileId: id(10),
                },
              }
            : { status: "unauthenticated" },
        );
      },
      get: unavailable,
      active: unavailable,
      select: (request, value) => {
        calls.push({ operation: "select", request, value });
        return Promise.resolve({ status: "completed", value: profiles[0] as ViewerProfile });
      },
      create: (request, value) => {
        calls.push({ operation: "create", request, value });
        return Promise.resolve({ status: "completed", value: { profileId: id(10), version: 1 } });
      },
      update: (request, value) => {
        calls.push({ operation: "update", request, value });
        return Promise.resolve({ status: "completed", value: { profileId: id(10), version: 2 } });
      },
      delete: (request, value) => {
        calls.push({ operation: "delete", request, value });
        return Promise.resolve({ status: "completed", value: { profileId: id(10), version: 3 } });
      },
    },
  };
  return { app, calls };
}

async function fixture(
  monotonicNow?: () => number,
  engagementKey?: string,
  activeTrace?: AsterTraceContext,
) {
  const adapter = createExpressHttpAdapter();
  const http = createServer({ maxHeaderSize: 16_384 }, adapter.requestListener);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const controlled = applications();
  const traces: IdentityOperationTrace[] = [];
  const diagnostics: string[] = [];
  const middlewareErrors: unknown[] = [];
  const graph = await createIdentitySubgraph({
    configuration: { environment: "local", localDemoEnabled: true, publicOrigin: origin },
    applications: controlled.app,
    ...(activeTrace ? { activeTraceContext: () => activeTrace } : {}),
    ...(engagementKey
      ? { engagementTrust: createLocalEngagementReadTrust("identity", engagementKey) }
      : {}),
    nowSeconds: () => NOW,
    ...(monotonicNow ? { monotonicNow } : {}),
    onOperation: (trace) => {
      traces.push(trace);
    },
    onDiagnostic: (code) => {
      diagnostics.push(code);
    },
  });
  adapter.mountGraphql(async (request, response, next) => {
    try {
      await graph.middleware(request, response, next);
    } catch (error) {
      middlewareErrors.push(error);
      next(error);
    }
  });
  return {
    ...controlled,
    traces,
    diagnostics,
    middlewareErrors,
    graph,
    async send(
      query: string,
      options: {
        variables?: Record<string, unknown>;
        credential?: string;
        signal?: AbortSignal;
        headers?: Record<string, string>;
        operationName?: string;
      } = {},
    ) {
      const init = {
        method: "POST",
        headers: {
          origin,
          "x-aster-csrf": "1",
          "content-type": "application/json",
          connection: "close",
          ...(options.credential ? { cookie: "aster_local_session=" + options.credential } : {}),
          ...options.headers,
        },
        body: JSON.stringify({
          query,
          ...(options.operationName ? { operationName: options.operationName } : {}),
          ...(options.variables ? { variables: options.variables } : {}),
        }),
        signal: options.signal ?? AbortSignal.timeout(5_000),
      };
      // Node fetch owns Host; the private service-name boundary needs a real HTTP request.
      const response = options.headers?.["host"]
        ? await new Promise<Response>((resolve, reject) => {
            const outgoing = httpRequest(origin + "/graphql", init, (incoming) => {
              const chunks: Buffer[] = [];
              incoming.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
              });
              incoming.once("error", reject);
              incoming.once("end", () => {
                const headers = new Headers();
                for (const [name, value] of Object.entries(incoming.headers)) {
                  if (value !== undefined) {
                    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
                  }
                }
                resolve(
                  new Response(Buffer.concat(chunks).toString("utf8"), {
                    status: incoming.statusCode ?? 500,
                    headers,
                  }),
                );
              });
            });
            outgoing.once("error", reject);
            outgoing.end(init.body);
          })
        : await fetch(origin + "/graphql", init);
      const body = await response.text();
      const json = JSON.parse(body) as {
        data?: Record<string, unknown>;
        errors?: { message: string; extensions: { code: string; correlationId?: string } }[];
      };
      return { status: response.status, headers: response.headers, body, json };
    },
    async close() {
      await graph.stop();
      await new Promise<void>((resolve, reject) => {
        http.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        http.closeAllConnections();
      });
    },
  };
}

test("private profile HTTP read requires its purpose credential, exact operation and current owner", async () => {
  const key = "a".repeat(64);
  const fx = await fixture(undefined, key);
  let reads = 0;
  fx.app.profiles.authorize = (request, profileId) => {
    reads++;
    assert.equal(request.context.correlationId, id(90));
    assert.ok(request.signal instanceof AbortSignal);
    return Promise.resolve(
      request.credential === TOKEN_A && profileId === id(10)
        ? {
            status: "completed",
            value: { accountId: id(1), profileId: id(10), checkedAt: NOW, expiresAt: NOW + 1800 },
          }
        : { status: "not_found" },
    );
  };
  const options = {
    variables: { profileId: id(10) },
    operationName: "EngagementProfile",
    credential: TOKEN_A,
    headers: {
      host: "identity:3100",
      origin: "http://engagement:3400",
      "x-aster-engagement-credential": key,
      "x-aster-correlation-id": id(90),
    },
  };
  try {
    const result = await fx.send(IDENTITY_ENGAGEMENT_OPERATION, options);
    assert.equal(result.status, 200);
    assert.deepEqual(result.json.data?.["_engagementProfile"], {
      code: "COMPLETED",
      accountId: id(1),
      profileId: id(10),
      checkedAt: NOW,
      expiresAt: NOW + 1800,
    });
    assert.equal(result.headers.get("x-request-id"), id(90));
    assert.equal(result.headers.get("set-cookie"), null);
    assert.doesNotMatch(result.body, /displayName|maturity|credential|signature/u);
    const other = await fx.send(IDENTITY_ENGAGEMENT_OPERATION, { ...options, credential: TOKEN_B });
    assert.deepEqual(other.json.data?.["_engagementProfile"], {
      code: "NOT_FOUND",
      accountId: null,
      profileId: null,
      checkedAt: null,
      expiresAt: null,
    });
    assert.equal(reads, 2);
    assert.equal(
      (
        await fx.send(IDENTITY_ENGAGEMENT_OPERATION, {
          variables: options.variables,
          operationName: options.operationName,
          credential: TOKEN_A,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fx.send(IDENTITY_ENGAGEMENT_OPERATION, {
          ...options,
          headers: { ...options.headers, "x-aster-engagement-credential": "b".repeat(64) },
        })
      ).status,
      403,
    );
    for (const query of [
      "mutation SignIn { demoSignIn { code } }",
      "query All { profiles { profiles { id } } }",
      IDENTITY_ENGAGEMENT_OPERATION + " ",
    ]) {
      assert.equal((await fx.send(query, options)).status, 400);
    }
    assert.equal(reads, 2);
    assert.doesNotMatch(JSON.stringify(fx.traces), /signature|displayName/u);
  } finally {
    await fx.close();
  }
});

test("real Apollo HTTP sets a host-only cookie after acknowledgement and never exposes the credential/session", async () => {
  const fx = await fixture();
  try {
    const anonymous = await fx.send("query Viewer { me { accountId expiresAt } }");
    assert.deepEqual(anonymous.json.data, { me: null });
    const signed = await fx.send(
      "mutation SignIn { demoSignIn { code correlationId viewer { accountId expiresAt } } }",
    );
    assert.equal(signed.status, 200);
    assert.ok(signed.headers.get("set-cookie")?.includes(TOKEN_A));
    assert.ok(signed.headers.get("set-cookie")?.includes("HttpOnly; SameSite=Strict"));
    assert.equal(signed.body.includes(TOKEN_A), false);
    assert.equal(signed.body.includes(viewer.sessionId), false);
    assert.equal(signed.headers.get("cache-control"), "no-store");
    assert.equal(signed.headers.get("access-control-allow-origin"), null);
    const restored = await fx.send("query Viewer { me { accountId expiresAt } }", {
      credential: TOKEN_A,
    });
    assert.deepEqual(restored.json.data, {
      me: { accountId: id(1), expiresAt: new Date(viewer.expiresAt * 1_000).toISOString() },
    });
    const revoked = await fx.send("mutation Logout { signOut { code } }", { credential: TOKEN_A });
    assert.ok(revoked.headers.get("set-cookie")?.includes("Max-Age=0"));
  } finally {
    await fx.close();
  }
});

test("entity resolution preserves order/misses, ignores injected fields and batches only within one owner request", async () => {
  const fx = await fixture();
  try {
    const query =
      "query Owned($refs:[_Any!]!) { profiles { profiles { id } } _entities(representations:$refs) { ... on Profile { id displayName } } }";
    const refs = [10, 20, 11, 10].map((n) => ({
      __typename: "Profile",
      id: id(n),
      displayName: "Injected",
      accountId: id(3),
    }));
    const owned = await fx.send(query, { credential: TOKEN_A, variables: { refs } });
    assert.equal(owned.json.errors, undefined);
    assert.deepEqual(owned.json.data?.["_entities"], [
      { id: id(10), displayName: "Synthetic viewer" },
      null,
      { id: id(11), displayName: "Synthetic viewer" },
      { id: id(10), displayName: "Synthetic viewer" },
    ]);
    assert.equal(fx.calls.length, 1);
    assert.equal(fx.calls[0]?.request?.credential, TOKEN_A);
    const other = await fx.send(query, { credential: TOKEN_B, variables: { refs } });
    assert.deepEqual(other.json.data?.["_entities"], [
      null,
      { id: id(20), displayName: "Synthetic viewer" },
      null,
      null,
    ]);
    assert.equal(fx.calls.length, 2);
    const active = await fx.send(
      "query Active($id:ID!) { activeProfile(id:$id) { id } profile(id:$id) { id } }",
      { credential: TOKEN_A, variables: { id: id(10) } },
    );
    assert.deepEqual(active.json.data, { activeProfile: { id: id(10) }, profile: { id: id(10) } });
    assert.equal(fx.calls.length, 3);
  } finally {
    await fx.close();
  }
});

test("malformed or non-entity representations return validation errors before owner calls", async () => {
  const fx = await fixture();
  try {
    for (const reference of [
      null,
      {},
      { __typename: "Query", id: id(10) },
      { __typename: "Profile", id: "invalid" },
    ]) {
      const result = await fx.send(
        "query Q($refs:[_Any!]!) { _entities(representations:$refs) { ... on Profile { id } } }",
        { variables: { refs: [reference] }, credential: TOKEN_A },
      );
      assert.equal(result.status, 400);
      assert.equal(result.json.errors?.[0]?.extensions.code, "INVALID_INPUT");
    }
    assert.equal(fx.calls.length, 0);
  } finally {
    await fx.close();
  }
});

test("profile mutations forward retry/version inputs, credential, cancellation and generated event context", async () => {
  const activeTrace = {
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    traceFlags: 1,
    traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
  } as const satisfies AsterTraceContext;
  const fx = await fixture(undefined, undefined, activeTrace);
  try {
    for (const action of ["create", "update", "delete"] as const) {
      const input = {
        mutationId: id(30),
        ...(action !== "create" ? { profileId: id(10), expectedVersion: 1 } : {}),
        ...(action !== "delete"
          ? { profile: { displayName: "Synthetic viewer", locale: "pt-BR", maturity: "GENERAL" } }
          : {}),
      };
      const type = {
        create: "CreateProfileInput",
        update: "UpdateProfileInput",
        delete: "DeleteProfileInput",
      }[action];
      const query = `mutation Write($input:${type}!) { ${action}Profile(input:$input) { code profileId version correlationId } }`;
      const result = await fx.send(query, { variables: { input }, credential: TOKEN_A });
      assert.equal(result.json.errors, undefined, result.body);
      const call = fx.calls.at(-1);
      assert.equal(call?.operation, action);
      assert.deepEqual(JSON.parse(JSON.stringify(call.value)), input);
      assert.equal(call.request?.credential, TOKEN_A);
      assert.equal(call.request.signal.aborted, false);
      assert.equal(call.request.context.correlationId, result.headers.get("x-request-id"));
      assert.equal(call.request.context.traceparent, activeTrace.traceparent);
    }
    const selected = await fx.send(
      "mutation Select($id:ID!) { selectProfile(id:$id) { code profile { id } } }",
      { credential: TOKEN_A, variables: { id: id(10) } },
    );
    assert.deepEqual(selected.json.data?.["selectProfile"], {
      code: "COMPLETED",
      profile: { id: id(10) },
    });
    assert.equal(fx.calls.at(-1)?.value, id(10));
  } finally {
    await fx.close();
  }
});

test("typed failures remain stable; unknown errors, invalid variables and client text are sanitized", async () => {
  const fx = await fixture();
  try {
    const protectedQuery = await fx.send("query Private { profiles { profiles { id } } }");
    assert.equal(protectedQuery.json.errors?.[0]?.extensions.code, "UNAUTHENTICATED");
    const codes = [
      "unauthenticated",
      "unavailable",
      "cancelled",
      "indeterminate",
      "limit_exceeded",
    ] as const;
    for (const status of codes) {
      fx.app.sessions.signIn = () => Promise.resolve({ status });
      const rejected = await fx.send(
        "mutation SignIn { demoSignIn { code viewer { accountId } } }",
      );
      assert.deepEqual(rejected.json.data?.["demoSignIn"], {
        code: status.toUpperCase(),
        viewer: null,
      });
      assert.equal(rejected.headers.get("set-cookie"), null);
    }
    fx.app.sessions.signOut = () => Promise.resolve({ status: "indeterminate" });
    const uncertainLogout = await fx.send("mutation Logout { signOut { code } }", {
      credential: TOKEN_A,
    });
    assert.equal(uncertainLogout.headers.get("set-cookie"), null);

    fx.app.sessions.restore = () => {
      throw new Error("private-database-token-value");
    };
    for (const query of [
      "query SensitiveAlias { private_token_value: me { accountId } }",
      "query Bad { me { private_token_value } }",
      "query Bad { profile(id: 1.5) { id } }",
    ]) {
      const result = await fx.send(query, { credential: TOKEN_A });
      assert.ok(result.json.errors);
      assert.equal(
        /private|stacktrace|node_modules|locations|path/u.test(JSON.stringify(result.json.errors)),
        false,
      );
      assert.equal(result.body.includes("private-database-token-value"), false);
      assert.equal(
        result.json.errors[0]?.extensions.correlationId,
        result.headers.get("x-request-id"),
      );
    }
    const logs = JSON.stringify(fx.traces);
    assert.equal(/private|Synthetic|credential|signature|accountId/u.test(logs), false);
    assert.ok(fx.traces.every((trace) => trace.durationMs >= 0));
    assert.ok(fx.traces.some((trace) => trace.code === "UNAVAILABLE"));
  } finally {
    await fx.close();
  }
});

test("local origin, CSRF and forged identity are rejected before application execution", async () => {
  const fx = await fixture();
  try {
    for (const headers of [
      { origin: "https://attacker.invalid" },
      { "x-aster-csrf": "0" },
      { authorization: "Bearer fake" },
      { "x-aster-account-id": id(3) },
    ]) {
      const result = await fx.send("query Q { profiles { profiles { id } } }", { headers });
      assert.equal(result.status, 403);
    }
    assert.equal(fx.calls.length, 0);
  } finally {
    await fx.close();
  }
});

test("local token bucket rejects excess operations and refills without a queue", async () => {
  let time = 0;
  const fx = await fixture(() => time);
  try {
    for (let index = 0; index < 64; index++) {
      assert.equal((await fx.send("query Q { __typename }")).status, 200);
    }
    const limited = await fx.send("query Q { __typename }");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    time += 125;
    assert.equal((await fx.send("query Q { __typename }")).status, 200);
  } finally {
    await fx.close();
  }
});

test("deadline aborts owner signals; non-cooperative work retains all eight admission slots and cannot issue late cookies", async () => {
  const fx = await fixture();
  const held = Promise.withResolvers<undefined>();
  const signals: AbortSignal[] = [];
  fx.app.sessions.signIn = async (signal) => {
    signals.push(signal);
    await held.promise;
    return { status: "completed", value: { ...viewer, credential: TOKEN_A } };
  };
  try {
    const requests = Array.from({ length: 8 }, () =>
      fx.send("mutation SignIn { demoSignIn { code } }"),
    );
    const results = await Promise.all(requests);
    assert.equal(signals.length, 8);
    assert.ok(signals.every((signal) => signal.aborted));
    assert.ok(
      results.every((result) => result.status === 503 && result.headers.get("set-cookie") === null),
    );
    assert.equal((await fx.send("mutation SignIn { demoSignIn { code } }")).status, 503);
    assert.equal(signals.length, 8);
    held.resolve(undefined);
    for (let attempt = 0; fx.traces.length < 9 && attempt < 100; attempt++) {
      await delay(5);
    }
    assert.equal(fx.traces.length, 9);
    assert.deepEqual(fx.middlewareErrors, []);
    assert.equal((await fx.send("query Q { __typename }")).status, 200);
  } finally {
    held.resolve(undefined);
    await fx.close();
  }
});

test(
  "client disconnect and explicit stop abort the original signal, with idempotent stop",
  { timeout: 10_000 },
  async () => {
    const fx = await fixture();
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<AbortSignal>();
    fx.app.sessions.restore = async (_credential, signal) => {
      entered.resolve(signal);
      await held.promise;
      return { status: "cancelled" };
    };
    try {
      const client = new AbortController();
      const response = fx.send("query Q { me { accountId } }", {
        credential: TOKEN_A,
        signal: client.signal,
      });
      const ownerSignal = await entered.promise;
      client.abort();
      await assert.rejects(response);
      for (let attempt = 0; !ownerSignal.aborted && attempt < 100; attempt++) {
        await delay(5);
      }
      assert.equal(ownerSignal.aborted, true);
      const stop = fx.graph.stop();
      assert.equal(fx.graph.stop(), stop);
      held.resolve(undefined);
      await stop;
      assert.equal((await fx.send("query Q { __typename }")).status, 503);
    } finally {
      held.resolve(undefined);
      await fx.close();
    }
  },
);
