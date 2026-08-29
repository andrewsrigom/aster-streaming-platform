import assert from "node:assert/strict";
import test from "node:test";
import { waitForSavedProgress } from "./support/saved-progress.ts";

type ObserverPage = Parameters<typeof waitForSavedProgress>[0];
type ObservedResponse = Parameters<Parameters<ObserverPage["on"]>[1]>[0];
const endpoint = "http://127.0.0.1:4000/graphql";
const expected = { titleId: "fictional-title", positionMs: 2000, status: "IN_PROGRESS" as const };
const acknowledgement = () => ({
  data: { recordProgress: { code: "COMPLETED", progress: { ...expected } } },
});
const response = (
  input = { ...expected },
  body: () => Promise<unknown> = () => Promise.resolve(acknowledgement()),
) => ({
  url: () => endpoint,
  ok: () => true,
  request: () => ({
    method: () => "POST",
    postDataJSON: () => ({ operationName: "RecordProgress", variables: { input } }),
  }),
  json: body,
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

test("progress observer skips unrelated bodies and synchronously selects the sampled request", async () => {
  const unavailable = () => Promise.reject(new Error("Body belongs to an earlier document"));
  const unrelated = response({ ...expected, positionMs: 0 }, unavailable);
  const otherTitle = response({ ...expected, titleId: "another-title" }, unavailable);
  const otherEndpoint = {
    ...response(undefined, unavailable),
    url: () => "http://127.0.0.1:4000/health",
  };
  const otherOperation = {
    ...response(undefined, unavailable),
    request: () => ({ method: () => "POST", postDataJSON: () => ({ operationName: "Profiles" }) }),
  };
  const get = {
    ...response(undefined, unavailable),
    request: () => ({
      method: () => "GET",
      postDataJSON: () => {
        throw new Error("Not JSON");
      },
    }),
  };
  let bodies = 0;
  await waitForSavedProgress(
    pageWith([
      unrelated,
      otherTitle,
      otherEndpoint,
      otherOperation,
      get,
      response(undefined, () => {
        bodies++;
        return Promise.resolve(acknowledgement());
      }),
    ]),
    endpoint,
    expected,
  );
  assert.equal(bodies, 1);
});

test("progress observer cannot resolve until the selected body has been consumed", async () => {
  const body = Promise.withResolvers<unknown>();
  const reading = Promise.withResolvers<undefined>();
  let resolved = false;
  const saved = waitForSavedProgress(
    pageWith([
      response(undefined, () => {
        reading.resolve(undefined);
        return body.promise;
      }),
    ]),
    endpoint,
    expected,
  ).then(() => {
    resolved = true;
  });
  await reading.promise;
  assert.equal(resolved, false, "Navigation remains blocked while the body is pending");
  body.resolve(acknowledgement());
  await saved;
  assert.equal(resolved, true);
});

test("progress observer starts the selected body read inside the response event", async () => {
  let eventActive = true;
  let bodyStarted = false;
  const selected = response(undefined, () => {
    assert.equal(eventActive, true, "Body capture started after the response event");
    bodyStarted = true;
    return Promise.resolve(acknowledgement());
  });
  const page: ObserverPage = {
    on(_event, listener) {
      listener(selected);
      eventActive = false;
    },
    off() {},
  };
  await waitForSavedProgress(page, endpoint, expected);
  assert.equal(bodyStarted, true);
});

test("matching transport and body errors fail instead of being ignored", async () => {
  await assert.rejects(
    waitForSavedProgress(pageWith([{ ...response(), ok: () => false }]), endpoint, expected),
    /Progress request must succeed/u,
  );
  await assert.rejects(
    waitForSavedProgress(
      pageWith([response(undefined, () => Promise.reject(new Error("body unavailable")))]),
      endpoint,
      expected,
    ),
    /body unavailable/u,
  );
});

test("missing, failed, wrong-title, wrong-position and wrong-status acknowledgements cannot pass", async () => {
  for (const payload of [
    null,
    {},
    { errors: [{ message: "Unavailable" }] },
    { data: { recordProgress: { code: "UNAVAILABLE" } } },
    ...[{ titleId: "another-title" }, { positionMs: 0 }, { status: "COMPLETED" }].map((change) => ({
      data: { recordProgress: { code: "COMPLETED", progress: { ...expected, ...change } } },
    })),
  ]) {
    await assert.rejects(
      waitForSavedProgress(
        pageWith([response(undefined, () => Promise.resolve(payload))]),
        endpoint,
        expected,
      ),
    );
  }
});

test("completion selects the near-end request and still requires server completion", async () => {
  const completed = { ...expected, positionMs: 5900, status: "COMPLETED" as const };
  const end = {
    ...response(),
    request: () => ({
      method: () => "POST",
      postDataJSON: () => ({ operationName: "RecordProgress", variables: { input: completed } }),
    }),
    json: () =>
      Promise.resolve({
        data: {
          recordProgress: { code: "COMPLETED", progress: { ...completed, positionMs: 6000 } },
        },
      }),
  };
  await waitForSavedProgress(pageWith([response(), end]), endpoint, completed);
});
