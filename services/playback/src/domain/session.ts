export interface PlaybackSession {
  readonly id: string;
  readonly titleId: string;
  readonly publicationId: string;
  readonly catalogVersion: number;
  readonly catalogCheckedAt: number;
  readonly manifestUrl: string;
  readonly profileId: null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly correlationId: string;
}

export interface PlaybackPublication {
  readonly titleId: string;
  readonly publicationId: string;
  readonly titleVersion: number;
  readonly manifestUrl: string;
  readonly checkedAt: number;
  readonly validUntil: number | null;
}

const MAX_TIMESTAMP = 253_402_300_799;
const SESSION_SECONDS = 900;
const MAX_SNAPSHOT_AGE_SECONDS = 2;
export const playbackIdentifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const timestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;

function publicationRecord(value: unknown): Record<string, unknown> | undefined {
  const keys = [
    "titleId",
    "publicationId",
    "titleVersion",
    "manifestUrl",
    "checkedAt",
    "validUntil",
  ];
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)
    ) {
      return undefined;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Reflect.ownKeys(descriptors);
    if (
      names.length !== keys.length ||
      names.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return undefined;
    }
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) {
        return undefined;
      }
      record[key] = descriptor.value as unknown;
    }
    return record;
  } catch {
    return undefined;
  }
}

function deliveryUrl(value: unknown, allowLocalMedia: boolean): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\p{Cc}\p{Cs}\s]/u.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.href !== value || url.username || url.password || url.hash || url.search) {
      return false;
    }
    return (
      url.protocol === "https:" ||
      (allowLocalMedia &&
        /^http:\/\/127\.0\.0\.1:9001\/aster-media-published\/publications\/[a-f0-9]{64}\/master\.m3u8$/u.test(
          value,
        ))
    );
  } catch {
    return false;
  }
}

/** Validate and copy the complete Catalog publication before it can count as an owner success. */
export function normalizePlaybackPublication(
  value: unknown,
  context: Readonly<{ titleId: string; now: number; allowLocalMedia: boolean }>,
): PlaybackPublication | undefined {
  const current = publicationRecord(value);
  if (!current || !playbackIdentifier(context.titleId) || !timestamp(context.now)) {
    return undefined;
  }
  const titleId = current["titleId"];
  const publicationId = current["publicationId"];
  const version = current["titleVersion"];
  const checkedAt = current["checkedAt"];
  const validUntil = current["validUntil"];
  const manifestUrl = current["manifestUrl"];
  if (
    titleId !== context.titleId ||
    !playbackIdentifier(publicationId) ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > 2_147_483_647 ||
    !timestamp(checkedAt) ||
    checkedAt > context.now ||
    context.now - checkedAt > MAX_SNAPSHOT_AGE_SECONDS ||
    (validUntil !== null && (!timestamp(validUntil) || validUntil <= context.now)) ||
    !deliveryUrl(manifestUrl, context.allowLocalMedia)
  ) {
    return undefined;
  }
  return Object.freeze({
    titleId,
    publicationId,
    titleVersion: version,
    manifestUrl,
    checkedAt,
    validUntil,
  });
}

/** The application supplies an owner-read snapshot; browser input cannot supply this authority. */
export function createAnonymousPlaybackSession(
  input: Readonly<{
    id: string;
    titleId: string;
    correlationId: string;
    publication: unknown;
    now: number;
    allowLocalMedia: boolean;
  }>,
): PlaybackSession | undefined {
  if (
    !playbackIdentifier(input.id) ||
    !playbackIdentifier(input.titleId) ||
    !playbackIdentifier(input.correlationId) ||
    !timestamp(input.now)
  ) {
    return undefined;
  }
  const current = normalizePlaybackPublication(input.publication, {
    titleId: input.titleId,
    now: input.now,
    allowLocalMedia: input.allowLocalMedia,
  });
  if (!current) {
    return undefined;
  }
  const expiresAt = Math.min(
    input.now + SESSION_SECONDS,
    current.validUntil ?? MAX_TIMESTAMP,
    MAX_TIMESTAMP,
  );
  if (expiresAt <= input.now) {
    return undefined;
  }
  return Object.freeze({
    id: input.id,
    titleId: current.titleId,
    publicationId: current.publicationId,
    catalogVersion: current.titleVersion,
    catalogCheckedAt: current.checkedAt,
    manifestUrl: current.manifestUrl,
    profileId: null,
    createdAt: input.now,
    expiresAt,
    correlationId: input.correlationId,
  });
}
