import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  IdentityProfileTransaction,
  IdentityProfileUnitOfWork,
  ProfileMutationReceipt,
  ProfileRequest,
  ProfileResult,
  ProfileSession,
} from "../src/application/profile-ports.js";
import { createIdentityProfiles } from "../src/application/profiles.js";
import { createProfileEvent, type ProfileEvent } from "../src/domain/profile-event.js";
import {
  createProfilePolicy,
  normalizeProfilePreferences,
  type ViewerProfile,
} from "../src/domain/profile.js";
import type { IdentityAccount } from "../src/domain/session.js";

const id = (n: number): string => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const NOW = 1_787_814_000;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const preferences = { displayName: "Viewer A", locale: "pt-BR", maturity: "GENERAL" } as const;
const input = (n: number) => ({ mutationId: id(n), profile: preferences });

// This store proves application intent only. PostgreSQL locking, constraints and rollback need real fixtures.
class ProfileStore implements IdentityProfileUnitOfWork {
  accounts: IdentityAccount[] = [
    { id: id(1), issuer: "urn:test:issuer", subject: "viewer-a" },
    { id: id(100), issuer: "urn:test:issuer", subject: "viewer-b" },
  ];
  sessions: ProfileSession[] = [];
  profiles: ViewerProfile[] = [];
  receipts: ProfileMutationReceipt[] = [];
  audit: ProfileEvent[] = [];
  outbox: ProfileEvent[] = [];
  calls: string[] = [];
  runs = 0;
  selections = 0;
  fault: "none" | "audit" | "outbox" | "receipt" | "unknown_commit" = "none";
  afterOperation: (() => void) | undefined;
  countsOverride: Awaited<ReturnType<IdentityProfileTransaction["retainedCounts"]>> | undefined;

  async run<T>(
    operation: (tx: IdentityProfileTransaction) => Promise<ProfileResult<T>>,
    signal: AbortSignal,
  ): Promise<ProfileResult<T>> {
    this.runs += 1;
    if (signal.aborted) {
      return { status: "cancelled" };
    }
    const before = structuredClone({
      sessions: this.sessions,
      profiles: this.profiles,
      receipts: this.receipts,
      audit: this.audit,
      outbox: this.outbox,
    });
    const restore = (): void => {
      Object.assign(this, before);
    };
    const tx: IdentityProfileTransaction = {
      lockAccount: (identity) => {
        this.calls.push("lock_account");
        return Promise.resolve(
          this.accounts.find(
            (account) => account.issuer === identity.issuer && account.subject === identity.subject,
          ),
        );
      },
      lockSession: (sessionId) => {
        this.calls.push("lock_session");
        return Promise.resolve(this.sessions.find((session) => session.id === sessionId));
      },
      listProfiles: (accountId) =>
        Promise.resolve(this.profiles.filter((profile) => profile.accountId === accountId)),
      findProfile: (accountId, profileId) =>
        Promise.resolve(
          this.profiles.find(
            (profile) => profile.accountId === accountId && profile.id === profileId,
          ),
        ),
      insertProfile: (profile) => {
        this.profiles.push(profile);
        return Promise.resolve();
      },
      updateProfile: (profile, expectedVersion) => {
        const index = this.profiles.findIndex(
          (item) =>
            item.id === profile.id &&
            item.accountId === profile.accountId &&
            item.version === expectedVersion,
        );
        if (index < 0) {
          return Promise.resolve(false);
        }
        this.profiles[index] = profile;
        return Promise.resolve(true);
      },
      deleteProfile: (accountId, profileId, expectedVersion) => {
        const count = this.profiles.length;
        this.profiles = this.profiles.filter(
          (profile) =>
            profile.id !== profileId ||
            profile.accountId !== accountId ||
            profile.version !== expectedVersion,
        );
        return Promise.resolve(count !== this.profiles.length);
      },
      selectProfile: (accountId, sessionId, profileId) => {
        this.selections += 1;
        this.sessions = this.sessions.map((session) =>
          session.account.id === accountId && session.id === sessionId
            ? { ...session, activeProfileId: profileId }
            : session,
        );
        return Promise.resolve();
      },
      clearSelectedProfile: (accountId, profileId) => {
        this.sessions = this.sessions.map((session) =>
          session.account.id === accountId && session.activeProfileId === profileId
            ? { ...session, activeProfileId: null }
            : session,
        );
        return Promise.resolve();
      },
      pruneReceiptsAndAudit: (accountId, now) => {
        this.receipts = this.receipts.filter(
          (receipt) => receipt.accountId !== accountId || receipt.expiresAt > now,
        );
        this.audit = this.audit.filter(
          (event) =>
            event.payload.accountId !== accountId ||
            Date.parse(event.occurredAt) / 1_000 > now - 30 * 86_400,
        );
        return Promise.resolve();
      },
      findReceipt: (accountId, mutationId, now) =>
        Promise.resolve(
          this.receipts.find(
            (receipt) =>
              receipt.accountId === accountId &&
              receipt.mutationId === mutationId &&
              receipt.expiresAt > now,
          ),
        ),
      retainedCounts: (accountId) =>
        Promise.resolve(
          this.countsOverride ?? {
            receipts: this.receipts.filter((receipt) => receipt.accountId === accountId).length,
            audit: this.audit.filter((event) => event.payload.accountId === accountId).length,
            outbox: this.outbox.filter((event) => event.payload.accountId === accountId).length,
          },
        ),
      writeReceipt: (receipt) => {
        if (this.fault === "receipt") {
          return Promise.reject(new Error("private-receipt-cause"));
        }
        this.receipts.push(receipt);
        return Promise.resolve();
      },
      appendAudit: (event) => {
        if (this.fault === "audit") {
          return Promise.reject(new Error("private-audit-cause"));
        }
        this.audit.push(event);
        return Promise.resolve();
      },
      appendOutbox: (event) => {
        if (this.fault === "outbox") {
          return Promise.reject(new Error("private-outbox-cause"));
        }
        this.outbox.push(event);
        this.afterOperation?.();
        return Promise.resolve();
      },
    };
    try {
      const result = await operation(tx);
      if (result.status !== "completed") {
        restore();
      } else if (this.fault === "unknown_commit") {
        this.fault = "none";
        return { status: "indeterminate" };
      }
      return result;
    } catch (error) {
      restore();
      throw error;
    }
  }
}

function fixture(maximumProfiles = 5) {
  const store = new ProfileStore();
  const clock = { now: NOW };
  const accountA = store.accounts[0];
  const accountB = store.accounts[1];
  assert.ok(accountA && accountB);
  store.sessions = [
    {
      id: id(2),
      account: accountA,
      credentialDigest: hash("assertion-a"),
      signerId: id(99),
      issuedAt: NOW,
      expiresAt: NOW + 1_800,
      activeProfileId: null,
    },
    {
      id: id(3),
      account: accountB,
      credentialDigest: hash("assertion-b"),
      signerId: id(99),
      issuedAt: NOW,
      expiresAt: NOW + 1_800,
      activeProfileId: null,
    },
  ];
  let sequence = 1_000;
  const app = createIdentityProfiles({
    identity: {
      verify: (credential) => {
        // This trusted verifier port is a test seam; production cryptography is covered by P02-R01.
        if (credential !== "assertion-a" && credential !== "assertion-b") {
          return Promise.resolve({ status: "unauthenticated" as const });
        }
        return Promise.resolve({
          status: "completed" as const,
          value: {
            issuer: "urn:test:issuer",
            subject: credential === "assertion-a" ? "viewer-a" : "viewer-b",
            sessionId: id(credential === "assertion-a" ? 2 : 3),
            issuedAt: NOW,
            expiresAt: NOW + 1_800,
          },
        });
      },
    },
    transactions: store,
    policy: createProfilePolicy({ maximumProfiles }),
    signerId: id(99),
    nextId: () => id(++sequence),
    now: () => clock.now,
    digest: hash,
  });
  const request = (credential: unknown = "assertion-a"): ProfileRequest => ({
    credential,
    signal: new AbortController().signal,
    context: {
      correlationId: id(50),
      causationId: null,
      traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
    },
  });
  return { app, store, request, clock };
}

test("profile preferences normalize Unicode and locale with bounded configuration", () => {
  const policy = createProfilePolicy();
  assert.equal(policy.maximumProfiles, 5);
  assert.deepEqual(
    normalizeProfilePreferences(
      { ...preferences, displayName: "  Cine\u0301ma  viewer\t", locale: "pt-br" },
      policy,
    ),
    {
      displayName: "Cinéma viewer",
      locale: "pt-BR",
      maturity: "GENERAL",
      avatarRef: null,
    },
  );
  assert.ok(normalizeProfilePreferences({ ...preferences, displayName: "🎬".repeat(60) }, policy));
  for (const maximumProfiles of [0, 17, 1.5, Number.NaN]) {
    assert.throws(() => createProfilePolicy({ maximumProfiles }));
  }
  for (const supportedLocales of [
    [],
    ["en-US", "en-us"],
    ["not_valid"],
    Array.from({ length: 17 }, () => "pt-BR"),
  ]) {
    assert.throws(() => createProfilePolicy({ supportedLocales }));
  }
});

test("private profile authority binds current session, owner and expiry without preferences", async () => {
  const f = fixture();
  const created = await f.app.create(f.request(), input(10));
  assert.equal(created.status, "completed");
  const profileId = created.value.profileId;
  assert.deepEqual(await f.app.authorize(f.request(), profileId), {
    status: "completed",
    value: { accountId: id(1), profileId, checkedAt: NOW, expiresAt: NOW + 1800 },
  });
  assert.equal((await f.app.authorize(f.request("assertion-b"), profileId)).status, "not_found");
  assert.equal((await f.app.authorize(f.request("invalid"), profileId)).status, "unauthenticated");
  assert.equal((await f.app.authorize(f.request(), "invalid")).status, "invalid_input");
  f.clock.now = NOW + 1800;
  assert.equal((await f.app.authorize(f.request(), profileId)).status, "unauthenticated");
  assert.equal(f.store.outbox.length, 1);
});

test("hostile profile inputs are rejected without invoking getters or coercion", () => {
  const policy = createProfilePolicy();
  let reads = 0;
  const getter = {
    ...preferences,
    get displayName() {
      reads += 1;
      return "not-read";
    },
  };
  const cases = [
    null,
    [],
    new Date(),
    getter,
    { ...preferences, extra: true },
    ...["", " ", "x".repeat(61), "x".repeat(257), "nul\u0000", "bidi\u202e", "\ud800"].map(
      (displayName) => ({ ...preferences, displayName }),
    ),
    { ...preferences, locale: "fr-FR" },
    { ...preferences, locale: {} },
    { ...preferences, maturity: "operator" },
    { ...preferences, avatarRef: "https://untrusted.invalid/avatar" },
  ];
  for (const value of cases) {
    assert.equal(normalizeProfilePreferences(value, policy), undefined);
  }
  assert.equal(reads, 0);
});

test("create/list/get/select require a live owner and store minimal event facts", async () => {
  const { app, store, request } = fixture();
  const created = await app.create(request(), input(10));
  assert.equal(created.status, "completed");
  const profileId = created.value.profileId;
  assert.deepEqual(store.calls.slice(0, 2), ["lock_account", "lock_session"]);
  const listed = await app.list(request());
  assert.equal(listed.status, "completed");
  assert.equal(listed.value.profiles.length, 1);
  assert.equal(listed.value.activeProfileId, null);
  assert.equal((await app.get(request(), profileId)).status, "completed");
  assert.equal((await app.active(request(), profileId)).status, "not_found");
  assert.equal((await app.select(request(), profileId)).status, "completed");
  assert.equal((await app.select(request(), profileId)).status, "completed");
  assert.equal(store.selections, 1);
  assert.equal((await app.active(request(), profileId)).status, "completed");
  assert.equal(store.audit.length, 1);
  assert.equal(store.outbox.length, 1);
  assert.equal(
    JSON.stringify([store.audit, store.outbox, store.receipts]).includes(preferences.displayName),
    false,
  );
  assert.equal(
    JSON.stringify([store.audit, store.outbox, store.receipts]).includes("assertion-a"),
    false,
  );
  assert.deepEqual(store.outbox[0]?.aggregate, { type: "Profile", id: profileId, version: 1 });
  assert.equal(store.outbox[0].schemaVersion, 1);
});

test("canonical duplicate create and unknown commit replay without duplicate state/events", async () => {
  const { app, store, request } = fixture();
  store.fault = "unknown_commit";
  assert.equal((await app.create(request(), input(10))).status, "indeterminate");
  const replay = await app.create(request(), {
    ...input(10),
    profile: { ...preferences, displayName: " Viewer  A " },
  });
  assert.equal(replay.status, "completed");
  assert.equal(store.profiles.length, 1);
  assert.equal(store.outbox.length, 1);
  assert.equal(store.audit.length, 1);
  assert.equal(store.receipts.length, 1);
  assert.equal(
    (
      await app.create(request(), {
        ...input(10),
        profile: { ...preferences, displayName: "Changed" },
      })
    ).status,
    "conflict",
  );
});

test("replay probe reads durable receipts without changing profile state", async () => {
  const { app, store, request } = fixture();
  const create = input(10);
  const created = await app.create(request(), create);
  assert.equal(created.status, "completed");
  const before = structuredClone({
    profiles: store.profiles,
    receipts: store.receipts,
    audit: store.audit,
    outbox: store.outbox,
  });

  assert.deepEqual(await app.probeMutationReplay("create", request(), create), {
    status: "completed",
    value: { kind: "replay", result: created.value },
  });
  assert.equal(
    (
      await app.probeMutationReplay("create", request(), {
        ...create,
        profile: { ...preferences, displayName: "Changed" },
      })
    ).status,
    "conflict",
  );
  const missing = await app.probeMutationReplay("create", request(), input(11));
  assert.equal(missing.status, "completed");
  assert.equal(missing.value.kind, "missing");
  assert.equal(missing.value.accountId, id(1));
  assert.match(missing.value.admissionIdentity, new RegExp(`^${id(11)}\\u0000[a-f0-9]{64}$`, "u"));
  assert.deepEqual(
    {
      profiles: store.profiles,
      receipts: store.receipts,
      audit: store.audit,
      outbox: store.outbox,
    },
    before,
  );
});

test("versioned update, no-op and deletion are atomic and replayable", async () => {
  const { app, store, request } = fixture();
  const created = await app.create(request(), input(10));
  assert.equal(created.status, "completed");
  const profileId = created.value.profileId;
  await app.select(request(), profileId);
  const noOp = await app.update(request(), {
    mutationId: id(11),
    profileId,
    expectedVersion: 1,
    profile: preferences,
  });
  assert.equal(noOp.status, "completed");
  assert.equal(noOp.value.version, 1);
  assert.equal(store.outbox.length, 1);
  const changed = {
    mutationId: id(12),
    profileId,
    expectedVersion: 1,
    profile: { ...preferences, displayName: "Updated", maturity: "TEEN" },
  };
  const updated = await app.update(request(), changed);
  assert.equal(updated.status, "completed");
  assert.equal(updated.value.version, 2);
  assert.equal(
    (await app.update(request(), { ...changed, mutationId: id(13) })).status,
    "conflict",
  );
  const removal = { mutationId: id(14), profileId, expectedVersion: 2 };
  const deleted = await app.delete(request(), removal);
  assert.equal(deleted.status, "completed");
  assert.equal(deleted.value.version, 3);
  assert.deepEqual(await app.delete(request(), removal), deleted);
  assert.deepEqual(await app.update(request(), changed), updated);
  assert.equal(store.profiles.length, 0);
  assert.equal(store.accounts.length, 2);
  assert.equal(store.sessions[0]?.activeProfileId, null);
  assert.equal((await app.active(request(), profileId)).status, "not_found");
  assert.equal(
    (await app.delete(request(), { ...removal, mutationId: id(15) })).status,
    "not_found",
  );
  assert.deepEqual(
    store.outbox.map((event) => event.eventType),
    ["identity.profile-created", "identity.profile-updated", "identity.profile-deleted"],
  );
  assert.equal(
    JSON.stringify([store.receipts, store.audit, store.outbox]).includes("Updated"),
    false,
  );
});

test("a supplied foreign profile or account cannot authorize reads, writes or selection", async () => {
  const { app, store, request } = fixture();
  const foreign = await app.create(request("assertion-b"), input(10));
  assert.equal(foreign.status, "completed");
  const profileId = foreign.value.profileId;
  assert.equal((await app.get(request(), profileId)).status, "not_found");
  assert.equal((await app.select(request(), profileId)).status, "not_found");
  assert.equal((await app.active(request(), profileId)).status, "not_found");
  assert.equal(
    (
      await app.update(request(), {
        mutationId: id(11),
        profileId,
        expectedVersion: 1,
        profile: preferences,
      })
    ).status,
    "not_found",
  );
  assert.equal(
    (await app.delete(request(), { mutationId: id(12), profileId, expectedVersion: 1 })).status,
    "not_found",
  );
  const list = await app.list(request());
  assert.equal(list.status, "completed");
  assert.equal(list.value.profiles.length, 0);
  assert.equal(
    (await app.create(request({ accountId: id(100) }), input(13))).status,
    "unauthenticated",
  );
  assert.equal(store.profiles.length, 1);
  assert.equal(store.outbox.length, 1);
});

test("malformed, revoked, expired and substituted sessions fail closed", async (t) => {
  for (const mode of ["missing", "expiry", "digest", "signer", "subject", "account"] as const) {
    await t.test(mode, async () => {
      const { app, store, request, clock } = fixture();
      const session = store.sessions[0];
      assert.ok(session);
      if (mode === "missing") {
        store.sessions = [];
      }
      if (mode === "expiry") {
        clock.now += 1_800;
      }
      if (mode === "digest") {
        store.sessions[0] = { ...session, credentialDigest: "0".repeat(64) };
      }
      if (mode === "signer") {
        store.sessions[0] = { ...session, signerId: id(98) };
      }
      if (mode === "subject") {
        store.sessions[0] = {
          ...session,
          account: { ...session.account, subject: "substitution" },
        };
      }
      if (mode === "account") {
        store.sessions[0] = { ...session, account: { ...session.account, id: id(100) } };
      }
      assert.equal((await app.create(request(), input(10))).status, "unauthenticated");
      assert.equal(store.profiles.length, 0);
    });
  }
});

test("pre-cancellation and expiry during a mutation never authorize durable intent", async () => {
  const { app, store, request, clock } = fixture();
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await app.create({ ...request(), signal: controller.signal }, input(10))).status,
    "cancelled",
  );
  assert.equal(store.runs, 0);
  store.afterOperation = () => {
    clock.now += 1_800;
  };
  assert.equal((await app.create(request(), input(11))).status, "unauthenticated");
  assert.equal(store.profiles.length, 0);
  assert.equal(store.outbox.length, 0);
  assert.equal(store.audit.length, 0);
});

test("audit, outbox or receipt failure rolls back application intent and sanitizes errors", async (t) => {
  for (const fault of ["audit", "outbox", "receipt"] as const) {
    await t.test(fault, async () => {
      const { app, store, request } = fixture();
      store.fault = fault;
      assert.deepEqual(await app.create(request(), input(10)), { status: "unavailable" });
      assert.equal(store.profiles.length, 0);
      assert.equal(store.outbox.length, 0);
      assert.equal(store.audit.length, 0);
      assert.equal(store.receipts.length, 0);
    });
  }
});

test("profile and journal capacities reject writes without discarding pending facts", async () => {
  const { app, store, request } = fixture(1);
  const created = await app.create(request(), input(10));
  assert.equal(created.status, "completed");
  assert.equal((await app.create(request(), input(11))).status, "limit_exceeded");
  for (const counts of [
    { receipts: 64, audit: 1, outbox: 1 },
    { receipts: 1, audit: 128, outbox: 1 },
    { receipts: 1, audit: 1, outbox: 128 },
  ]) {
    store.countsOverride = counts;
    assert.equal(
      (
        await app.update(request(), {
          mutationId: id(12),
          profileId: created.value.profileId,
          expectedVersion: 1,
          profile: { ...preferences, displayName: "Blocked" },
        })
      ).status,
      "backpressure",
    );
    assert.equal((await app.list(request())).status, "completed");
    assert.equal((await app.select(request(), created.value.profileId)).status, "completed");
  }
  assert.equal(store.profiles[0]?.version, 1);
  assert.equal(store.outbox.length, 1);
});

test("event envelope rejects invalid IDs, versions, clocks and trace context", () => {
  const event = {
    eventId: id(1),
    accountId: id(2),
    profileId: id(3),
    version: 1,
    now: NOW,
    eventType: "identity.profile-created" as const,
    context: { correlationId: id(4), causationId: null },
  };
  assert.equal(createProfileEvent(event).occurredAt, "2026-08-27T07:00:00.000Z");
  for (const override of [
    { version: 0 },
    { eventId: "invalid" },
    { now: Number.NaN },
    {
      context: {
        ...event.context,
        traceparent: "00-00000000000000000000000000000000-1111111111111111-01",
      },
    },
  ]) {
    assert.throws(() => createProfileEvent({ ...event, ...override }));
  }
});
