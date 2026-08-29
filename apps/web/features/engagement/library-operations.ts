import { gql, type TypedDocumentNode } from "@apollo/client";
import {
  identifier,
  integer,
  record,
  type ProgressPair,
  type SavedProgress,
} from "./operations.ts";

export type LibraryKind = "continue" | "history" | "watchlist";
export interface LibraryVariables {
  readonly profileId: string;
  readonly first: number;
  readonly after: string | null;
}
interface LibraryEntry {
  readonly id: string;
  readonly titleId: string;
  readonly title: { id: string; localized: { title: string } } | null;
  readonly profileId?: string;
  readonly addedAt?: number;
  readonly positionMs?: number;
  readonly durationMs?: number;
  readonly status?: SavedProgress["status"];
}
export interface LibraryPage {
  readonly code: "COMPLETED";
  readonly correlationId: string;
  readonly connection: {
    edges: { cursor: string; node: LibraryEntry }[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}
export interface LibraryData {
  progressHistory?: LibraryPage;
  continueWatching?: LibraryPage;
  watchlist?: LibraryPage;
}
const PROGRESS_HISTORY: TypedDocumentNode<LibraryData, LibraryVariables> = gql`
  query ProgressHistory($profileId: ID!, $first: Int! = 20, $after: String) {
    progressHistory(profileId: $profileId, first: $first, after: $after) {
      code
      correlationId
      connection {
        edges {
          cursor
          node {
            id
            titleId
            positionMs
            durationMs
            status
            title {
              id
              localized {
                title
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;
const CONTINUE_WATCHING: TypedDocumentNode<LibraryData, LibraryVariables> = gql`
  query ContinueWatching($profileId: ID!, $first: Int! = 20, $after: String) {
    continueWatching(profileId: $profileId, first: $first, after: $after) {
      code
      correlationId
      connection {
        edges {
          cursor
          node {
            id
            titleId
            positionMs
            durationMs
            status
            title {
              id
              localized {
                title
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;
const WATCHLIST: TypedDocumentNode<LibraryData, LibraryVariables> = gql`
  query Watchlist($profileId: ID!, $first: Int! = 20, $after: String) {
    watchlist(profileId: $profileId, first: $first, after: $after) {
      code
      correlationId
      connection {
        edges {
          cursor
          node {
            id
            profileId
            titleId
            addedAt
            title {
              id
              localized {
                title
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;
export const libraryOperations = {
  continue: { name: "ContinueWatching", field: "continueWatching", document: CONTINUE_WATCHING },
  history: { name: "ProgressHistory", field: "progressHistory", document: PROGRESS_HISTORY },
  watchlist: { name: "Watchlist", field: "watchlist", document: WATCHLIST },
} as const;
export const WATCHLIST_MEMBERSHIP: TypedDocumentNode<
  { profile: { id: string; inWatchlist: boolean } },
  ProgressPair
> = gql`
  query WatchlistMembership($profileId: ID!, $titleId: ID!) {
    profile(id: $profileId) {
      id
      inWatchlist(titleId: $titleId)
    }
  }
`;
export interface WatchlistCommand extends ProgressPair {
  readonly idempotencyKey: string;
  readonly present: boolean;
}
export interface WatchlistOutcome {
  readonly code:
    | "COMPLETED"
    | "INVALID_INPUT"
    | "UNAUTHENTICATED"
    | "NOT_FOUND"
    | "NOT_VISIBLE"
    | "CONFLICT"
    | "BACKPRESSURE"
    | "LIMIT_EXCEEDED"
    | "UNAVAILABLE"
    | "CANCELLED"
    | "INDETERMINATE";
  readonly correlationId: string;
  readonly retryAfterMs?: number;
  readonly change:
    (ProgressPair & { id: string; present: boolean; version: number; updatedAt: number }) | null;
}
export const SET_WATCHLIST: TypedDocumentNode<
  { setWatchlist: WatchlistOutcome },
  { input: WatchlistCommand }
> = gql`
  mutation SetWatchlist($input: SetWatchlistInput!) {
    setWatchlist(input: $input) {
      code
      correlationId
      retryAfterMs
      change {
        id
        profileId
        titleId
        present
        version
        updatedAt
      }
    }
  }
`;

function cursor(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 128 ||
    !/^[a-zA-Z0-9.-]+$/.test(value)
  ) {
    throw new Error("Invalid library cursor.");
  }
  return value;
}
export function readLibraryVariables(value: unknown, profileId: string): LibraryVariables {
  const data = record(value);
  if (data["profileId"] !== profileId) {
    throw new Error("Invalid library scope.");
  }
  return {
    profileId: identifier(profileId),
    first: integer(data["first"], 1, 20),
    after: data["after"] === null || data["after"] === undefined ? null : cursor(data["after"]),
  };
}
export function readLibraryPage(
  value: unknown,
  variables: LibraryVariables,
  kind: LibraryKind,
): LibraryPage {
  const data = record(value);
  if (data["code"] !== "COMPLETED") {
    throw new Error("Library page unavailable.");
  }
  const connection = record(data["connection"]);
  if (!Array.isArray(connection["edges"]) || connection["edges"].length > variables.first) {
    throw new Error("Invalid library page size.");
  }
  const edges = connection["edges"].map((value: unknown) => {
    const edge = record(value);
    const node = record(edge["node"]);
    const titleId = identifier(node["titleId"]);
    let title: LibraryEntry["title"] = null;
    if (node["title"] !== null) {
      const metadata = record(node["title"]);
      const localized = record(metadata["localized"]);
      const text = localized["title"];
      if (
        metadata["id"] !== titleId ||
        typeof text !== "string" ||
        !text.trim() ||
        text.length > 512
      ) {
        throw new Error("Invalid library title.");
      }
      title = { id: titleId, localized: { title: text } };
    }
    const common = { id: identifier(node["id"]), titleId, title };
    let entry: LibraryEntry;
    if (kind === "watchlist") {
      if (node["profileId"] !== variables.profileId) {
        throw new Error("Invalid library ownership.");
      }
      entry = {
        ...common,
        profileId: variables.profileId,
        addedAt: integer(node["addedAt"], 0, 253402300799),
      };
    } else {
      const status = node["status"];
      if (
        (status !== "IN_PROGRESS" && status !== "COMPLETED" && status !== "NOT_STARTED") ||
        (kind === "continue" && status !== "IN_PROGRESS")
      ) {
        throw new Error("Invalid library progress.");
      }
      const durationMs = integer(node["durationMs"], 1, 43200000);
      entry = {
        ...common,
        status,
        durationMs,
        positionMs: integer(node["positionMs"], 0, durationMs),
      };
    }
    return { cursor: cursor(edge["cursor"]), node: entry };
  });
  const pageInfo = record(connection["pageInfo"]);
  const endCursor = pageInfo["endCursor"] === null ? null : cursor(pageInfo["endCursor"]);
  const hasNextPage = pageInfo["hasNextPage"];
  if (
    typeof hasNextPage !== "boolean" ||
    endCursor !== (edges.at(-1)?.cursor ?? null) ||
    (hasNextPage && (!endCursor || endCursor === variables.after)) ||
    new Set(edges.map((edge) => edge.node.titleId)).size !== edges.length ||
    new Set(edges.map((edge) => edge.cursor)).size !== edges.length
  ) {
    throw new Error("Invalid library traversal.");
  }
  return {
    code: "COMPLETED",
    correlationId: identifier(data["correlationId"]),
    connection: { edges, pageInfo: { endCursor, hasNextPage } },
  };
}
export function readWatchlistMembership(value: unknown, pair: ProgressPair) {
  const data = record(value);
  if (data["id"] !== pair.profileId || typeof data["inWatchlist"] !== "boolean") {
    throw new Error("Watchlist membership unavailable.");
  }
  return { id: pair.profileId, inWatchlist: data["inWatchlist"] };
}
export function readWatchlistCommand(value: unknown, profileId: string): WatchlistCommand {
  const data = record(value);
  if (
    Object.keys(data).length !== 4 ||
    data["profileId"] !== profileId ||
    typeof data["present"] !== "boolean"
  ) {
    throw new Error("Invalid watchlist change.");
  }
  return Object.freeze({
    profileId: identifier(profileId),
    titleId: identifier(data["titleId"]),
    idempotencyKey: identifier(data["idempotencyKey"]),
    present: data["present"],
  });
}
export function readWatchlistOutcome(value: unknown, input: WatchlistCommand): WatchlistOutcome {
  const data = record(value);
  const code = data["code"];
  const correlationId = identifier(data["correlationId"]);
  const retryAfterMs = data["retryAfterMs"];
  if (code === "COMPLETED") {
    if (retryAfterMs !== null && retryAfterMs !== undefined) {
      throw new Error("Invalid watchlist retry policy.");
    }
    const change = record(data["change"]);
    if (
      change["profileId"] !== input.profileId ||
      change["titleId"] !== input.titleId ||
      change["present"] !== input.present
    ) {
      throw new Error("Mismatched watchlist acknowledgement.");
    }
    return {
      code,
      correlationId,
      change: {
        id: identifier(change["id"]),
        profileId: input.profileId,
        titleId: input.titleId,
        present: input.present,
        version: integer(change["version"], 1),
        updatedAt: integer(change["updatedAt"], 0, 253402300799),
      },
    };
  }
  if (
    data["change"] !== null ||
    (code !== "INVALID_INPUT" &&
      code !== "UNAUTHENTICATED" &&
      code !== "NOT_FOUND" &&
      code !== "NOT_VISIBLE" &&
      code !== "CONFLICT" &&
      code !== "BACKPRESSURE" &&
      code !== "LIMIT_EXCEEDED" &&
      code !== "UNAVAILABLE" &&
      code !== "CANCELLED" &&
      code !== "INDETERMINATE")
  ) {
    throw new Error("Invalid watchlist outcome.");
  }
  if (code === "LIMIT_EXCEEDED") {
    return {
      code,
      correlationId,
      retryAfterMs: integer(retryAfterMs, 1, 30_000),
      change: null,
    };
  }
  if (retryAfterMs !== null && retryAfterMs !== undefined) {
    throw new Error("Invalid watchlist retry policy.");
  }
  return { code, correlationId, change: null };
}
