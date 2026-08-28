import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogMediaRequests } from "../src/application/request-media.js";
import type { CatalogMediaUnitOfWork } from "../src/application/media-ports.js";
import {
  MEDIA_RECIPE_VERSION,
  MAX_MEDIA_SOURCE_BYTES,
  normalizeMediaRequestInput,
  type CatalogMediaRequest,
} from "../src/domain/media-request.js";
import { catalogTestId as id, catalogTestTime as now } from "./rights-fixture.js";
import { hash, metadataFixture, rightsFacts, workflowFixture } from "./workflow-fixture.js";

const mediaInput = () => ({
  requestId: id(800),
  titleId: id(1),
  expectedVersion: 3,
  rightsRevision: 2,
  recipeVersion: MEDIA_RECIPE_VERSION,
  source: {
    url: "https://example.invalid/source.mp4",
    bytes: 1000,
    etag: '"source-v1"',
    sha256: "a".repeat(64),
    container: "mp4",
  },
});

async function fixture(validUntil: number | null = null) {
  const f = workflowFixture();
  assert.equal(
    (
      await f.commands.execute(
        "create",
        {
          titleId: id(1),
          expectedVersion: 0,
          mutationId: id(10),
          metadata: metadataFixture(),
          rights: rightsFacts({ validUntil }),
        },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(
    (
      await f.commands.execute(
        "review",
        {
          titleId: id(1),
          expectedVersion: 2,
          mutationId: id(11),
          decision: "approve",
          reason: "Synthetic review",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  let stored: CatalogMediaRequest[] = [];
  let time = now;
  let afterInsert = (): void => undefined;
  const transactions: CatalogMediaUnitOfWork = {
    async run(work, signal) {
      const draft = structuredClone(stored);
      const outcome = await f.transactions.run(
        (tx) =>
          work({
            ...tx,
            findMediaRequest: (requestId) =>
              Promise.resolve(draft.find((record) => record.input.requestId === requestId)),
            findMediaFingerprint: (titleId, fingerprint) =>
              Promise.resolve(
                draft.find(
                  (record) =>
                    record.input.titleId === titleId && record.sourceFingerprint === fingerprint,
                ),
              ),
            countMediaRequests: (titleId) =>
              Promise.resolve(draft.filter((record) => record.input.titleId === titleId).length),
            insertMediaRequest(record) {
              draft.push(record);
              afterInsert();
              return Promise.resolve(true);
            },
          }),
        signal,
      );
      if (outcome.status === "completed") {
        stored = draft;
      }
      return outcome;
    },
  };
  const media = createCatalogMediaRequests({
    authority: f.operator.authority,
    transactions,
    now: () => time,
    policy: { commercial: true },
    digest: hash,
  });
  return {
    ...f,
    media,
    stored: () => stored,
    setTime(value: number) {
      time = value;
      f.setTime(value);
    },
    afterInsert(hook: () => void) {
      afterInsert = hook;
    },
  };
}

test("media request schema rejects unstable identity, unbounded input and injected controls", () => {
  assert.ok(normalizeMediaRequestInput(mediaInput()));
  for (const patch of [
    { bytes: 0 },
    { bytes: 1.5 },
    { bytes: MAX_MEDIA_SOURCE_BYTES + 1 },
    { etag: 'W/"weak"' },
    { etag: "*" },
    { etag: '""' },
    { etag: '"bad\r\nheader"' },
    { etag: '"' + "a".repeat(127) + '"' },
    { sha256: "unknown" },
    { url: "http://example.invalid/source.mp4" },
    { url: "https://user:password@example.invalid/source.mp4" },
    { url: "https://example.invalid/source.mp4?token=secret" },
    { container: "exe" },
    { path: "/etc/passwd" },
  ]) {
    assert.equal(
      normalizeMediaRequestInput({ ...mediaInput(), source: { ...mediaInput().source, ...patch } }),
      undefined,
    );
  }
  for (const patch of [
    { recipeVersion: "arbitrary" },
    { validated: true },
    { ffmpegArguments: ["-i", "http://internal"] },
    { expectedVersion: 0 },
    { rightsRevision: null },
    { requestId: "invalid" },
  ]) {
    assert.equal(normalizeMediaRequestInput({ ...mediaInput(), ...patch }), undefined);
  }
  const malicious = { ...mediaInput() };
  Object.defineProperty(malicious, "source", {
    get() {
      assert.fail("Input accessor executed");
    },
  });
  assert.equal(normalizeMediaRequestInput(malicious), undefined);
});

test("authorized request retains exact audit and replays without advancing editorial state", async () => {
  const f = await fixture();
  const before = structuredClone(f.state());
  const accepted = await f.media.request(mediaInput(), f.request);
  assert.equal(accepted.status, "completed");
  assert.equal(accepted.value.actorId, id(3));
  assert.equal(accepted.value.requestedAt, now);
  assert.equal(accepted.value.correlationId, f.request.correlationId);
  assert.deepEqual(
    await f.media.request(mediaInput(), { ...f.request, correlationId: id(9) }),
    accepted,
  );
  assert.deepEqual(f.state(), before);
  assert.equal(f.stored().length, 1);
  const title = f.state().titles.get(id(1));
  assert.ok(title);
  f.state().titles.set(title.id, { ...title, version: 4 });
  assert.deepEqual(await f.media.request(mediaInput(), f.request), accepted);
});

test("unauthorized, cancelled and malformed requests do not enter a transaction", async () => {
  const f = await fixture();
  const calls = f.runs();
  for (const credential of [undefined, {}, { role: "operator" }, { role: "viewer" }]) {
    assert.equal(
      (await f.media.request(mediaInput(), { ...f.request, credential })).status,
      "unauthorized",
    );
  }
  assert.equal(
    (await f.media.request({ ...mediaInput(), expectedVersion: 0 }, f.request)).status,
    "invalid_input",
  );
  assert.equal(
    (await f.media.request(mediaInput(), { ...f.request, correlationId: "bad" })).status,
    "invalid_input",
  );
  f.controller.abort();
  assert.equal((await f.media.request(mediaInput(), f.request)).status, "cancelled");
  assert.equal(f.runs(), calls);
  assert.equal(f.stored().length, 0);
});

test("request refuses stale, unapproved, foreign and changed source facts", async () => {
  const f = await fixture();
  for (const patch of [
    { rightsRevision: 1 },
    { source: { ...mediaInput().source, url: "https://example.invalid/other.mp4" } },
    { source: { ...mediaInput().source, sha256: null } },
    { source: { ...mediaInput().source, sha256: "b".repeat(64) } },
  ]) {
    assert.equal(
      (await f.media.request({ ...mediaInput(), ...patch }, f.request)).status,
      "rights_not_approved",
    );
  }
  assert.equal(
    (await f.media.request({ ...mediaInput(), expectedVersion: 2 }, f.request)).status,
    "conflict",
  );
  assert.equal(
    (await f.media.request({ ...mediaInput(), titleId: id(99) }, f.request)).status,
    "not_found",
  );
  const title = f.state().titles.get(id(1));
  assert.ok(title);
  f.state().titles.set(title.id, { ...title, latestRightsRevision: 3 });
  assert.equal((await f.media.request(mediaInput(), f.request)).status, "rights_not_approved");
  f.state().titles.set(title.id, title);
  assert.equal(
    (
      await f.commands.execute(
        "dispute",
        { titleId: id(1), expectedVersion: 3, mutationId: id(12), reason: "Synthetic dispute" },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal((await f.media.request(mediaInput(), f.request)).status, "rights_not_approved");
  assert.equal(f.stored().length, 0);
});

test("null rights checksum may be acquired later but never skips current approval", async () => {
  const f = await fixture();
  const review = f.state().rights.at(-1);
  assert.ok(review);
  f.state().rights[f.state().rights.length - 1] = {
    ...review,
    record: { ...review.record, sourceChecksum: null },
  };
  assert.equal(
    (
      await f.media.request(
        { ...mediaInput(), source: { ...mediaInput().source, sha256: null } },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal(f.stored()[0]?.input.source.sha256, null);
});

test("changed replay, duplicate identity and bounded capacity cannot create duplicate jobs", async () => {
  const f = await fixture();
  assert.equal((await f.media.request(mediaInput(), f.request)).status, "completed");
  assert.equal(
    (
      await f.media.request(
        { ...mediaInput(), source: { ...mediaInput().source, etag: '"changed"' } },
        f.request,
      )
    ).status,
    "conflict",
  );
  assert.equal(
    (await f.media.request({ ...mediaInput(), requestId: id(801) }, f.request)).status,
    "conflict",
  );
  for (let n = 1; n < 16; n++) {
    assert.equal(
      (
        await f.media.request(
          {
            ...mediaInput(),
            requestId: id(800 + n),
            source: { ...mediaInput().source, etag: '"source-' + String(n) + '"' },
          },
          f.request,
        )
      ).status,
      "completed",
    );
  }
  assert.equal(
    (
      await f.media.request(
        {
          ...mediaInput(),
          requestId: id(900),
          source: { ...mediaInput().source, etag: '"overflow"' },
        },
        f.request,
      )
    ).status,
    "backpressure",
  );
  assert.equal((await f.media.request(mediaInput(), f.request)).status, "completed");
  assert.equal(f.stored().length, 16);
  assert.equal(
    (
      await f.commands.execute(
        "retire",
        {
          titleId: id(1),
          expectedVersion: 3,
          mutationId: id(12),
          reason: "Capacity must not block retirement",
        },
        f.request,
      )
    ).status,
    "completed",
  );
  assert.equal((await f.media.request(mediaInput(), f.request)).status, "rights_not_approved");
});

test("expiry, revocation, cancellation and failure after insertion roll back intent", async () => {
  for (const mode of ["rights-expiry", "authority-expiry", "revoke", "cancel", "throw"] as const) {
    const f = await fixture(mode === "rights-expiry" ? now + 1 : null);
    f.afterInsert(() => {
      if (mode === "rights-expiry") {
        f.setTime(now + 1);
      }
      if (mode === "authority-expiry") {
        f.setTime(now + 3601);
      }
      if (mode === "revoke") {
        f.operator.revoke();
      }
      if (mode === "cancel") {
        f.controller.abort();
      }
      if (mode === "throw") {
        throw new Error("Injected persistence failure");
      }
    });
    assert.equal(
      (await f.media.request(mediaInput(), f.request)).status,
      mode === "rights-expiry"
        ? "rights_not_approved"
        : mode === "cancel"
          ? "cancelled"
          : mode === "throw"
            ? "unavailable"
            : "unauthorized",
    );
    assert.equal(f.stored().length, 0);
    assert.equal(f.state().titles.get(id(1))?.version, 3);
  }
});
