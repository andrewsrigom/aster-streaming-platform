import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createWatchlistWriter } from "../src/application/set-watchlist.js";
import { createWatchlistQueries } from "../src/application/read-watchlist.js";
import type { WatchlistPorts, WatchlistReceipt } from "../src/application/watchlist-ports.js";
import type { ProgressRequest } from "../src/application/progress-ports.js";
import type {
  WatchlistChange,
  WatchlistChangedEvent,
  WatchlistEntry,
  WatchlistInput,
} from "../src/domain/watchlist.js";

export const watchlistId = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export const watchlistInput = (patch: Partial<WatchlistInput> = {}): WatchlistInput => ({
  profileId: watchlistId(2),
  titleId: watchlistId(3),
  idempotencyKey: watchlistId(4),
  present: true,
  ...patch,
});
export const watchlistEntry = (n: number, patch: Partial<WatchlistEntry> = {}): WatchlistEntry => ({
  id: watchlistId(n),
  accountId: watchlistId(1),
  profileId: watchlistId(2),
  titleId: watchlistId(n + 1000),
  addedAt: 100,
  ...patch,
});

export function watchlistFixture() {
  let now = 100;
  let nextId = 10_000;
  let inTransaction = false;
  let head: WatchlistChange | null = null;
  let receipts: WatchlistReceipt[] = [];
  let events: WatchlistChangedEvent[] = [];
  let entries: WatchlistEntry[] = [];
  const calls = { identity: 0, receipt: 0, catalog: [] as string[][], transaction: 0, page: 0 };
  const control = {
    deleted: false,
    indeterminate: false,
    counts: { receipts: 0, outbox: 0 },
    afterSave: (): void => undefined,
  };
  const authority = {
    accountId: watchlistId(1),
    profileId: watchlistId(2),
    checkedAt: 100,
    expiresAt: 900,
  };
  const retired = new Set<string>();
  const controller = new AbortController();
  const request: ProgressRequest = {
    credential: "synthetic-watchlist",
    correlationId: watchlistId(9),
    signal: controller.signal,
  };
  const ports: WatchlistPorts = {
    now: () => now,
    nextId: () => watchlistId(nextId++),
    digest: (payload) => createHash("sha256").update(payload).digest("hex"),
    identity: {
      authorizeProfile: () => {
        assert.equal(inTransaction, false);
        calls.identity++;
        return Promise.resolve({ status: "completed", value: authority });
      },
    },
    catalog: {
      visibility: (ids, request) => {
        assert.equal(inTransaction, false);
        assert.equal("credential" in request, false);
        assert.equal(ids.length <= 20, true);
        calls.catalog.push([...ids]);
        return Promise.resolve({
          status: "completed",
          value: {
            checkedAt: now,
            expiresAt: now + 2,
            titles: ids.map((titleId) => ({ titleId, visible: !retired.has(titleId) })),
          },
        });
      },
    },
    store: {
      receipt: (_owner, key) => {
        calls.receipt++;
        return Promise.resolve({
          status: "completed",
          value: receipts.find((row) => row.idempotencyKey === key) ?? null,
        });
      },
      candidates: () => {
        calls.page++;
        return Promise.resolve({ status: "completed", value: entries });
      },
      run: async (work) => {
        calls.transaction++;
        inTransaction = true;
        let draftHead = head;
        let draftReceipts = [...receipts];
        const draftEvents = [...events];
        let draftEntries = [...entries];
        try {
          const result = await work({
            lock: () => Promise.resolve({ deleted: control.deleted, current: draftHead }),
            pruneReceipts: (_owner, now) => {
              draftReceipts = draftReceipts.filter((row) => row.expiresAt > now);
              return Promise.resolve();
            },
            receipt: (_owner, key) =>
              Promise.resolve(draftReceipts.find((row) => row.idempotencyKey === key) ?? null),
            counts: () => Promise.resolve(control.counts),
            save: (change, _authority, entryId) => {
              draftHead = change;
              if (!change.present) {
                draftEntries = draftEntries.filter((row) => row.titleId !== change.titleId);
              } else if (!draftEntries.some((row) => row.titleId === change.titleId)) {
                draftEntries.push({
                  id: entryId,
                  accountId: change.accountId,
                  profileId: change.profileId,
                  titleId: change.titleId,
                  addedAt: change.updatedAt,
                });
              }
              control.afterSave();
              return Promise.resolve();
            },
            writeReceipt: (receipt) => {
              draftReceipts.push(receipt);
              return Promise.resolve();
            },
            appendOutbox: (event) => {
              draftEvents.push(event);
              return Promise.resolve();
            },
          });
          if (result.status === "completed") {
            head = draftHead;
            receipts = draftReceipts;
            events = draftEvents;
            entries = draftEntries;
            if (control.indeterminate) {
              return { status: "indeterminate" };
            }
          }
          return result;
        } finally {
          inTransaction = false;
        }
      },
    },
  };
  return {
    ports,
    request,
    calls,
    authority,
    controller,
    retired,
    control,
    writer: createWatchlistWriter(ports),
    queries: createWatchlistQueries(ports),
    state: () => ({ head, receipts, events, entries }),
    setTime: (value: number) => {
      now = value;
    },
    setEntries: (value: WatchlistEntry[]) => {
      entries = value;
    },
    setHead: (value: WatchlistChange | null) => {
      head = value;
    },
  };
}
