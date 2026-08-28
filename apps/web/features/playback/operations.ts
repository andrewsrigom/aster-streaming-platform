import { gql, type TypedDocumentNode } from "@apollo/client";

const playbackCodes = [
  "COMPLETED",
  "INVALID_INPUT",
  "NOT_PLAYABLE",
  "UNAVAILABLE",
  "CANCELLED",
  "INDETERMINATE",
  "LIMIT_EXCEEDED",
] as const;
type PlaybackCode = (typeof playbackCodes)[number];
export interface PlayerSession {
  id: string;
  titleId: string;
  manifestUrl: string;
  expiresAt: number;
}
export interface PlaybackResult {
  code: PlaybackCode;
  correlationId: string;
  session: PlayerSession | null;
}
export const START_PLAYBACK: TypedDocumentNode<
  { createPlaybackSession: PlaybackResult },
  { titleId: string }
> = gql`
  mutation StartPlayback($titleId: ID!) {
    createPlaybackSession(titleId: $titleId) {
      code
      correlationId
      session {
        id
        titleId
        manifestUrl
        expiresAt
      }
    }
  }
`;

export function playerIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)
  );
}

export function playerManifestUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\p{Cc}\p{Cs}\s]/u.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.href === value &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      (url.protocol === "https:" ||
        /^http:\/\/127\.0\.0\.1:9001\/aster-media-published\/publications\/[a-f0-9]{64}\/master\.m3u8$/u.test(
          value,
        ))
    );
  } catch {
    return false;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid playback response.");
  }
  return value as Record<string, unknown>;
}

export function readPlaybackResult(
  value: unknown,
  titleId: string,
  nowSeconds: number,
): PlaybackResult {
  const result = object(value);
  const code = result["code"];
  const correlationId = result["correlationId"];
  if (
    !playerIdentifier(titleId) ||
    !playerIdentifier(correlationId) ||
    !playbackCodes.includes(code as PlaybackCode)
  ) {
    throw new Error("Invalid playback response.");
  }
  if (code !== "COMPLETED") {
    if (result["session"] !== null) {
      throw new Error("Invalid playback response.");
    }
    return { code: code as PlaybackCode, correlationId, session: null };
  }
  const source = object(result["session"]);
  const id = source["id"];
  const manifestUrl = source["manifestUrl"];
  const expiresAt = source["expiresAt"];
  if (
    !playerIdentifier(id) ||
    source["titleId"] !== titleId ||
    !playerManifestUrl(manifestUrl) ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    !Number.isFinite(nowSeconds) ||
    expiresAt <= nowSeconds ||
    expiresAt > nowSeconds + 905
  ) {
    throw new Error("Invalid or expired playback session.");
  }
  return { code, correlationId, session: { id, titleId, manifestUrl, expiresAt } };
}
