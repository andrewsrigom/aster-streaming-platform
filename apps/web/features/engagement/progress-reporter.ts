export interface ProgressSample {
  readonly positionMs: number;
  readonly durationMs: number;
}
export interface ProgressCommand extends ProgressSample {
  readonly profileId: string;
  readonly titleId: string;
  readonly playbackSessionId: string;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly occurredAt: number;
}
export type ProgressSaveResult =
  | Readonly<{ code: "COMPLETED"; sequence: number }>
  | Readonly<{
      code:
        | "INVALID_INPUT"
        | "UNAUTHENTICATED"
        | "NOT_FOUND"
        | "NOT_PLAYABLE"
        | "STALE"
        | "CONFLICT"
        | "BACKPRESSURE"
        | "LIMIT_EXCEEDED"
        | "UNAVAILABLE"
        | "CANCELLED"
        | "INDETERMINATE";
    }>;
export type ProgressSaveStatus =
  "idle" | "pending" | "saving" | "saved" | "unconfirmed" | "conflict" | "unavailable";

const REPORT_INTERVAL_MS = 15000;
const MIN_ATTEMPT_INTERVAL_MS = 2000;
const MAX_SEQUENCE = 2147483647;
const identifier = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const sameSample = (a: ProgressSample, b: ProgressSample) =>
  a.positionMs === b.positionMs && a.durationMs === b.durationMs;
const validSample = (value: ProgressSample) =>
  Number.isSafeInteger(value.positionMs) &&
  value.positionMs >= 0 &&
  Number.isSafeInteger(value.durationMs) &&
  value.durationMs > 0 &&
  value.durationMs <= 43200000 &&
  value.positionMs <= value.durationMs;

export function createProgressReporter(options: {
  profileId: string;
  titleId: string;
  playbackSessionId: string;
  sequence: number;
  save: (input: ProgressCommand, signal: AbortSignal) => Promise<ProgressSaveResult>;
  finish: (input: ProgressCommand) => void;
  onStatus: (status: ProgressSaveStatus) => void;
  now?: () => number;
  identify?: () => string;
  schedule?: (work: () => void, delayMs: number) => () => void;
}) {
  if (
    ![options.profileId, options.titleId, options.playbackSessionId].every(identifier) ||
    !Number.isSafeInteger(options.sequence) ||
    options.sequence < 0 ||
    options.sequence > MAX_SEQUENCE
  ) {
    throw new Error("Invalid progress reporting context.");
  }
  const now = options.now ?? Date.now;
  const identify = options.identify ?? (() => crypto.randomUUID());
  const schedule =
    options.schedule ??
    ((work, delayMs) => {
      const timer = setTimeout(work, delayMs);
      return () => {
        clearTimeout(timer);
      };
    });
  const lifetime = new AbortController();
  const openedAt = now();
  let sequence = options.sequence;
  let latest: ProgressSample | undefined;
  let pending: ProgressCommand | undefined;
  let acknowledged: ProgressSample | undefined;
  let attempts = 0;
  let active = false;
  let flushRequested = false;
  let blocked = false;
  let disposed = false;
  let lastAttempt: number | undefined;
  let cancelTimer: (() => void) | undefined;
  let timerAt = Infinity;

  const notify = (status: ProgressSaveStatus) => {
    if (!disposed) {
      options.onStatus(status);
    }
  };
  const clearTimer = () => {
    cancelTimer?.();
    cancelTimer = undefined;
    timerAt = Infinity;
  };
  const command = (): ProgressCommand | undefined => {
    if (!latest || sequence === MAX_SEQUENCE) {
      return undefined;
    }
    const idempotencyKey = identify();
    const occurredAt = Math.floor(now() / 1000);
    if (!identifier(idempotencyKey) || !Number.isSafeInteger(occurredAt) || occurredAt < 0) {
      return undefined;
    }
    return Object.freeze({
      ...latest,
      profileId: options.profileId,
      titleId: options.titleId,
      playbackSessionId: options.playbackSessionId,
      idempotencyKey,
      sequence: ++sequence,
      occurredAt,
    });
  };
  const arm = (urgent: boolean) => {
    if (disposed || blocked || active || (!pending && !latest)) {
      return;
    }
    const at = Math.max(
      now(),
      pending || urgent
        ? (lastAttempt ?? -Infinity) + MIN_ATTEMPT_INTERVAL_MS
        : (lastAttempt ?? openedAt) + REPORT_INTERVAL_MS,
    );
    if (at >= timerAt) {
      return;
    }
    clearTimer();
    timerAt = at;
    cancelTimer = schedule(() => {
      clearTimer();
      void dispatch();
    }, at - now());
  };
  const dispatch = async () => {
    if (disposed || blocked || active) {
      return;
    }
    if (!pending) {
      pending = command();
      latest = undefined;
      flushRequested = false;
      attempts = 0;
    }
    if (!pending) {
      blocked = true;
      notify("unavailable");
      return;
    }
    const input = pending;
    active = true;
    attempts++;
    lastAttempt = now();
    notify("saving");
    let result: ProgressSaveResult;
    try {
      result = await options.save(
        input,
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(4000)]),
      );
    } catch {
      result = { code: "INDETERMINATE" };
    }
    active = false;
    if (lifetime.signal.aborted) {
      return;
    }
    if (result.code === "COMPLETED" && result.sequence === input.sequence) {
      acknowledged = input;
      pending = undefined;
      attempts = 0;
      if (latest && sameSample(latest, input)) {
        latest = undefined;
      }
      if (!latest) {
        flushRequested = false;
      }
      notify(latest ? "pending" : "saved");
      arm(flushRequested);
      return;
    }
    const retryable = [
      "UNAVAILABLE",
      "INDETERMINATE",
      "BACKPRESSURE",
      "LIMIT_EXCEEDED",
      "CANCELLED",
    ].includes(result.code);
    if (retryable && attempts < 2) {
      notify("pending");
      arm(true);
      return;
    }
    blocked = true;
    latest = undefined;
    notify(
      result.code === "STALE" || result.code === "CONFLICT"
        ? "conflict"
        : retryable || result.code === "COMPLETED"
          ? "unconfirmed"
          : "unavailable",
    );
  };
  notify("idle");
  return Object.freeze({
    observe(sample: ProgressSample) {
      if (disposed || blocked || !validSample(sample)) {
        return;
      }
      if (!pending && acknowledged && sameSample(sample, acknowledged)) {
        latest = undefined;
        flushRequested = false;
        clearTimer();
        notify("saved");
        return;
      }
      latest = Object.freeze({ positionMs: sample.positionMs, durationMs: sample.durationMs });
      if (!active) {
        notify("pending");
      }
      arm(false);
    },
    flush() {
      // Preserve pause/seek intent while a prior command or its identical retry is in flight.
      if (latest || pending) {
        flushRequested = true;
      }
      arm(true);
    },
    dispose(flush = false) {
      if (disposed) {
        return;
      }
      disposed = true;
      clearTimer();
      lifetime.abort();
      // One terminal attempt, never a second concurrent request or a claimed acknowledgement.
      if (flush && !active && !blocked) {
        const input = pending ?? command();
        if (input && attempts < 2) {
          try {
            options.finish(input);
          } catch {
            // Terminal transport rejection cannot interrupt media/component teardown.
          }
        }
      }
      latest = undefined;
      pending = undefined;
      acknowledged = undefined;
    },
  });
}
