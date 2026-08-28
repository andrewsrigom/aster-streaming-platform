import type { SavedProgress } from "./operations.ts";
import type { createProgressReporter } from "./progress-reporter.ts";

type ProgressMedia = EventTarget &
  Pick<HTMLVideoElement, "currentTime" | "duration" | "readyState" | "paused" | "seeking">;

export function attachMediaProgress(options: {
  media: ProgressMedia;
  reporter: ReturnType<typeof createProgressReporter>;
  saved: SavedProgress | null;
  onResumeAvailable: (seconds: number | null) => void;
}) {
  const { media, reporter } = options;
  const lifetime = new AbortController();
  let pendingResume: number | undefined;
  let metadataHandled = false;
  const duration = () =>
    media.readyState >= 1 &&
    Number.isFinite(media.duration) &&
    media.duration > 0 &&
    media.duration <= 43200
      ? media.duration
      : undefined;
  const observe = () => {
    const seconds = duration();
    if (seconds === undefined || !Number.isFinite(media.currentTime) || media.seeking) {
      return;
    }
    const durationMs = Math.round(seconds * 1000);
    reporter.observe({
      positionMs: Math.max(0, Math.min(Math.round(media.currentTime * 1000), durationMs)),
      durationMs,
    });
  };
  const resume = () => {
    const seconds = duration();
    if (lifetime.signal.aborted || pendingResume === undefined || seconds === undefined) {
      return false;
    }
    try {
      media.currentTime = Math.min(pendingResume, seconds);
    } catch {
      return false;
    }
    pendingResume = undefined;
    options.onResumeAvailable(null);
    return true;
  };
  const metadata = () => {
    const seconds = duration();
    if (metadataHandled || seconds === undefined) {
      return;
    }
    metadataHandled = true;
    if (options.saved?.status !== "IN_PROGRESS" || options.saved.positionMs <= 0) {
      return;
    }
    pendingResume = Math.min(options.saved.positionMs / 1000, seconds);
    // A late optional read must not jump over playback or a seek already chosen by the viewer.
    if (media.currentTime < 1 && !media.seeking && resume()) {
      return;
    }
    options.onResumeAvailable(pendingResume);
  };
  const flush = () => {
    if (!lifetime.signal.aborted) {
      observe();
      reporter.flush();
    }
  };
  const listen = (event: string, work: () => void) => {
    media.addEventListener(event, work, { signal: lifetime.signal });
  };
  listen("loadedmetadata", metadata);
  listen("timeupdate", () => {
    if (!media.paused) {
      observe();
    }
  });
  listen("pause", flush);
  listen("ended", flush);
  listen("seeked", flush);
  metadata();
  return {
    resume,
    flush,
    dispose(finalAttempt = false) {
      if (lifetime.signal.aborted) {
        return;
      }
      if (finalAttempt) {
        observe();
      }
      lifetime.abort();
      // Call before the HLS adapter clears currentTime and the source.
      reporter.dispose(finalAttempt);
      pendingResume = undefined;
    },
  };
}
