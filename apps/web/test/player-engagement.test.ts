import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  attachPlayerEngagement,
  type PlayerProgressView,
} from "../features/engagement/player-engagement.ts";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
class Media extends EventTarget {
  currentTime = 0;
  duration = 60;
  readyState = 1;
  paused = false;
  seeking = false;
}
class Visibility extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}
function deferred() {
  let resolve: (response: Response) => void = () => {};
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function fixture(t: TestContext, initial?: { anonymous?: boolean; badSelection?: boolean }) {
  let clock = 1000000;
  let timerId = 0;
  let anonymous = initial?.anonymous ?? false;
  let profileId = id(1);
  let name = "First";
  let sequence = 7;
  let positionMs = 15000;
  const expiresAt = 1060000;
  const timers = new Map<number, { at: number; work: () => void }>();
  const calls: { name: string; variables: Record<string, unknown>; init: RequestInit }[] = [];
  const states: PlayerProgressView[] = [];
  const waiters: {
    condition: (state: PlayerProgressView) => boolean;
    resolve: (state: PlayerProgressView) => void;
  }[] = [];
  const entered: { name: string; resolve: () => void }[] = [];
  let hold: { name: string; response: ReturnType<typeof deferred> } | undefined;
  const media = new Media();
  const visibility = new Visibility();
  const page = new EventTarget();
  const changes = new EventTarget();
  const progress = () => ({
    id: id(5),
    profileId,
    titleId: id(2),
    sequence,
    version: sequence,
    positionMs,
    durationMs: 60000,
    status: "IN_PROGRESS",
    occurredAt: 1000,
    updatedAt: 1000,
  });
  const controller = attachPlayerEngagement({
    media,
    visibility,
    page,
    sessionChanges: changes,
    session: {
      id: id(3),
      titleId: id(2),
      expiresAt: 1900,
      manifestUrl: "https://media.example/master.m3u8",
    },
    now: () => clock,
    schedule(work, delayMs) {
      const key = ++timerId;
      timers.set(key, { at: clock + delayMs, work });
      return () => {
        timers.delete(key);
      };
    },
    onState(state) {
      states.push(state);
      for (const waiter of waiters.splice(0)) {
        if (waiter.condition(state)) {
          waiter.resolve(state);
        } else {
          waiters.push(waiter);
        }
      }
    },
    fetcher(url, init) {
      assert.equal(url, "http://127.0.0.1:4000/graphql");
      assert.ok(typeof init?.body === "string");
      const request = JSON.parse(init.body) as {
        operationName: string;
        variables: Record<string, unknown>;
      };
      calls.push({ name: request.operationName, variables: request.variables, init });
      for (const waiter of entered.splice(0)) {
        if (waiter.name === request.operationName) {
          waiter.resolve();
        } else {
          entered.push(waiter);
        }
      }
      if (hold?.name === request.operationName) {
        const response = hold.response;
        hold = undefined;
        return response.promise;
      }
      if (request.operationName === "Viewer") {
        return Promise.resolve(
          Response.json({
            data: {
              me: anonymous
                ? null
                : {
                    accountId: id(8),
                    expiresAt: new Date(expiresAt).toISOString(),
                  },
            },
          }),
        );
      }
      if (request.operationName === "Profiles") {
        return Promise.resolve(
          Response.json({
            data: {
              profiles: {
                activeProfileId: initial?.badSelection ? id(99) : profileId,
                profiles: [
                  {
                    id: profileId,
                    displayName: name,
                    locale: "en",
                    maturity: "GENERAL",
                    avatarRef: null,
                    version: 1,
                  },
                ],
              },
            },
          }),
        );
      }
      if (request.operationName === "PlayerProgress") {
        return Promise.resolve(
          Response.json({ data: { profile: { id: profileId, progress: progress() } } }),
        );
      }
      assert.equal(request.operationName, "RecordProgress");
      const input = request.variables["input"] as {
        profileId: string;
        sequence: number;
        positionMs: number;
        occurredAt: number;
      };
      assert.equal(input.profileId, profileId);
      sequence = input.sequence;
      positionMs = input.positionMs;
      return Promise.resolve(
        Response.json({
          data: {
            recordProgress: {
              code: "COMPLETED",
              correlationId: id(9),
              progress: { ...progress(), occurredAt: input.occurredAt },
            },
          },
        }),
      );
    },
  });
  t.after(() => {
    controller.dispose();
  });
  return {
    controller,
    media,
    visibility,
    page,
    changes,
    calls,
    states,
    state(condition: (state: PlayerProgressView) => boolean) {
      const current = states.at(-1);
      if (current && condition(current)) {
        return Promise.resolve(current);
      }
      return new Promise<PlayerProgressView>((resolve) => {
        waiters.push({ condition, resolve });
      });
    },
    holdNext(name: string) {
      const response = deferred();
      hold = { name, response };
      const started = new Promise<void>((resolve) => {
        entered.push({ name, resolve });
      });
      return { ...response, started };
    },
    async advance(milliseconds: number) {
      clock += milliseconds;
      for (const [key, timer] of [...timers]) {
        if (timer.at <= clock) {
          timers.delete(key);
          timer.work();
        }
      }
      await Promise.resolve();
    },
    switchProfile() {
      profileId = id(10);
      name = "Second";
      sequence = 3;
      changes.dispatchEvent(new MessageEvent("message", { data: "changed" }));
    },
    signOut() {
      anonymous = true;
      changes.dispatchEvent(new MessageEvent("message", { data: "changed" }));
    },
    profileResponse() {
      return Response.json({ data: { profile: { id: profileId, progress: progress() } } });
    },
  };
}
const ready = (state: PlayerProgressView) => state.kind === "ready";
const saved = (state: PlayerProgressView) => state.kind === "ready" && state.status === "saved";

test(
  "selected profile loads fresh progress, resumes and reports with the persisted sequence",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    await f.state(ready);
    assert.equal(f.media.currentTime, 15);
    f.media.currentTime = 23;
    f.media.dispatchEvent(new Event("timeupdate"));
    await f.advance(15000);
    await f.state(saved);
    assert.deepEqual(
      f.calls.map((call) => call.name),
      ["Viewer", "Profiles", "PlayerProgress", "RecordProgress"],
    );
    const input = f.calls[3]?.variables["input"];
    assert.ok(input && typeof input === "object");
    assert.equal(Reflect.get(input, "sequence"), 8);
    assert.equal(Reflect.get(input, "positionMs"), 23000);
    assert.equal(f.media.paused, false);
  },
);

test(
  "anonymous and malformed profile contexts never enable saves or block media",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t, { anonymous: true });
    await f.state((state) => state.kind === "anonymous");
    f.media.currentTime = 20;
    f.media.dispatchEvent(new Event("pause"));
    await f.advance(15000);
    assert.deepEqual(
      f.calls.map((call) => call.name),
      ["Viewer"],
    );
    assert.equal(f.media.paused, false);
    const malformed = fixture(t, { badSelection: true });
    await malformed.state((state) => state.kind === "unavailable");
    assert.deepEqual(
      malformed.calls.map((call) => call.name),
      ["Viewer", "Profiles"],
    );
  },
);

test(
  "profile change discards the former generation and starts from the newly owned sequence",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    await f.state(ready);
    f.media.currentTime = 25;
    f.switchProfile();
    assert.equal(f.states.at(-1)?.kind, "checking");
    await f.state((state) => state.kind === "ready" && state.profileName === "Second");
    assert.equal(f.media.currentTime, 25);
    f.media.dispatchEvent(new Event("pause"));
    await f.advance(0);
    await f.state(saved);
    const saves = f.calls.filter((call) => call.name === "RecordProgress");
    assert.equal(saves.length, 1);
    assert.deepEqual(
      { ...(saves[0]?.variables["input"] as object), idempotencyKey: "omitted" },
      {
        profileId: id(10),
        titleId: id(2),
        playbackSessionId: id(3),
        idempotencyKey: "omitted",
        sequence: 4,
        positionMs: 25000,
        durationMs: 60000,
        occurredAt: 1000,
      },
    );
  },
);

test(
  "late old-profile reads cannot replace the new profile or attach an obsolete reporter",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const held = f.holdNext("PlayerProgress");
    await held.started;
    const oldResponse = f.profileResponse();
    const oldRequest = f.calls.at(-1);
    f.switchProfile();
    await f.state((state) => state.kind === "ready" && state.profileName === "Second");
    assert.equal(oldRequest?.init.signal?.aborted, true);
    const count = f.states.length;
    held.resolve(oldResponse);
    await held.promise;
    await Promise.resolve();
    assert.equal(f.states.length, count);
  },
);

test(
  "sign-out cancels an active save without a terminal retry or late saved announcement",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    await f.state(ready);
    const held = f.holdNext("RecordProgress");
    f.media.currentTime = 20;
    f.media.dispatchEvent(new Event("timeupdate"));
    await f.advance(15000);
    await held.started;
    const save = f.calls.at(-1);
    f.signOut();
    await f.state((state) => state.kind === "anonymous");
    const count = f.states.length;
    assert.equal(save?.init.signal?.aborted, true);
    held.resolve(Response.json({ errors: [{ message: "late response" }] }));
    await held.promise;
    await Promise.resolve();
    assert.equal(f.states.length, count);
    assert.equal(f.calls.filter((call) => call.name === "RecordProgress").length, 1);
    assert.equal(
      f.calls.some((call) => call.init.keepalive),
      false,
    );
    assert.equal(f.media.paused, false);
  },
);

test(
  "expiry removes the reporter and private generation without interrupting media",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    await f.state(ready);
    await f.advance(60000);
    await f.state((state) => state.kind === "expired");
    f.media.currentTime = 40;
    f.media.dispatchEvent(new Event("pause"));
    await f.advance(15000);
    assert.equal(
      f.calls.some((call) => call.name === "RecordProgress"),
      false,
    );
    assert.equal(f.media.paused, false);
  },
);

test(
  "pagehide attempts one terminal save and pageshow refreshes a fresh generation",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    await f.state(ready);
    f.media.currentTime = 24;
    f.page.dispatchEvent(new Event("pagehide"));
    assert.equal(f.states.at(-1)?.kind, "suspended");
    const final = f.calls.filter((call) => call.name === "RecordProgress");
    assert.equal(final.length, 1);
    assert.equal(final[0]?.init.keepalive, true);
    assert.equal(f.states.some(saved), false);
    f.page.dispatchEvent(new Event("pageshow"));
    await f.state(ready);
    assert.equal(f.calls.filter((call) => call.name === "PlayerProgress").length, 2);
    f.media.currentTime = 26;
    f.media.dispatchEvent(new Event("pause"));
    await f.advance(0);
    await f.state(saved);
    const second = f.calls.filter((call) => call.name === "RecordProgress")[1]?.variables["input"];
    assert.ok(second && typeof second === "object");
    assert.equal(Reflect.get(second, "sequence"), 9);
  },
);

test(
  "hidden visibility flushes; becoming visible rechecks authority and saved position",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    await f.state(ready);
    f.media.currentTime = 22;
    f.visibility.visibilityState = "hidden";
    f.visibility.dispatchEvent(new Event("visibilitychange"));
    await f.advance(0);
    await f.state(saved);
    f.visibility.visibilityState = "visible";
    f.visibility.dispatchEvent(new Event("visibilitychange"));
    await f.state(ready);
    assert.equal(f.calls.filter((call) => call.name === "Viewer").length, 2);
    assert.equal(f.calls.filter((call) => call.name === "PlayerProgress").length, 2);
  },
);
