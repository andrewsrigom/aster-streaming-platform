import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { readGraphqlResponse } from "../../lib/apollo/response.ts";
import { projectSelectedData } from "../../lib/apollo/public-snapshot.ts";
import { apolloOperationBody } from "../../lib/apollo/trusted-operation.ts";
import { HOME_PERSONALIZED, readHomeContinueWatching } from "../discovery/operations.ts";
import { playerIdentifier } from "../playback/operations.ts";
import {
  PLAYER_PROGRESS,
  RECORD_PROGRESS,
  readPlayerProgress,
  readProgressCommand,
  readProgressOutcome,
} from "./operations.ts";
import type { ProgressCommand } from "./progress-reporter.ts";
import {
  libraryOperations,
  readLibraryPage,
  readLibraryVariables,
  SET_WATCHLIST,
  WATCHLIST_MEMBERSHIP,
  readWatchlistCommand,
  readWatchlistMembership,
  readWatchlistOutcome,
  type LibraryKind,
} from "./library-operations.ts";

export function createEngagementClient(
  scope: Readonly<{ profileId: string; expiresAt: number }>,
  fetcher: typeof fetch = globalThis.fetch,
  now: () => number = Date.now,
) {
  if (!playerIdentifier(scope.profileId) || !Number.isSafeInteger(scope.expiresAt)) {
    throw new Error("Invalid engagement scope.");
  }
  const profileId = scope.profileId;
  const expiresAt = scope.expiresAt;
  const lifetime = new AbortController();
  const terminalLifetime = new AbortController();
  let active = 0;
  let terminalUsed = false;
  const assertFresh = () => {
    lifetime.signal.throwIfAborted();
    if (now() >= expiresAt) {
      dispose();
      throw new Error("Refresh the session before saving progress.");
    }
  };
  const request = (body: string) => {
    if (body.length > 4096) {
      throw new Error("Engagement request exceeded its limit.");
    }
    const parsed = JSON.parse(body) as {
      operationName?: unknown;
      variables?: {
        profileId?: unknown;
        titleId?: unknown;
        input?: unknown;
        first?: unknown;
        after?: unknown;
        locale?: unknown;
      };
    } | null;
    const variables = parsed?.variables;
    if (parsed?.operationName === "SetWatchlist") {
      return {
        operationName: "SetWatchlist" as const,
        kind: "watchlist-change" as const,
        query: apolloOperationBody(SET_WATCHLIST),
        variables: { input: readWatchlistCommand(variables?.input, profileId) },
      };
    }
    for (const kind of Object.keys(libraryOperations) as LibraryKind[]) {
      const known = libraryOperations[kind];
      if (parsed?.operationName === known.name) {
        return {
          operationName: known.name,
          kind: "library" as const,
          libraryKind: kind,
          query: apolloOperationBody(known.document),
          variables: readLibraryVariables(variables, profileId),
        };
      }
    }
    if (
      parsed?.operationName === "WatchlistMembership" &&
      variables?.profileId === profileId &&
      playerIdentifier(variables.titleId)
    ) {
      return {
        operationName: "WatchlistMembership" as const,
        kind: "membership" as const,
        query: apolloOperationBody(WATCHLIST_MEMBERSHIP),
        variables: { profileId, titleId: variables.titleId },
      };
    }
    if (
      parsed?.operationName === "HomePersonalized" &&
      variables?.profileId === profileId &&
      variables.first === 10 &&
      (variables.locale === "en" || variables.locale === "pt-BR")
    ) {
      return {
        operationName: "HomePersonalized" as const,
        kind: "home" as const,
        query: apolloOperationBody(HOME_PERSONALIZED),
        variables: { profileId, first: 10 as const, locale: variables.locale },
      };
    }
    if (parsed?.operationName === "RecordProgress") {
      return {
        operationName: "RecordProgress" as const,
        kind: "progress-change" as const,
        query: apolloOperationBody(RECORD_PROGRESS),
        variables: { input: readProgressCommand(variables?.input, profileId) },
      };
    }
    if (
      parsed?.operationName === "PlayerProgress" &&
      variables?.profileId === profileId &&
      playerIdentifier(variables.titleId)
    ) {
      return {
        operationName: "PlayerProgress" as const,
        kind: "progress" as const,
        query: apolloOperationBody(PLAYER_PROGRESS),
        variables: { profileId, titleId: variables.titleId },
      };
    }
    throw new Error("Unknown engagement request.");
  };
  const serialize = (operation: ReturnType<typeof request>) =>
    JSON.stringify({
      operationName: operation.operationName,
      query: operation.query,
      variables: operation.variables,
    });
  const send = (body: string, signal: AbortSignal, keepalive = false) =>
    fetcher("http://127.0.0.1:4000/graphql", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: { "content-type": "application/json", "x-aster-csrf": "1" },
      signal,
      body,
      keepalive,
    });
  const transport: typeof fetch = async (_input, init) => {
    assertFresh();
    if (active >= 2 || typeof init?.body !== "string" || terminalUsed) {
      throw new Error("Engagement is unavailable.");
    }
    const operation = request(init.body);
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(4000),
      ...(init.signal ? [init.signal] : []),
    ]);
    active++;
    try {
      const response = await send(serialize(operation), signal);
      const body = await readGraphqlResponse(response, signal);
      signal.throwIfAborted();
      assertFresh();
      const data = body["data"];
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        ("errors" in body && operation.kind !== "home")
      ) {
        throw new Error("Invalid engagement response.");
      }
      const fields = data as Record<string, unknown>;
      if (operation.kind === "home") {
        const selected = projectSelectedData(fields, HOME_PERSONALIZED) as Record<string, unknown>;
        return Response.json({
          data: {
            ...selected,
            homeContinueWatching: readHomeContinueWatching(selected["homeContinueWatching"]),
          },
        });
      }
      if (operation.kind === "library") {
        const field = libraryOperations[operation.libraryKind].field;
        return Response.json({
          data: {
            [field]: readLibraryPage(fields[field], operation.variables, operation.libraryKind),
          },
        });
      }
      if (operation.kind === "watchlist-change") {
        return Response.json({
          data: {
            setWatchlist: readWatchlistOutcome(fields["setWatchlist"], operation.variables.input),
          },
        });
      }
      if (operation.kind === "progress-change") {
        return Response.json({
          data: {
            recordProgress: readProgressOutcome(
              fields["recordProgress"],
              operation.variables.input,
            ),
          },
        });
      }
      if (operation.kind === "membership") {
        return Response.json({
          data: { profile: readWatchlistMembership(fields["profile"], operation.variables) },
        });
      }
      return Response.json({
        data: { profile: readPlayerProgress(fields["profile"], operation.variables) },
      });
    } catch {
      throw new Error("Engagement could not be confirmed. Refresh before continuing.");
    } finally {
      active--;
    }
  };
  const cache = new InMemoryCache({
    typePolicies: {
      Profile: { keyFields: false },
      Progress: { keyFields: false },
      Title: { keyFields: false },
      WatchlistEntry: { keyFields: false },
      Query: {
        fields: {
          profile: { merge: false },
          progressHistory: { keyArgs: false, merge: false },
          continueWatching: { keyArgs: false, merge: false },
          watchlist: { keyArgs: false, merge: false },
          homeRails: { merge: false },
          homeContinueWatching: { merge: false },
        },
      },
    },
  });
  const client = new ApolloClient({
    cache,
    link: new HttpLink({ uri: "http://127.0.0.1:4000/graphql", fetch: transport }),
    devtools: { enabled: false },
    defaultOptions: {
      query: { fetchPolicy: "network-only" },
      watchQuery: { fetchPolicy: "network-only" },
      mutate: { fetchPolicy: "no-cache" },
    },
  });
  const expiryTimer = setTimeout(dispose, Math.max(0, Math.min(expiresAt - now(), 2147483647)));
  function dispose(keepTerminal = false) {
    clearTimeout(expiryTimer);
    lifetime.abort();
    if (!keepTerminal) {
      terminalLifetime.abort();
    }
    client.stop();
    cache.restore({});
  }
  return {
    client,
    isDisposed: () => lifetime.signal.aborted,
    dispose,
    finish(input: ProgressCommand) {
      assertFresh();
      if (active || terminalUsed) {
        return;
      }
      const operation = request(
        JSON.stringify({ operationName: "RecordProgress", variables: { input } }),
      );
      terminalUsed = true;
      const signal = AbortSignal.any([terminalLifetime.signal, AbortSignal.timeout(4000)]);
      // A final best-effort send never fills Apollo or acknowledges a durable save.
      void send(serialize(operation), signal, true)
        .then(async (response) => {
          await response.body?.cancel();
        })
        .catch(() => undefined);
    },
  };
}
