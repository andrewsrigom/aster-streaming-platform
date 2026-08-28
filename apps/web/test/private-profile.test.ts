import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  attachPrivateProfile,
  type PrivateProfileView,
} from "../features/engagement/profile-context.ts";
import { WATCHLIST_MEMBERSHIP } from "../features/engagement/library-operations.ts";

const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
type Ready = Extract<PrivateProfileView, { kind: "ready" }>;
class Visibility extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}
function fixture(
  t: TestContext,
  mode: "normal" | "anonymous" | "unselected" | "malformed" = "normal",
) {
  const page = new EventTarget();
  const visibility = new Visibility();
  const changes = new EventTarget();
  const states: PrivateProfileView[] = [];
  const calls: { operation: string; signal: AbortSignal | null | undefined }[] = [];
  const waiters: {
    kind: PrivateProfileView["kind"];
    resolve: (state: PrivateProfileView) => void;
  }[] = [];
  let profileId = id(1);
  let clock = 1000000;
  let expiry: (() => void) | undefined;
  let hold: Promise<Response> | undefined;
  let entered: (() => void) | undefined;
  const controller = attachPrivateProfile({
    page,
    visibility,
    sessionChanges: changes,
    now: () => clock,
    schedule(work) {
      expiry = work;
      return () => {
        expiry = undefined;
      };
    },
    onState(state) {
      states.push(state);
      for (const waiter of waiters.splice(0)) {
        if (state.kind === waiter.kind) {
          waiter.resolve(state);
        } else {
          waiters.push(waiter);
        }
      }
    },
    fetcher(_url, init) {
      assert.ok(typeof init?.body === "string");
      const request = JSON.parse(init.body) as { operationName: string };
      calls.push({ operation: request.operationName, signal: init.signal });
      if (request.operationName === "Viewer") {
        return Promise.resolve(
          Response.json({
            data: {
              me:
                mode === "anonymous"
                  ? null
                  : {
                      accountId: id(8),
                      expiresAt: new Date(1060000).toISOString(),
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
                activeProfileId:
                  mode === "unselected" ? null : mode === "malformed" ? id(99) : profileId,
                profiles: [
                  {
                    id: profileId,
                    displayName: "Synthetic profile",
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
      assert.equal(request.operationName, "WatchlistMembership");
      if (hold) {
        entered?.();
        return hold;
      }
      return Promise.resolve(
        Response.json({ data: { profile: { id: profileId, inWatchlist: true } } }),
      );
    },
  });
  t.after(() => {
    controller.dispose();
  });
  const state = (kind: PrivateProfileView["kind"]) => {
    const last = states.at(-1);
    if (last?.kind === kind) {
      return Promise.resolve(last);
    }
    return new Promise<PrivateProfileView>((resolve) => {
      waiters.push({ kind, resolve });
    });
  };
  return {
    controller,
    visibility,
    page,
    calls,
    changes,
    states,
    state,
    async ready(): Promise<Ready> {
      const value = await state("ready");
      assert.equal(value.kind, "ready");
      return value;
    },
    switchProfile() {
      profileId = id(2);
      changes.dispatchEvent(new MessageEvent("message", { data: "changed" }));
    },
    expire() {
      clock = 1060000;
      expiry?.();
    },
    holdRead() {
      let resolve: (response: Response) => void = () => {};
      hold = new Promise<Response>((complete) => {
        resolve = complete;
      });
      const started = new Promise<void>((complete) => {
        entered = complete;
      });
      return { resolve, started };
    },
  };
}
test(
  "private library establishes only a freshly selected profile and ignores arbitrary broadcasts",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const ready = await f.ready();
    assert.equal(ready.profileId, id(1));
    assert.deepEqual(
      f.calls.map((call) => call.operation),
      ["Viewer", "Profiles"],
    );
    f.changes.dispatchEvent(new MessageEvent("message", { data: { profileId: id(99) } }));
    assert.equal(f.states.at(-1), ready);
    const result = await ready.runtime.client.query({
      query: WATCHLIST_MEMBERSHIP,
      variables: { profileId: id(1), titleId: id(5) },
    });
    assert.equal(result.data?.profile.inWatchlist, true);
  },
);
test(
  "anonymous, missing selection and malformed ownership never create a private runtime",
  { timeout: 3000 },
  async (t) => {
    for (const [mode, expected] of [
      ["anonymous", "anonymous"],
      ["unselected", "unselected"],
      ["malformed", "unavailable"],
    ] as const) {
      const f = fixture(t, mode);
      await f.state(expected);
      assert.equal(
        f.states.some((state) => state.kind === "ready"),
        false,
      );
      assert.equal(f.calls.length, mode === "anonymous" ? 1 : 2);
    }
  },
);
test(
  "profile swap cancels an old read and prevents late private cache disclosure",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const old = await f.ready();
    const held = f.holdRead();
    const pending = old.runtime.client.query({
      query: WATCHLIST_MEMBERSHIP,
      variables: { profileId: id(1), titleId: id(5) },
    });
    const rejected = assert.rejects(pending);
    await held.started;
    const request = f.calls.at(-1);
    f.switchProfile();
    assert.equal(f.states.at(-1)?.kind, "checking");
    const current = await f.ready();
    assert.equal(current.profileId, id(2));
    assert.notEqual(old.generation, current.generation);
    assert.equal(old.runtime.isDisposed(), true);
    assert.equal(request?.signal?.aborted, true);
    held.resolve(Response.json({ data: { profile: { id: id(1), inWatchlist: true } } }));
    await rejected;
    assert.deepEqual(old.runtime.client.cache.extract(), {});
    assert.deepEqual(current.runtime.client.cache.extract(), {});
  },
);
test(
  "private library invalidates on hidden/pagehide and rechecks on return",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const first = await f.ready();
    f.visibility.visibilityState = "hidden";
    f.visibility.dispatchEvent(new Event("visibilitychange"));
    assert.equal(first.runtime.isDisposed(), true);
    assert.equal(f.states.at(-1)?.kind, "suspended");
    f.visibility.visibilityState = "visible";
    f.visibility.dispatchEvent(new Event("visibilitychange"));
    const second = await f.ready();
    f.page.dispatchEvent(new Event("pagehide"));
    assert.equal(second.runtime.isDisposed(), true);
    f.page.dispatchEvent(new Event("pageshow"));
    const third = await f.ready();
    assert.notEqual(second.generation, third.generation);
    assert.equal(f.calls.filter((call) => call.operation === "Viewer").length, 3);
  },
);
test(
  "session expiry clears private data without an automatic sign-in or retry loop",
  { timeout: 3000 },
  async (t) => {
    const f = fixture(t);
    const active = await f.ready();
    f.expire();
    assert.equal(active.runtime.isDisposed(), true);
    assert.deepEqual(active.runtime.client.cache.extract(), {});
    assert.equal(f.states.at(-1)?.kind, "expired");
    assert.equal(f.calls.length, 2);
    f.controller.dispose();
    const count = f.states.length;
    f.changes.dispatchEvent(new MessageEvent("message", { data: "changed" }));
    assert.equal(f.states.length, count);
  },
);
