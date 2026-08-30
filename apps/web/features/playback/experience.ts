const playerFailures = [
  "session",
  "expired",
  "not-playable",
  "manifest",
  "network",
  "decode",
  "unsupported",
  "caption",
  "fatal",
] as const;
export type PlayerFailure = (typeof playerFailures)[number];
export const failureMessage: Readonly<Record<PlayerFailure, string>> = Object.freeze({
  session: "A playback session could not be confirmed. Start a new session to try again.",
  expired: "This playback session expired. Start a new session to continue.",
  "not-playable": "This title is not currently available for playback.",
  manifest: "The playlist could not be loaded. Start a new session to try again.",
  network: "Media delivery stopped. Check your connection, then start a new session.",
  decode: "The browser could not decode this video. Try another supported browser.",
  unsupported: "This browser does not support this HLS video. Try a current browser.",
  caption: "Captions could not be loaded. Video can continue without captions.",
  fatal: "Playback stopped. Start a new session to try again.",
});

export function classifyPlayerFailure(type: string, detail: string): PlayerFailure {
  if (/subtitle|caption/i.test(detail)) {
    return "caption";
  }
  if (/manifest|levelEmpty|levelParsing/i.test(detail)) {
    return "manifest";
  }
  if (/network/i.test(type)) {
    return "network";
  }
  if (/media/i.test(type) || /decode|bufferAppend/i.test(detail)) {
    return "decode";
  }
  return "fatal";
}

const experienceEvents = [
  "session_success",
  "session_failure",
  "manifest_loaded",
  "first_frame",
  "rendition_switch",
  "rebuffer",
  "fatal_error",
  "completion",
] as const;
export type ExperienceEvent = (typeof experienceEvents)[number];
export interface ExperienceSample {
  event: ExperienceEvent;
  atMs: number;
  durationMs?: number;
  height?: number;
  error?: PlayerFailure;
}

const maximumDurationMs = 86_400_000;
export const playbackTelemetryPolicy = Object.freeze({
  schemaVersion: 1,
  localAttemptSampleRate: 1,
  remoteAttemptSampleRate: 0,
  maximumEvents: 64,
  retention: "player_attempt" as const,
});

export interface PlaybackExperienceSummary {
  firstFrame: "not_attempted" | "pending" | "succeeded" | "failed";
  firstFrameDurationMs?: number;
  failure?: PlayerFailure;
  rebufferCount: number;
  rebufferDurationMs: number;
  eventCount: number;
  truncated: boolean;
}

export function createPlaybackExperience(now: () => number = () => performance.now()) {
  const readClock = () => {
    try {
      const value = now();
      return Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
  };
  const started = readClock() ?? 0;
  const samples: ExperienceSample[] = [];
  const once = new Set<ExperienceEvent>();
  let rebufferAt: number | undefined;
  let disposed = false;
  let firstFrame: PlaybackExperienceSummary["firstFrame"] = "not_attempted";
  let sessionFailed = false;
  let firstFrameDurationMs: number | undefined;
  let failure: PlayerFailure | undefined;
  let rebufferCount = 0;
  let rebufferDurationMs = 0;
  let truncated = false;
  const boundedDuration = (value: number) =>
    Number.isFinite(value)
      ? Math.min(maximumDurationMs, Math.max(0, Math.round(value)))
      : undefined;
  const elapsed = () => boundedDuration((readClock() ?? started) - started) ?? 0;
  const record = (
    event: ExperienceEvent,
    detail: Omit<ExperienceSample, "event" | "atMs"> = {},
  ) => {
    if (disposed || !experienceEvents.includes(event)) {
      return;
    }
    if (
      [
        "session_success",
        "session_failure",
        "manifest_loaded",
        "first_frame",
        "fatal_error",
        "completion",
      ].includes(event)
    ) {
      if (once.has(event)) {
        return;
      }
      if (event === "first_frame" && firstFrame !== "pending") {
        return;
      }
      once.add(event);
    }
    if (event === "fatal_error" && rebufferAt !== undefined) {
      const rebufferStarted = rebufferAt;
      rebufferAt = undefined;
      const rebufferEnded = readClock();
      if (rebufferEnded !== undefined && rebufferEnded >= rebufferStarted) {
        record("rebuffer", { durationMs: rebufferEnded - rebufferStarted });
      }
    }
    const sample: ExperienceSample = { event, atMs: elapsed() };
    if (typeof detail.durationMs === "number") {
      const durationMs = boundedDuration(detail.durationMs);
      if (durationMs !== undefined) {
        sample.durationMs = durationMs;
      }
    }
    if (
      typeof detail.height === "number" &&
      Number.isInteger(detail.height) &&
      detail.height > 0 &&
      detail.height <= 4320
    ) {
      sample.height = detail.height;
    }
    if (detail.error && playerFailures.includes(detail.error)) {
      sample.error = detail.error;
    }
    if (event === "first_frame" && firstFrame === "pending") {
      firstFrame = "succeeded";
      firstFrameDurationMs = sample.durationMs;
    } else if (event === "session_failure" && firstFrame === "not_attempted") {
      sessionFailed = true;
      failure = sample.error ?? "session";
    } else if (event === "fatal_error" && firstFrame === "pending") {
      firstFrame = "failed";
      failure = sample.error ?? "fatal";
    } else if (event === "rebuffer") {
      rebufferCount = Math.min(playbackTelemetryPolicy.maximumEvents, rebufferCount + 1);
      rebufferDurationMs = Math.min(
        maximumDurationMs,
        rebufferDurationMs + (sample.durationMs ?? 0),
      );
    }
    if (samples.length >= playbackTelemetryPolicy.maximumEvents) {
      truncated = true;
      return;
    }
    samples.push(Object.freeze(sample));
  };
  return {
    record,
    mediaAttempt() {
      if (!disposed && !sessionFailed && firstFrame === "not_attempted") {
        firstFrame = "pending";
      }
    },
    waiting() {
      if (!disposed && firstFrame === "succeeded" && rebufferAt === undefined) {
        rebufferAt = readClock();
      }
    },
    playing() {
      const rebufferStarted = rebufferAt;
      rebufferAt = undefined;
      const rebufferEnded = readClock();
      if (
        !disposed &&
        rebufferStarted !== undefined &&
        rebufferEnded !== undefined &&
        rebufferEnded >= rebufferStarted
      ) {
        record("rebuffer", { durationMs: rebufferEnded - rebufferStarted });
      }
    },
    cancelWaiting() {
      rebufferAt = undefined;
    },
    snapshot: () => samples.map((sample) => ({ ...sample })),
    summary(): PlaybackExperienceSummary {
      const result: PlaybackExperienceSummary = {
        firstFrame,
        rebufferCount,
        rebufferDurationMs,
        eventCount: samples.length,
        truncated,
      };
      if (firstFrameDurationMs !== undefined) {
        result.firstFrameDurationMs = firstFrameDurationMs;
      }
      if (failure !== undefined) {
        result.failure = failure;
      }
      return result;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      samples.length = 0;
      once.clear();
      rebufferAt = undefined;
      firstFrame = "not_attempted";
      sessionFailed = false;
      firstFrameDurationMs = undefined;
      failure = undefined;
      rebufferCount = 0;
      rebufferDurationMs = 0;
      truncated = false;
    },
  };
}
export type PlaybackExperience = ReturnType<typeof createPlaybackExperience>;
