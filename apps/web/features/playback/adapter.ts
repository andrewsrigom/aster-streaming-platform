import Hls, { type HlsConfig, type LoadPolicy } from "hls.js";
import type { PlayerPreferences } from "../../store/player/preferences.ts";
import {
  classifyPlayerFailure,
  type PlaybackExperience,
  type PlayerFailure,
} from "./experience.ts";
import { playerManifestUrl, type PlayerSession } from "./operations.ts";

const loadPolicy = (): LoadPolicy => ({
  default: {
    maxTimeToFirstByteMs: 5000,
    maxLoadTimeMs: 10000,
    timeoutRetry: { maxNumRetry: 1, retryDelayMs: 200, maxRetryDelayMs: 200 },
    errorRetry: { maxNumRetry: 1, retryDelayMs: 200, maxRetryDelayMs: 200 },
  },
});

export function playerHlsConfig(): Partial<HlsConfig> {
  return {
    autoStartLoad: false,
    maxBufferLength: 18,
    maxMaxBufferLength: 24,
    maxBufferSize: 12 * 1024 * 1024,
    backBufferLength: 6,
    appendTimeout: 10000,
    lowLatencyMode: false,
    manifestLoadPolicy: loadPolicy(),
    playlistLoadPolicy: loadPolicy(),
    fragLoadPolicy: loadPolicy(),
    keyLoadPolicy: loadPolicy(),
    certLoadPolicy: loadPolicy(),
    steeringManifestLoadPolicy: loadPolicy(),
    interstitialAssetListLoadPolicy: loadPolicy(),
  };
}

export interface PlayerMediaState {
  mode: "hls" | "native";
  qualities: number[];
  captions: { index: number; label: string; selected: boolean }[];
}

export function attachPlayback(options: {
  media: HTMLVideoElement;
  session: PlayerSession;
  preferences: PlayerPreferences;
  experience: PlaybackExperience;
  onState: (state: PlayerMediaState) => void;
  onFailure: (failure: PlayerFailure) => void;
  onPreferences: (value: Partial<PlayerPreferences>) => void;
  hlsClass?: typeof Hls;
  now?: () => number;
}) {
  const { media, session, experience, onState, onFailure, onPreferences } = options;
  const HlsClass = options.hlsClass ?? Hls;
  const now = options.now ?? Date.now;
  const started = performance.now();
  const supportsFrameCallback =
    typeof Reflect.get(media, "requestVideoFrameCallback") === "function";
  const lifetime = new AbortController();
  let preferences = { ...options.preferences };
  let hls: Hls | undefined;
  let disposed = false;
  let firstFrame = false;
  let frameCallback: number | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const state: PlayerMediaState = { mode: "hls", qualities: [], captions: [] };

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    lifetime.abort();
    clearTimeout(expiryTimer);
    clearTimeout(loadTimer);
    clearTimeout(stallTimer);
    if (frameCallback !== undefined) {
      media.cancelVideoFrameCallback(frameCallback);
    }
    hls?.stopLoad();
    hls?.destroy();
    media.pause();
    media.removeAttribute("src");
    media.load();
  };
  const fail = (failure: PlayerFailure) => {
    if (disposed) {
      return;
    }
    if (failure !== "caption") {
      experience.record("fatal_error", { error: failure });
      dispose();
    }
    onFailure(failure);
  };
  const live = () => {
    if (!disposed && now() >= session.expiresAt * 1000) {
      fail("expired");
    }
    return !disposed;
  };
  const notify = () => {
    if (!live()) {
      return;
    }
    const tracks = Array.from(media.textTracks);
    if (tracks.length > 16) {
      fail("caption");
      return;
    }
    state.captions = tracks.flatMap((track, index) =>
      track.kind === "captions" || track.kind === "subtitles"
        ? [
            {
              index,
              label: (track.label || track.language || `Track ${index + 1}`)
                .replace(/[\p{Cc}\p{Cs}]/gu, "")
                .slice(0, 64),
              selected: track.mode === "showing",
            },
          ]
        : [],
    );
    onState({ ...state, qualities: [...state.qualities], captions: [...state.captions] });
  };
  const applyPreferences = () => {
    if (!live()) {
      return;
    }
    if (media.volume !== preferences.volume) {
      media.volume = preferences.volume;
    }
    if (media.muted !== preferences.muted) {
      media.muted = preferences.muted;
    }
    if (media.playbackRate !== preferences.rate) {
      media.playbackRate = preferences.rate;
    }
    if (hls && hls.levels.length) {
      const level =
        preferences.quality === "auto"
          ? -1
          : hls.levels.findIndex(({ height }) => height === preferences.quality);
      if (
        level === -1 ? !hls.autoLevelEnabled : hls.autoLevelEnabled || hls.currentLevel !== level
      ) {
        hls.currentLevel = level;
      }
    }
    const tracks = Array.from(media.textTracks)
      .filter((track) => track.kind === "captions" || track.kind === "subtitles")
      .slice(0, 16);
    if (hls) {
      hls.subtitleDisplay = preferences.captions === "on";
    }
    if (preferences.captions === "off") {
      for (const track of tracks) {
        if (!hls || track.mode === "showing") {
          track.mode = hls ? "hidden" : "disabled";
        }
      }
    } else if (!tracks.some((track) => track.mode === "showing") && tracks[0]) {
      (tracks.find((track) => track.mode === "hidden") ?? tracks[0]).mode = "showing";
    }
    notify();
  };
  const decoded = () => {
    if (!live() || firstFrame) {
      return;
    }
    firstFrame = true;
    experience.record("first_frame", { durationMs: performance.now() - started });
  };
  const metadata = () => {
    if (!live()) {
      return;
    }
    clearTimeout(loadTimer);
    experience.record("manifest_loaded", { durationMs: performance.now() - started });
    applyPreferences();
    // User activation can expire during a network request; the visible Play control remains usable.
    void media.play().catch(() => undefined);
  };
  const listen = (target: EventTarget, event: string, handler: () => void) => {
    target.addEventListener(event, handler, { signal: lifetime.signal });
  };

  if (!playerManifestUrl(session.manifestUrl) || !Number.isFinite(session.expiresAt)) {
    fail("session");
  } else if (!live()) {
    // An expired session never attaches a source, even if a background timer was throttled.
  } else {
    expiryTimer = setTimeout(
      () => {
        fail("expired");
      },
      Math.min(905000, session.expiresAt * 1000 - now()),
    );
    loadTimer = setTimeout(() => {
      fail("network");
    }, 22000);
    listen(media, "play", () => {
      live();
    });
    listen(media, "timeupdate", () => {
      if (live() && !supportsFrameCallback && media.currentTime > 0 && media.readyState >= 2) {
        decoded();
      }
    });
    listen(media, "playing", () => {
      if (!live()) {
        return;
      }
      clearTimeout(stallTimer);
      experience.playing();
    });
    listen(media, "waiting", () => {
      if (!live() || media.paused || media.seeking) {
        return;
      }
      experience.waiting();
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        fail("network");
      }, 22000);
    });
    listen(media, "pause", () => {
      clearTimeout(stallTimer);
    });
    listen(media, "ended", () => {
      clearTimeout(stallTimer);
      if (live()) {
        experience.record("completion");
      }
    });
    listen(media, "error", () => {
      const code = media.error?.code;
      fail(code === 2 ? "network" : code === 3 ? "decode" : code === 4 ? "unsupported" : "fatal");
    });
    listen(media, "volumechange", () => {
      if (!live()) {
        return;
      }
      preferences = { ...preferences, volume: media.volume, muted: media.muted };
      onPreferences({ volume: media.volume, muted: media.muted });
    });
    listen(media, "ratechange", () => {
      if (!live()) {
        return;
      }
      preferences = { ...preferences, rate: media.playbackRate };
      onPreferences({ rate: media.playbackRate });
    });
    listen(media.textTracks, "addtrack", applyPreferences);
    listen(media.textTracks, "removetrack", notify);
    listen(media.textTracks, "change", () => {
      if (!live()) {
        return;
      }
      const captions = Array.from(media.textTracks).some(
        (track) =>
          (track.kind === "captions" || track.kind === "subtitles") && track.mode === "showing",
      )
        ? "on"
        : "off";
      preferences = { ...preferences, captions };
      onPreferences({ captions });
      notify();
    });
    if (supportsFrameCallback) {
      frameCallback = media.requestVideoFrameCallback(decoded);
    }
    if (HlsClass.isSupported()) {
      const engine = new HlsClass(playerHlsConfig());
      // Hidden tracks retain parsed cues. Disabling a DEFAULT track mid-load can
      // make HLS.js mark its fragment buffered after dropping the cues entirely.
      engine.subtitleDisplay = preferences.captions === "on";
      hls = engine;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!live()) {
          return;
        }
        if (engine.levels.length > 16 || engine.subtitleTracks.length > 16) {
          fail("manifest");
          return;
        }
        state.qualities = [...new Set(engine.levels.map(({ height }) => height))]
          .filter((height) => Number.isInteger(height) && height >= 144 && height <= 4320)
          .sort((a, b) => a - b);
        metadata();
        if (live()) {
          engine.startLoad(0);
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        if (!live()) {
          return;
        }
        const height = engine.levels[data.level]?.height;
        experience.record("rendition_switch", height === undefined ? {} : { height });
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const failure = classifyPlayerFailure(data.type, data.details);
        if (data.fatal || failure === "caption") {
          fail(failure);
        }
      });
      hls.loadSource(session.manifestUrl);
      hls.attachMedia(media);
    } else if (media.canPlayType("application/vnd.apple.mpegurl")) {
      state.mode = "native";
      listen(media, "loadedmetadata", metadata);
      media.src = session.manifestUrl;
      media.load();
      notify();
    } else {
      fail("unsupported");
    }
  }

  return {
    dispose,
    setPreferences(value: PlayerPreferences) {
      preferences = { ...value };
      applyPreferences();
    },
    selectCaption(index: number) {
      if (!live() || !Number.isInteger(index) || index < -1 || index >= 16) {
        return;
      }
      const tracks = Array.from(media.textTracks);
      if (hls) {
        hls.subtitleDisplay = index !== -1;
      }
      for (const [trackIndex, track] of tracks.entries()) {
        if (track.kind === "captions" || track.kind === "subtitles") {
          track.mode =
            trackIndex === index
              ? "showing"
              : hls && index === -1 && track.mode !== "disabled"
                ? "hidden"
                : "disabled";
        }
      }
      preferences.captions = index === -1 ? "off" : "on";
      onPreferences({ captions: preferences.captions });
      notify();
    },
  };
}
export type PlaybackAdapter = ReturnType<typeof attachPlayback>;
