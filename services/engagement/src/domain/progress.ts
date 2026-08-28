const MAX_DURATION_MS = 43_200_000;
const MAX_SEQUENCE = 2_147_483_647;
const MAX_TIME = 253_402_300_799;

export interface ProgressInput {
  readonly profileId: string;
  readonly titleId: string;
  readonly playbackSessionId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly occurredAt: number;
}
export interface ProgressPolicy {
  readonly openingSeconds: number;
  readonly openingFraction: number;
  readonly completionFraction: number;
  readonly completionTailSeconds: number;
}
export const DEFAULT_PROGRESS_POLICY: ProgressPolicy = Object.freeze({
  openingSeconds: 30,
  openingFraction: 0.05,
  completionFraction: 0.95,
  completionTailSeconds: 30,
});
type ProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export interface ProgressState {
  readonly id: string;
  readonly accountId: string;
  readonly profileId: string;
  readonly titleId: string;
  readonly playbackSessionId: string;
  readonly sequence: number;
  readonly version: number;
  readonly positionMs: number;
  readonly durationMs: number;
  readonly status: ProgressStatus;
  readonly occurredAt: number;
  readonly updatedAt: number;
}
const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
export { identifier as progressIdentifier };
const integer = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
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
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) {
        return undefined;
      }
      result[key] = descriptor.value as unknown;
    }
    return result;
  } catch {
    return undefined;
  }
}

export function normalizeProgressInput(value: unknown): ProgressInput | undefined {
  const data = exactRecord(value, [
    "profileId",
    "titleId",
    "playbackSessionId",
    "idempotencyKey",
    "sequence",
    "positionMs",
    "durationMs",
    "occurredAt",
  ]);
  if (
    !data ||
    !identifier(data["profileId"]) ||
    !identifier(data["titleId"]) ||
    !identifier(data["playbackSessionId"]) ||
    !identifier(data["idempotencyKey"]) ||
    !integer(data["sequence"], 1, MAX_SEQUENCE) ||
    !integer(data["positionMs"], -MAX_DURATION_MS, MAX_DURATION_MS) ||
    !integer(data["durationMs"], 1, MAX_DURATION_MS) ||
    !integer(data["occurredAt"], 0, MAX_TIME)
  ) {
    return undefined;
  }
  return Object.freeze({
    profileId: data["profileId"],
    titleId: data["titleId"],
    playbackSessionId: data["playbackSessionId"],
    idempotencyKey: data["idempotencyKey"],
    sequence: data["sequence"],
    positionMs: data["positionMs"],
    durationMs: data["durationMs"],
    occurredAt: data["occurredAt"],
  });
}

export function progressRequestPayload(input: ProgressInput): string {
  // Preserve submitted position: distinct overrun payloads must not share a receipt digest.
  return JSON.stringify([
    input.profileId,
    input.titleId,
    input.playbackSessionId,
    input.sequence,
    input.positionMs,
    input.durationMs,
    input.occurredAt,
  ]);
}

export function normalizeProgressState(value: unknown): ProgressState | undefined {
  const data = exactRecord(value, [
    "id",
    "accountId",
    "profileId",
    "titleId",
    "playbackSessionId",
    "sequence",
    "version",
    "positionMs",
    "durationMs",
    "status",
    "occurredAt",
    "updatedAt",
  ]);
  if (
    !data ||
    !identifier(data["id"]) ||
    !identifier(data["accountId"]) ||
    !identifier(data["profileId"]) ||
    !identifier(data["titleId"]) ||
    !identifier(data["playbackSessionId"]) ||
    !integer(data["sequence"], 1, MAX_SEQUENCE) ||
    !integer(data["version"], 1, MAX_SEQUENCE) ||
    !integer(data["durationMs"], 1, MAX_DURATION_MS) ||
    !integer(data["positionMs"], 0, data["durationMs"]) ||
    !integer(data["occurredAt"], 0, MAX_TIME) ||
    !integer(data["updatedAt"], 0, MAX_TIME) ||
    typeof data["status"] !== "string" ||
    !["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(data["status"])
  ) {
    return undefined;
  }
  return Object.freeze({
    id: data["id"],
    accountId: data["accountId"],
    profileId: data["profileId"],
    titleId: data["titleId"],
    playbackSessionId: data["playbackSessionId"],
    sequence: data["sequence"],
    version: data["version"],
    positionMs: data["positionMs"],
    durationMs: data["durationMs"],
    status: data["status"] as ProgressStatus,
    occurredAt: data["occurredAt"],
    updatedAt: data["updatedAt"],
  });
}

export function normalizeProgressPolicy(value: unknown): ProgressPolicy | undefined {
  const data = exactRecord(value, [
    "openingSeconds",
    "openingFraction",
    "completionFraction",
    "completionTailSeconds",
  ]);
  if (!data) {
    return undefined;
  }
  const opening = data["openingFraction"];
  const completion = data["completionFraction"];
  if (
    !integer(data["openingSeconds"], 0, 300) ||
    !integer(data["completionTailSeconds"], 0, 3600) ||
    typeof opening !== "number" ||
    !Number.isFinite(opening) ||
    opening < 0 ||
    opening >= 1 ||
    typeof completion !== "number" ||
    !Number.isFinite(completion) ||
    completion <= opening ||
    completion > 1
  ) {
    return undefined;
  }
  return Object.freeze({
    openingSeconds: data["openingSeconds"],
    openingFraction: opening,
    completionFraction: completion,
    completionTailSeconds: data["completionTailSeconds"],
  });
}

export function advanceProgress(
  value: ProgressState | null,
  input: ProgressInput,
  context: Readonly<{
    aggregateId: string;
    accountId: string;
    now: number;
    policy: ProgressPolicy;
  }>,
):
  | Readonly<{ status: "accepted"; value: ProgressState }>
  | Readonly<{ status: "invalid_input" | "invalid_state" | "stale" }> {
  const current = value === null ? null : normalizeProgressState(value);
  if (value !== null && !current) {
    return { status: "invalid_state" };
  }
  const report = normalizeProgressInput(input);
  const policy = normalizeProgressPolicy(context.policy);
  if (
    !policy ||
    !identifier(context.aggregateId) ||
    !identifier(context.accountId) ||
    !integer(context.now, 0, MAX_TIME)
  ) {
    return { status: "invalid_state" };
  }
  if (!report || report.occurredAt > context.now + 30 || report.occurredAt < context.now - 120) {
    return { status: "invalid_input" };
  }
  if (current) {
    if (
      current.id !== context.aggregateId ||
      current.accountId !== context.accountId ||
      current.profileId !== report.profileId ||
      current.titleId !== report.titleId ||
      !identifier(current.playbackSessionId) ||
      !integer(current.version, 1, MAX_SEQUENCE - 1) ||
      !integer(current.sequence, 1, MAX_SEQUENCE) ||
      !integer(current.durationMs, 1, MAX_DURATION_MS) ||
      !integer(current.positionMs, 0, current.durationMs) ||
      !integer(current.occurredAt, 0, MAX_TIME) ||
      !integer(current.updatedAt, 0, context.now) ||
      !["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(current.status)
    ) {
      return { status: "invalid_state" };
    }
    if (report.sequence <= current.sequence) {
      return { status: "stale" };
    }
  }
  const positionMs = Math.max(0, Math.min(report.positionMs, report.durationMs));
  const openingMs = Math.min(
    policy.openingSeconds * 1000,
    report.durationMs * policy.openingFraction,
  );
  const completionMs = Math.max(
    report.durationMs * policy.completionFraction,
    report.durationMs - policy.completionTailSeconds * 1000,
  );
  const status: ProgressStatus =
    positionMs >= completionMs
      ? "COMPLETED"
      : positionMs > openingMs
        ? "IN_PROGRESS"
        : "NOT_STARTED";
  return {
    status: "accepted",
    value: Object.freeze({
      id: context.aggregateId,
      accountId: context.accountId,
      profileId: report.profileId,
      titleId: report.titleId,
      playbackSessionId: report.playbackSessionId,
      sequence: report.sequence,
      version: (current?.version ?? 0) + 1,
      positionMs,
      durationMs: report.durationMs,
      status,
      occurredAt: report.occurredAt,
      updatedAt: context.now,
    }),
  };
}
