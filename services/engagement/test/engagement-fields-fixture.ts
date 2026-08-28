import type {
  EngagementFieldPorts,
  EngagementFieldRow,
} from "../src/application/read-engagement-fields.js";
import { createEngagementFieldQueries } from "../src/application/read-engagement-fields.js";
import type { ProgressRequest } from "../src/application/progress-ports.js";
import type { ProgressState } from "../src/domain/progress.js";
import { createEngagementFieldLoaders } from "../src/transport/engagement-field-loaders.js";
import { createEngagementGraphqlContext } from "../src/transport/engagement-schema.js";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const pair = (title = 3, profile = 2) => ({ profileId: id(profile), titleId: id(title) });
export const progressState = (patch: Partial<ProgressState> = {}): ProgressState => ({
  id: id(10),
  accountId: id(1),
  profileId: id(2),
  titleId: id(3),
  playbackSessionId: id(4),
  sequence: 1,
  version: 1,
  positionMs: 1000,
  durationMs: 6000,
  status: "IN_PROGRESS",
  occurredAt: 100,
  updatedAt: 100,
  ...patch,
});

export function fieldsFixture() {
  let clock = 100;
  const controller = new AbortController();
  const hidden = new Set<string>();
  const missing = new Set<string>();
  const absent = new Set<string>();
  const denied = new Set<string>();
  const deleted = new Set<string>();
  const calls = {
    owners: [] as string[],
    credentials: [] as string[],
    sql: [] as unknown[][],
    catalog: [] as string[][],
  };
  const control = {
    credential: "synthetic-fields",
    catalogDown: false,
    afterStore: (): void => undefined,
    afterCatalog: (): void => undefined,
    rows: (rows: EngagementFieldRow[]) => rows,
  };
  const request: ProgressRequest = {
    credential: "synthetic-fields",
    correlationId: id(999),
    signal: controller.signal,
  };
  const ports: EngagementFieldPorts = {
    now: () => clock,
    identity: {
      authorizeProfile: (credential, profileId) => {
        calls.owners.push(profileId);
        calls.credentials.push(credential);
        return Promise.resolve(
          denied.has(profileId) || credential !== control.credential
            ? { status: "not_found" }
            : {
                status: "completed",
                value: { accountId: id(1), profileId, checkedAt: clock, expiresAt: clock + 300 },
              },
        );
      },
    },
    catalog: {
      visibility: (ids) => {
        calls.catalog.push([...ids]);
        const value = {
          checkedAt: clock,
          expiresAt: clock + 2,
          titles: ids.map((titleId) => ({ titleId, visible: !hidden.has(titleId) })),
        };
        control.afterCatalog();
        return Promise.resolve(
          control.catalogDown ? { status: "unavailable" } : { status: "completed", value },
        );
      },
    },
    store: {
      read: (keys) => {
        calls.sql.push([...keys]);
        const rows = keys.map((key) => ({
          ...key,
          deleted: deleted.has(key.profileId),
          progress: missing.has(key.titleId) ? null : progressState(key),
          inWatchlist: !absent.has(key.titleId),
        }));
        control.afterStore();
        return Promise.resolve({ status: "completed", value: control.rows(rows) });
      },
    },
  };
  const queries = createEngagementFieldQueries(ports);
  return {
    ports,
    request,
    controller,
    calls,
    hidden,
    missing,
    absent,
    denied,
    deleted,
    control,
    queries,
    loaders: () => createEngagementFieldLoaders(queries, request),
    context: (input: ProgressRequest = request) =>
      createEngagementGraphqlContext(
        { record: () => Promise.resolve({ status: "unavailable" }) },
        input.signal,
        input.correlationId,
        typeof input.credential === "string" ? input.credential : undefined,
        input.traceparent,
        undefined,
        undefined,
        queries,
      ),
    setTime: (value: number) => {
      clock = value;
    },
  };
}
