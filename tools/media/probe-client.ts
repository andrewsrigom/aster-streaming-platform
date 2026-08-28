/// <reference lib="dom" />
import Hls from "hls.js";

const video = document.querySelector("video");
const start = document.querySelector<HTMLButtonElement>("#start");
const stop = document.querySelector<HTMLButtonElement>("#stop");
const report = document.querySelector("#report");
const manifest = document.querySelector<HTMLAnchorElement>("#manifest");
if (!video || !start || !stop || !report || !manifest) {
  throw new Error("Missing probe elements.");
}
const media = video;
const output = report;
const runButton = start;
const stopButton = stop;
const manifestUrl = manifest.href;
type Sample = {
  level: number;
  targetSeconds: number;
  mediaSeconds: number;
  width: number;
  height: number;
  presentedFrames: number;
  decodedFrames: number;
};
let active: AbortController | undefined;
let player: Hls | undefined;
const samples: Sample[] = [];
const errors: string[] = [];

function render(status: string): void {
  output.textContent = JSON.stringify(
    { status, hlsVersion: Hls.version, durationSeconds: media.duration || null, samples, errors },
    null,
    2,
  );
}
function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(new Error("Probe cancelled or timed out."));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}
function frameAt(
  level: number,
  target: number,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<Sample> {
  return new Promise((resolve, reject) => {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
    let callback = 0;
    const abort = (): void => {
      media.cancelVideoFrameCallback(callback);
      reject(new Error("No matching decoded frame before the deadline."));
    };
    const inspect: VideoFrameRequestCallback = (_now, metadata) => {
      if (
        metadata.mediaTime >= target + 0.5 &&
        metadata.mediaTime < target + 4 &&
        media.videoWidth === width &&
        media.videoHeight === height &&
        !media.seeking
      ) {
        deadline.removeEventListener("abort", abort);
        resolve({
          level,
          targetSeconds: target,
          mediaSeconds: metadata.mediaTime,
          width: media.videoWidth,
          height: media.videoHeight,
          presentedFrames: metadata.presentedFrames,
          decodedFrames: media.getVideoPlaybackQuality().totalVideoFrames,
        });
        return;
      }
      callback = media.requestVideoFrameCallback(inspect);
    };
    deadline.addEventListener("abort", abort, { once: true });
    if (deadline.aborted) {
      abort();
    } else {
      callback = media.requestVideoFrameCallback(inspect);
    }
  });
}
async function run(): Promise<void> {
  player?.destroy();
  samples.length = 0;
  errors.length = 0;
  active = new AbortController();
  const signal = AbortSignal.any([active.signal, AbortSignal.timeout(90000)]);
  runButton.disabled = true;
  stopButton.disabled = false;
  render("running");
  try {
    if (!Hls.isSupported() || typeof media.requestVideoFrameCallback !== "function") {
      throw new Error("This probe needs MediaSource and decoded-frame callbacks.");
    }
    const policy = {
      default: {
        maxTimeToFirstByteMs: 5000,
        maxLoadTimeMs: 10000,
        timeoutRetry: { maxNumRetry: 1, retryDelayMs: 200, maxRetryDelayMs: 200 },
        errorRetry: { maxNumRetry: 1, retryDelayMs: 200, maxRetryDelayMs: 200 },
      },
    };
    const hls = new Hls({
      autoStartLoad: false,
      startLevel: 0,
      maxBufferLength: 12,
      maxMaxBufferLength: 18,
      maxBufferSize: 6 * 1024 * 1024,
      backBufferLength: 6,
      appendTimeout: 10000,
      manifestLoadPolicy: policy,
      playlistLoadPolicy: policy,
      fragLoadPolicy: policy,
      lowLatencyMode: false,
    });
    player = hls;
    const cancel = (): void => {
      media.pause();
      hls.stopLoad();
    };
    signal.addEventListener("abort", cancel, { once: true });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (errors.length < 8) {
        errors.push(data.details);
      }
      if (data.fatal) {
        active?.abort();
      }
    });
    const parsed = new Promise<void>((resolve) => {
      hls.once(Hls.Events.MANIFEST_PARSED, () => {
        resolve();
      });
    });
    hls.loadSource(manifestUrl);
    hls.attachMedia(media);
    await bounded(parsed, signal);
    if (hls.levels.length !== 2) {
      throw new Error("Expected the two approved first-film renditions.");
    }
    hls.currentLevel = 0;
    hls.startLoad(0);
    media.muted = true;
    await bounded(media.play(), signal);
    if (!Number.isFinite(media.duration) || Math.abs(media.duration - 596.5) > 0.2) {
      throw new Error("Unexpected first-film duration.");
    }
    for (const [level, dimensions] of hls.levels.entries()) {
      hls.currentLevel = level;
      for (const target of [0, 298, 594]) {
        media.currentTime = target;
        const sample = await frameAt(level, target, dimensions.width, dimensions.height, signal);
        samples.push(sample);
        render("running");
      }
    }
    render(errors.length === 0 ? "passed" : "passed-with-recovered-errors");
    signal.removeEventListener("abort", cancel);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Probe failed.");
    render("failed");
  } finally {
    active.abort();
    media.pause();
    player?.stopLoad();
    active = undefined;
    stopButton.disabled = true;
    runButton.disabled = false;
  }
}
start.addEventListener("click", () => void run());
stop.addEventListener("click", () => active?.abort());
window.addEventListener("pagehide", () => {
  active?.abort();
  player?.destroy();
});
