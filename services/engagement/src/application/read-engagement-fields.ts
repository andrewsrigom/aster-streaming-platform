import {
  engagementPairKey,
  normalizeEngagementPair,
  type EngagementPair,
} from "../domain/engagement-fields.js";
import {
  normalizeProgressState,
  progressIdentifier,
  type ProgressState,
} from "../domain/progress.js";
import { validProgressEventContext } from "../domain/progress-event.js";
import type { ProgressReadResult } from "./read-progress.js";
import type { ProgressPorts, ProgressCatalog, ProgressRequest } from "./progress-ports.js";
import {
  authorizeWatchlist as authorizeProfile,
  freshWatchlistAuthority as freshAuthority,
  readWatchlistVisibility as readVisibility,
  watchlistGuarded as guarded,
} from "./watchlist-request.js";
import type { CatalogVisibility } from "./watchlist-ports.js";

interface Authority {
  readonly accountId: string;
  readonly profileId: string;
  readonly checkedAt: number;
  readonly expiresAt: number;
}
export interface EngagementFieldRow extends EngagementPair {
  readonly accountId: string;
  readonly deleted: boolean;
  readonly progress: ProgressState | null;
  readonly inWatchlist: boolean;
}
export interface EngagementFieldSnapshot {
  readonly progress: ProgressState | null;
  readonly inWatchlist: boolean;
  readonly authority: Authority;
}
export interface EngagementFieldStore {
  read(
    keys: readonly (EngagementPair & Readonly<{ accountId: string }>)[],
    signal: AbortSignal,
  ): Promise<ProgressReadResult<readonly EngagementFieldRow[]>>;
}
export interface EngagementFieldPorts {
  readonly identity: ProgressPorts["identity"];
  readonly catalog: ProgressCatalog;
  readonly store: EngagementFieldStore;
  readonly now: () => number;
}
type FieldResult = ProgressReadResult<EngagementFieldSnapshot>;

export function createEngagementFieldQueries(ports: EngagementFieldPorts) {
  return Object.freeze({
    scope(request: ProgressRequest) {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2500)]);
      const scoped = { ...request, signal };
      const owners = new Map<string, Promise<ProgressReadResult<Authority>>>();
      let activeOwners = 0;
      const fresh = (value: Readonly<{ checkedAt: number; expiresAt: number }>) =>
        !signal.aborted && freshAuthority(value.checkedAt, value.expiresAt, ports.now());
      const failure = (): Readonly<{ status: "cancelled" | "unavailable" }> => ({
        status: request.signal.aborted ? "cancelled" : "unavailable",
      });
      const authorize = (profileId: string): Promise<ProgressReadResult<Authority>> => {
        const cached = owners.get(profileId);
        if (cached) {
          return cached;
        }
        if (owners.size >= 5 || activeOwners >= 2) {
          return Promise.resolve({ status: "unavailable" });
        }
        activeOwners++;
        const pending = authorizeProfile(ports, profileId, scoped)
          .then((result): ProgressReadResult<Authority> => {
            if (result.status === "completed") {
              return result;
            }
            return {
              status:
                result.status === "not_found" || result.status === "unauthenticated"
                  ? result.status
                  : "unavailable",
            };
          })
          .catch((): ProgressReadResult<Authority> => failure())
          .finally(() => {
            activeOwners--;
          });
        owners.set(profileId, pending);
        return pending;
      };
      return Object.freeze({
        fresh,
        async read(keys: readonly EngagementPair[]): Promise<readonly FieldResult[]> {
          const reject = (status: "invalid_input" | "unavailable" | "cancelled") =>
            keys.map((): FieldResult => ({ status }));
          if (
            keys.length < 1 ||
            keys.length > 20 ||
            keys.some((key) => !normalizeEngagementPair(key)) ||
            new Set(keys.map(engagementPairKey)).size !== keys.length ||
            new Set([...owners.keys(), ...keys.map((key) => key.profileId)]).size > 5 ||
            !validProgressEventContext({
              correlationId: request.correlationId,
              causationId: request.correlationId,
              ...(request.traceparent === undefined ? {} : { traceparent: request.traceparent }),
            })
          ) {
            return reject("invalid_input");
          }
          try {
            signal.throwIfAborted();
            const profiles = [...new Set(keys.map((key) => key.profileId))];
            for (let offset = 0; offset < profiles.length; offset += 2) {
              await Promise.all(profiles.slice(offset, offset + 2).map(authorize));
            }
            const authorities = new Map<string, Authority>();
            const denied = new Map<string, FieldResult>();
            for (const profile of profiles) {
              const owner = await owners.get(profile);
              if (!owner || owner.status !== "completed") {
                denied.set(profile, owner ?? failure());
              } else if (!fresh(owner.value)) {
                denied.set(profile, failure());
              } else {
                authorities.set(profile, owner.value);
              }
            }
            if (new Set([...authorities.values()].map((owner) => owner.accountId)).size > 1) {
              return reject("unavailable");
            }
            const ownedKeys = keys.flatMap((key) => {
              const owner = authorities.get(key.profileId);
              return owner ? [{ ...key, accountId: owner.accountId }] : [];
            });
            if (ownedKeys.length === 0) {
              return keys.map((key) => denied.get(key.profileId) ?? failure());
            }
            const result = await guarded(() => ports.store.read(ownedKeys, signal), signal);
            signal.throwIfAborted();
            if (result.status !== "completed") {
              return reject("unavailable");
            }
            const storedRows = result.value;
            if (!Array.isArray(result.value) || result.value.length !== ownedKeys.length) {
              return reject("unavailable");
            }
            const rows = new Map<string, FieldResult>();
            for (const [index, row] of storedRows.entries()) {
              const key = ownedKeys[index];
              const owner = key ? authorities.get(key.profileId) : undefined;
              const progress = row.progress === null ? null : normalizeProgressState(row.progress);
              if (
                !key ||
                !owner ||
                !fresh(owner) ||
                row.accountId !== key.accountId ||
                row.profileId !== key.profileId ||
                row.titleId !== key.titleId ||
                typeof row.deleted !== "boolean" ||
                typeof row.inWatchlist !== "boolean" ||
                progress === undefined ||
                (progress &&
                  (progress.accountId !== key.accountId ||
                    progress.profileId !== key.profileId ||
                    progress.titleId !== key.titleId ||
                    progress.updatedAt > ports.now()))
              ) {
                return reject("unavailable");
              }
              rows.set(
                engagementPairKey(key),
                row.deleted
                  ? { status: "not_found" }
                  : {
                      status: "completed",
                      value: Object.freeze({
                        progress,
                        inWatchlist: row.inWatchlist,
                        authority: owner,
                      }),
                    },
              );
            }
            return keys.map(
              (key) => denied.get(key.profileId) ?? rows.get(engagementPairKey(key)) ?? failure(),
            );
          } catch {
            return reject(request.signal.aborted ? "cancelled" : "unavailable");
          }
        },
        async visibility(
          ids: readonly string[],
        ): Promise<ProgressReadResult<readonly CatalogVisibility[]>> {
          if (
            ids.length < 1 ||
            ids.length > 20 ||
            new Set(ids).size !== ids.length ||
            ids.some((titleId) => !progressIdentifier(titleId))
          ) {
            return { status: "invalid_input" };
          }
          try {
            const result = await readVisibility(ports, ids, scoped);
            return result.status === "completed" ? result : { status: "unavailable" };
          } catch {
            return { status: request.signal.aborted ? "cancelled" : "unavailable" };
          }
        },
      });
    },
  });
}
