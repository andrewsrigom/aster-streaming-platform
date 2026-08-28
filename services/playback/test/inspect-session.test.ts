import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackSessionInspector,
  type PlaybackSessionReadPort,
} from "../src/application/inspect-session.js";
import { createPostgresPlaybackSessionReader } from "../src/infrastructure/postgres-session-read.js";
import type { AsterPostgresAdapter } from "@aster/postgres";

const id = "00000000-0000-4000-8000-000000000001";
const title = "00000000-0000-4000-8000-000000000002";
const row = { sessionId: id, titleId: title, createdAt: 100, expiresAt: 1000 };
const signal = () => new AbortController().signal;
test("session inspection returns only current title-bound authority, never a media URL", async () => {
  const store: PlaybackSessionReadPort = {
    read: (sessionId, titleId, requestSignal) => {
      assert.equal(sessionId, id);
      assert.equal(titleId, title);
      assert.ok(requestSignal instanceof AbortSignal);
      return Promise.resolve({ status: "completed", value: row });
    },
  };
  const inspector = createPlaybackSessionInspector(store, () => 101);
  assert.deepEqual(await inspector.inspect(id, title, signal()), {
    status: "completed",
    value: { ...row, checkedAt: 101 },
  });
  assert.equal((await inspector.inspect("invalid", title, signal())).status, "invalid_input");
  assert.equal((await inspector.inspect(id, title, AbortSignal.abort())).status, "cancelled");
});
test("expired, substituted and hostile stored contexts fail closed without getters", async () => {
  let getters = 0;
  for (const value of [
    null,
    { ...row, expiresAt: 101 },
    { ...row, titleId: id },
    { ...row, createdAt: 102 },
    { ...row, expiresAt: "1000" },
    { ...row, manifestUrl: "https://example.invalid" },
    {
      ...row,
      get createdAt() {
        getters++;
        return 100;
      },
    },
  ]) {
    const inspector = createPlaybackSessionInspector(
      { read: () => Promise.resolve({ status: "completed", value }) },
      () => 101,
    );
    const result = await inspector.inspect(id, title, signal());
    assert.ok(result.status === "unavailable" || result.status === "not_playable");
  }
  assert.equal(getters, 0);
});
test("PostgreSQL read is bounded, title-scoped, media-free and never commits", async () => {
  const database: Pick<AsterPostgresAdapter, "transaction"> = {
    async transaction(work, requestSignal) {
      assert.ok(requestSignal instanceof AbortSignal);
      const result = await work({
        query: (query) => {
          assert.deepEqual(query.values, [id, title]);
          assert.match(query.text, /id = \$1::uuid AND title_id = \$2::uuid/u);
          assert.doesNotMatch(query.text, /manifest_url|catalog\.|identity\.|engagement\./u);
          return Promise.resolve({ rowCount: 1, rows: [row] });
        },
      });
      assert.equal(result.action, "rollback");
      return { status: "rolled_back", value: result.value };
    },
  };
  assert.deepEqual(await createPostgresPlaybackSessionReader(database).read(id, title, signal()), {
    status: "completed",
    value: row,
  });
});
