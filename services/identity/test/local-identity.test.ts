import assert from "node:assert/strict";
import test from "node:test";

import { generateKeyPair, SignJWT, type JWTPayload } from "jose";

import {
  AsterLocalIdentityConfigurationError,
  createLocalAssertionVerifier,
  createLocalIdentityAdapter,
  LOCAL_IDENTITY_AUDIENCE,
  LOCAL_IDENTITY_ISSUER,
  LOCAL_IDENTITY_SUBJECT,
  LOCAL_IDENTITY_TYPE,
  LOCAL_SESSION_LIFETIME_SECONDS,
} from "../src/infrastructure/identity/local-identity.js";

const NOW = 1_787_814_000;
const SESSION = "00000000-0000-4000-8000-000000000001";
const configuration = {
  environment: "local",
  localDemoEnabled: true,
  publicOrigin: "http://127.0.0.1:3100",
};
const signal = (): AbortSignal => new AbortController().signal;
const claims = (): JWTPayload => ({
  iss: LOCAL_IDENTITY_ISSUER,
  aud: LOCAL_IDENTITY_AUDIENCE,
  sub: LOCAL_IDENTITY_SUBJECT,
  jti: SESSION,
  iat: NOW,
  exp: NOW + LOCAL_SESSION_LIFETIME_SECONDS,
});

test("local issuer fixes identity claims and expires at the exact absolute boundary", async () => {
  let now = NOW;
  const adapter = await createLocalIdentityAdapter(configuration, () => now);
  const issued = await adapter.issue(SESSION, signal());
  assert.equal(issued.status, "completed");
  assert.deepEqual(await adapter.verify(issued.value, signal()), {
    status: "completed",
    value: {
      issuer: LOCAL_IDENTITY_ISSUER,
      subject: LOCAL_IDENTITY_SUBJECT,
      sessionId: SESSION,
      issuedAt: NOW,
      expiresAt: NOW + LOCAL_SESSION_LIFETIME_SECONDS,
    },
  });
  now += LOCAL_SESSION_LIFETIME_SECONDS;
  assert.deepEqual(await adapter.verify(issued.value, signal()), { status: "unauthenticated" });
});

test("local activation rejects hosted environments, missing opt-in and noncanonical origins", async (t) => {
  const invalid = [
    ...["production", "staging", "integration", "test", "", "LOCAL"].map((environment) => ({
      ...configuration,
      environment,
    })),
    ...[false, "true", 1, undefined, {}].map((localDemoEnabled) => ({
      ...configuration,
      localDemoEnabled,
    })),
    ...[
      "https://example.invalid",
      "http://0.0.0.0:3100",
      "http://localhost:3100",
      "http://127.0.0.1",
      "http://127.0.0.1:80",
      "http://127.0.0.1:3100/",
      "http://127.0.0.1:3100?demo=true",
      "http://127.0.0.1:3100#demo",
      " http://127.0.0.1:3100",
      "http://127.1:3100",
      "x".repeat(129),
    ].map((publicOrigin) => ({ ...configuration, publicOrigin })),
  ];
  for (const [index, candidate] of invalid.entries()) {
    await t.test(String(index), async () => {
      await assert.rejects(
        createLocalIdentityAdapter(candidate, () => NOW),
        (error: unknown) => {
          assert.ok(error instanceof AsterLocalIdentityConfigurationError);
          assert.equal(error.message, "Local identity configuration is invalid.");
          assert.equal(error.code, "ASTER_LOCAL_IDENTITY_INVALID");
          assert.equal(error.cause, undefined);
          return true;
        },
      );
    });
  }
});

test("real signatures fail closed for every required claim and token purpose", async (t) => {
  const keys = await generateKeyPair("ES256");
  const verify = createLocalAssertionVerifier(keys.publicKey, () => NOW);
  const sign = (payload: JWTPayload, header: Record<string, unknown> = {}) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "ES256", typ: LOCAL_IDENTITY_TYPE, ...header })
      .sign(keys.privateKey);
  assert.equal((await verify(await sign(claims()), signal())).status, "completed");
  const cases: readonly [string, JWTPayload, Record<string, unknown>?][] = [
    ["issuer", { ...claims(), iss: "urn:attacker:identity" }],
    ["audience", { ...claims(), aud: "aster:router-internal" }],
    ["audience array", { ...claims(), aud: [LOCAL_IDENTITY_AUDIENCE, "another"] }],
    ["subject", { ...claims(), sub: "operator" }],
    ["empty subject", { ...claims(), sub: "" }],
    ["session identifier", { ...claims(), jti: "caller-selected-account" }],
    ["expired", { ...claims(), exp: NOW }],
    ["future issue", { ...claims(), iat: NOW + 1 }],
    ["negative issue", { ...claims(), iat: -1 }],
    ["fractional issue", { ...claims(), iat: NOW - 0.5 }],
    ["fractional expiry", { ...claims(), exp: NOW + 0.5 }],
    ["excess lifetime", { ...claims(), exp: NOW + LOCAL_SESSION_LIFETIME_SECONDS + 1 }],
    ["not before", { ...claims(), nbf: NOW + 1 }],
    ["purpose", claims(), { typ: "JWT" }],
    ["key URL", claims(), { jku: "https://attacker.invalid/keys" }],
    ["unselected key id", claims(), { kid: "untrusted-key" }],
  ];
  for (const [name, payload, header] of cases) {
    await t.test(name, async () => {
      assert.deepEqual(await verify(await sign(payload, header), signal()), {
        status: "unauthenticated",
      });
    });
  }
  for (const key of ["iss", "aud", "sub", "jti", "iat", "exp"] as const) {
    await t.test("missing " + key, async () => {
      const payload = Object.fromEntries(Object.entries(claims()).filter(([name]) => name !== key));
      assert.deepEqual(await verify(await sign(payload), signal()), { status: "unauthenticated" });
    });
  }
  const wrongAlgorithm = await new SignJWT(claims())
    .setProtectedHeader({ alg: "HS256", typ: LOCAL_IDENTITY_TYPE })
    .sign(new Uint8Array(32).fill(1));
  assert.deepEqual(await verify(wrongAlgorithm, signal()), { status: "unauthenticated" });
  const otherKeys = await generateKeyPair("ES256");
  const forged = await new SignJWT(claims())
    .setProtectedHeader({ alg: "ES256", typ: LOCAL_IDENTITY_TYPE })
    .sign(otherKeys.privateKey);
  assert.deepEqual(await verify(forged, signal()), { status: "unauthenticated" });
});

test("malformed and oversized tokens are rejected without coercing caller objects", async () => {
  const adapter = await createLocalIdentityAdapter(configuration, () => NOW);
  for (const token of [
    undefined,
    null,
    [],
    { toString: () => assert.fail("Must not coerce a token") },
    "",
    "not-a-jwt",
    "one.two.three",
    "x".repeat(4_097),
  ]) {
    assert.deepEqual(await adapter.verify(token, signal()), { status: "unauthenticated" });
  }
  for (const id of ["", "x".repeat(4_097), "00000000-0000-0000-0000-000000000000"]) {
    assert.deepEqual(await adapter.issue(id, signal()), { status: "invalid_input" });
  }
});

test("signing and verification share eight slots, do not queue and release after cancellation", async () => {
  const adapter = await createLocalIdentityAdapter(configuration, () => NOW);
  const original = await adapter.issue(SESSION, signal());
  assert.equal(original.status, "completed");
  const cancellation = new AbortController();
  const pending = Array.from({ length: 8 }, () => adapter.issue(SESSION, cancellation.signal));
  const overflowVerification = adapter.verify(original.value, signal());
  const overflowIssuance = adapter.issue(SESSION, signal());
  cancellation.abort();
  assert.deepEqual(await overflowVerification, { status: "unavailable" });
  assert.deepEqual(await overflowIssuance, { status: "unavailable" });
  assert.ok((await Promise.all(pending)).every((result) => result.status === "cancelled"));
  assert.equal((await adapter.verify(original.value, signal())).status, "completed");
  assert.deepEqual(await adapter.issue(SESSION, cancellation.signal), { status: "cancelled" });
  assert.deepEqual(await adapter.verify(original.value, cancellation.signal), {
    status: "cancelled",
  });
});

test("ephemeral signer restart invalidates earlier assertions", async () => {
  const before = await createLocalIdentityAdapter(configuration, () => NOW);
  const after = await createLocalIdentityAdapter(configuration, () => NOW);
  const issued = await before.issue(SESSION, signal());
  assert.equal(issued.status, "completed");
  assert.deepEqual(await after.verify(issued.value, signal()), { status: "unauthenticated" });
});

test("invalid or failed clocks cannot produce an authenticated result", async () => {
  for (const timestamp of [NaN, Infinity, -1, NOW + 0.5, 100_000_000_000_000]) {
    const adapter = await createLocalIdentityAdapter(configuration, () => timestamp);
    assert.deepEqual(await adapter.issue(SESSION, signal()), { status: "unavailable" });
  }
  const adapter = await createLocalIdentityAdapter(configuration, () => {
    throw new Error("Private clock details");
  });
  assert.deepEqual(await adapter.issue(SESSION, signal()), { status: "unavailable" });
});
