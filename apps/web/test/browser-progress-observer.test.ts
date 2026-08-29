import assert from "node:assert/strict";
import test from "node:test";
import { waitForGraphqlConfirmation, waitForSavedProgress } from "./support/saved-progress.ts";

type ObserverPage = Parameters<typeof waitForSavedProgress>[0];
type ObservedResponse = Parameters<Parameters<ObserverPage["on"]>[1]>[0];
const endpoint = "http://127.0.0.1:4000/graphql";
const expected = { titleId: "fictional-title", positionMs: 2000, status: "IN_PROGRESS" as const };
const response = (
  input: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" } = expected,
) => ({
  url: () => endpoint,
  ok: () => true,
  request: () => ({
    method: () => "POST",
    postDataJSON: () => ({ operationName: "RecordProgress", variables: { input } }),
  }),
});
function pageWith(candidates: ObservedResponse[]): ObserverPage {
  let active: ((response: ObservedResponse) => void) | undefined;
  return {
    on(event, listener) {
      assert.equal(event, "response");
      active = listener;
      for (const candidate of candidates) {
        if (active !== listener) {
          break;
        }
        listener(candidate);
      }
    },
    off(event, listener) {
      assert.equal(event, "response");
      if (active === listener) {
        active = undefined;
      }
    },
  };
}

test("progress observer skips unrelated requests and confirms only the sampled request", async () => {
  const unrelated = response({ ...expected, positionMs: 0 });
  const otherTitle = response({ ...expected, titleId: "another-title" });
  const otherEndpoint = { ...response(), url: () => "http://127.0.0.1:4000/health" };
  const otherOperation = {
    ...response(),
    request: () => ({ method: () => "POST", postDataJSON: () => ({ operationName: "Profiles" }) }),
  };
  const get = {
    ...response(),
    request: () => ({
      method: () => "GET",
      postDataJSON: () => {
        throw new Error("Not JSON");
      },
    }),
  };
  let confirmations = 0;
  await waitForSavedProgress(
    pageWith([unrelated, otherTitle, otherEndpoint, otherOperation, get, response()]),
    endpoint,
    expected,
    () => {
      confirmations++;
      return Promise.resolve();
    },
  );
  assert.equal(confirmations, 1);
});

test("navigation remains blocked until application confirmation", async () => {
  const confirmation = Promise.withResolvers<undefined>();
  let resolved = false;
  const saved = waitForSavedProgress(
    pageWith([response()]),
    endpoint,
    expected,
    () => confirmation.promise,
  ).then(() => {
    resolved = true;
  });
  await Promise.resolve();
  assert.equal(resolved, false);
  confirmation.resolve(undefined);
  await saved;
  assert.equal(resolved, true);
});

test("confirmation starts inside the selected response event", async () => {
  let eventActive = true;
  const page: ObserverPage = {
    on(_event, listener) {
      listener(response());
      eventActive = false;
    },
    off() {},
  };
  await waitForSavedProgress(page, endpoint, expected, () => {
    assert.equal(eventActive, true);
    return Promise.resolve();
  });
});

test("generic GraphQL observer confirms rendered profile state", async () => {
  const selected = {
    ...response(),
    request: () => ({
      method: () => "POST",
      postDataJSON: () => ({ operationName: "Profiles" }),
    }),
  };
  const value = await waitForGraphqlConfirmation(pageWith([selected]), endpoint, {
    matchesRequest: (body) =>
      (body as { operationName?: string } | null)?.operationName === "Profiles",
    confirm: () => Promise.resolve("No profiles yet"),
    successMessage: "Profiles request must succeed",
    timeoutMessage: "Timed out waiting for profiles.",
  });
  assert.equal(value, "No profiles yet");
});

test("selected confirmation remains inside the original response deadline", async () => {
  const confirmation = Promise.withResolvers<undefined>();
  const waiting = waitForGraphqlConfirmation(pageWith([response()]), endpoint, {
    matchesRequest: () => true,
    confirm: () => confirmation.promise,
    successMessage: "Selected request must succeed",
    timeoutMessage: "Selected confirmation exceeded its deadline.",
    timeoutMs: 5,
  });
  await assert.rejects(waiting, /Selected confirmation exceeded its deadline/u);
  confirmation.resolve(undefined);
});

test("matching transport and confirmation errors fail", async () => {
  await assert.rejects(
    waitForSavedProgress(pageWith([{ ...response(), ok: () => false }]), endpoint, expected, () =>
      Promise.resolve(),
    ),
    /Progress request must succeed/u,
  );
  await assert.rejects(
    waitForSavedProgress(pageWith([response()]), endpoint, expected, () =>
      Promise.reject(new Error("not durably confirmed")),
    ),
    /not durably confirmed/u,
  );
});

test("completion selects the near-end request before confirmation", async () => {
  const completed = { ...expected, positionMs: 5900, status: "COMPLETED" as const };
  let confirmed = false;
  await waitForSavedProgress(
    pageWith([response(), response(completed)]),
    endpoint,
    completed,
    () => {
      confirmed = true;
      return Promise.resolve();
    },
  );
  assert.equal(confirmed, true);
});
