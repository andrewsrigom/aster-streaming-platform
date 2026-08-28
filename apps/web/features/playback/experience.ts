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

export function createPlaybackExperience(now: () => number = () => performance.now()) {
  const started = now();
  const samples: ExperienceSample[] = [];
  const once = new Set<ExperienceEvent>();
  let rebufferAt: number | undefined;
  const elapsed = () => Math.min(86_400_000, Math.max(0, Math.round(now() - started)));
  const record = (
    event: ExperienceEvent,
    detail: Omit<ExperienceSample, "event" | "atMs"> = {},
  ) => {
    if (!experienceEvents.includes(event) || samples.length >= 64) {
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
      once.add(event);
    }
    const sample: ExperienceSample = { event, atMs: elapsed() };
    if (typeof detail.durationMs === "number" && Number.isFinite(detail.durationMs)) {
      sample.durationMs = Math.min(86_400_000, Math.max(0, Math.round(detail.durationMs)));
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
    samples.push(Object.freeze(sample));
  };
  return {
    record,
    waiting() {
      if (once.has("first_frame") && rebufferAt === undefined) {
        rebufferAt = now();
      }
    },
    playing() {
      if (rebufferAt !== undefined) {
        record("rebuffer", { durationMs: now() - rebufferAt });
        rebufferAt = undefined;
      }
    },
    snapshot: () => samples.map((sample) => ({ ...sample })),
  };
}
export type PlaybackExperience = ReturnType<typeof createPlaybackExperience>;
