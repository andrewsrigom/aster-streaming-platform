import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createRateLimitedIdentityProfiles,
  type RateLimitedIdentityProfilesOptions,
} from "../src/application/profile-operation-limit.js";
import type { ProfileRequest } from "../src/application/profile-ports.js";
import { createProfilePolicy } from "../src/domain/profile.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const accountId = "00000000-0000-4000-8000-000000000001";
const mutationId = "00000000-0000-4000-8000-000000000031";
const createInput = {
  mutationId,
  profile: { displayName: "Viewer", locale: "en-US", maturity: "GENERAL" },
};
const request = (): ProfileRequest => ({
  credential: "signed-cookie",
  signal: new AbortController().signal,
  context: {
    correlationId: "00000000-0000-4000-8000-000000000011",
    causationId: "00000000-0000-4000-8000-000000000012",
    traceparent: "00-00000000000000000000000000000001-0000000000000001-01",
  },
});

function applications(
  events: string[],
  admission: "allowed" | "rejected" | "unavailable",
  admissionIds: string[] = [],
) {
  const profile = {
    id: "00000000-0000-4000-8000-000000000021",
    accountId,
    displayName: "Viewer",
    locale: "en",
    maturity: "GENERAL" as const,
    avatarRef: null,
    version: 1,
  };
  const profiles = {
    authorize: () => Promise.resolve({ status: "not_found" as const }),
    create: () => {
      events.push("base.create");
      return Promise.resolve({
        status: "completed" as const,
        value: { profileId: profile.id, version: 1 },
      });
    },
    update: () => Promise.resolve({ status: "not_found" as const }),
    delete: () => Promise.resolve({ status: "not_found" as const }),
    list: () =>
      Promise.resolve({
        status: "completed" as const,
        value: { profiles: [profile], activeProfileId: profile.id },
      }),
    get: () => Promise.resolve({ status: "completed" as const, value: profile }),
    select: () => {
      events.push("base.select");
      return Promise.resolve({ status: "completed" as const, value: profile });
    },
    active: () => Promise.resolve({ status: "completed" as const, value: profile }),
  } as unknown as RateLimitedIdentityProfilesOptions["profiles"];
  let generated = 0;
  return createRateLimitedIdentityProfiles({
    profiles,
    sessions: {
      restore: () => {
        events.push("sessions.restore");
        return Promise.resolve({
          status: "completed" as const,
          value: { accountId, sessionId: profile.id, expiresAt: 2_000_000_000 },
        });
      },
    },
    limiter: {
      admit: (operation, receivedAccount, admissionId) => {
        events.push(`limiter.${operation}`);
        admissionIds.push(admissionId);
        assert.equal(receivedAccount, accountId);
        assert.match(admissionId, /^[a-f0-9]{64}$/u);
        return Promise.resolve(
          admission === "rejected"
            ? { status: "rejected" as const, retryAfterMs: 500 }
            : { status: admission },
        );
      },
    },
    nextId: () => `00000000-0000-4000-8000-${String(++generated).padStart(12, "0")}`,
    digest,
    policy: createProfilePolicy(),
  });
}

test("authorizes, admits outside the base transaction and then re-enters owner validation", async () => {
  const events: string[] = [];
  const profiles = applications(events, "allowed");
  assert.equal((await profiles.create(request(), createInput)).status, "completed");
  assert.equal((await profiles.select(request(), "profile")).status, "completed");
  assert.deepEqual(events, [
    "sessions.restore",
    "limiter.profile_mutation",
    "base.create",
    "sessions.restore",
    "limiter.profile_selection",
    "base.select",
  ]);
});

test("a rejected or unavailable admission never reaches the profile write", async () => {
  for (const [admission, expected] of [
    ["rejected", "limit_exceeded"],
    ["unavailable", "unavailable"],
  ] as const) {
    const events: string[] = [];
    const profiles = applications(events, admission);
    assert.equal((await profiles.create(request(), createInput)).status, expected);
    assert.deepEqual(events, ["sessions.restore", "limiter.profile_mutation"]);
  }
});

test("reuses the canonical durable mutation request across exact retries", async () => {
  const events: string[] = [];
  const admissions: string[] = [];
  const profiles = applications(events, "allowed", admissions);
  assert.equal((await profiles.create(request(), createInput)).status, "completed");
  assert.equal((await profiles.create(request(), createInput)).status, "completed");
  assert.equal(
    (
      await profiles.create(request(), {
        ...createInput,
        profile: { ...createInput.profile, displayName: "Changed" },
      })
    ).status,
    "completed",
  );
  assert.equal(admissions.length, 3);
  assert.equal(admissions[0], admissions[1]);
  assert.notEqual(admissions[1], admissions[2]);
});

test("rejects malformed mutation identity before rate admission", async () => {
  const events: string[] = [];
  const profiles = applications(events, "allowed");
  assert.equal(
    (await profiles.create(request(), { mutationId: "raw", profile: {} })).status,
    "invalid_input",
  );
  assert.deepEqual(events, ["sessions.restore"]);
});

test("read-only profile paths bypass mutation admission", async () => {
  const events: string[] = [];
  const profiles = applications(events, "rejected");
  assert.equal((await profiles.list(request())).status, "completed");
  assert.deepEqual(events, []);
});
