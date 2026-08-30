import assert from "node:assert/strict";
import test from "node:test";
import Hls from "hls.js";
import {
  attachPlayback,
  playerHlsConfig,
  type PlayerMediaState,
} from "../features/playback/adapter.ts";
import { createPlaybackExperience, type PlayerFailure } from "../features/playback/experience.ts";
import { defaultPlayerPreferences } from "../store/player/preferences.ts";

class Tracks extends EventTarget {
  items: { kind: string; label: string; language: string; mode: string }[] = [];
  [Symbol.iterator]() {
    return this.items.values();
  }
}
class Video extends EventTarget {
  textTracks = new Tracks();
  volume = 1;
  muted = false;
  playbackRate = 1;
  src = "";
  currentTime = 0;
  readyState = 4;
  paused = false;
  seeking = false;
  native = "";
  loads = 0;
  pauses = 0;
  cancelledFrames = 0;
  frame: (() => void) | undefined;
  canPlayType() {
    return this.native;
  }
  load() {
    this.loads++;
  }
  pause() {
    this.pauses++;
  }
  play() {
    return Promise.resolve();
  }
  removeAttribute() {
    this.src = "";
  }
  requestVideoFrameCallback(callback: () => void) {
    this.frame = callback;
    return 7;
  }
  cancelVideoFrameCallback(id: number) {
    assert.equal(id, 7);
    this.cancelledFrames++;
  }
}
function fixture(supported = true) {
  const media = new Video();
  const failures: PlayerFailure[] = [];
  const states: PlayerMediaState[] = [];
  const preferences: unknown[] = [];
  let clock = 1000;
  const experience = createPlaybackExperience(() => clock);
  const instances: FakeHls[] = [];
  class FakeHls {
    static isSupported() {
      return supported;
    }
    levels = [{ height: 240 }, { height: 358 }];
    subtitleTracks = [];
    subtitleDisplay = true;
    levelValue = -1;
    autoLevelEnabled = true;
    selections = 0;
    get currentLevel() {
      return this.levelValue;
    }
    set currentLevel(value: number) {
      this.levelValue = value;
      this.autoLevelEnabled = value === -1;
      this.selections++;
    }
    started = 0;
    stopped = 0;
    destroyed = 0;
    source = "";
    attached = false;
    config: Partial<Hls["config"]>;
    callbacks = new Map<string, (event: string, data: unknown) => void>();
    constructor(config: Partial<Hls["config"]>) {
      this.config = config;
      instances.push(this);
    }
    on(event: string, callback: (event: string, data: unknown) => void) {
      this.callbacks.set(event, callback);
    }
    emit(event: string, data: unknown = {}) {
      this.callbacks.get(event)?.(event, data);
    }
    loadSource(source: string) {
      this.source = source;
    }
    attachMedia() {
      this.attached = true;
    }
    startLoad() {
      this.started++;
    }
    stopLoad() {
      this.stopped++;
    }
    destroy() {
      this.destroyed++;
    }
  }
  const options = {
    media: media as unknown as HTMLVideoElement,
    session: {
      id: "10000000-0000-4000-8000-000000080001",
      titleId: "00000000-0000-4000-8000-000000080001",
      manifestUrl:
        "http://127.0.0.1:9001/aster-media-published/publications/" +
        "a".repeat(64) +
        "/master.m3u8",
      expiresAt: 2,
    },
    preferences: { ...defaultPlayerPreferences },
    experience,
    onState: (state: PlayerMediaState) => {
      states.push(state);
    },
    onFailure: (failure: PlayerFailure) => {
      failures.push(failure);
    },
    onPreferences: (value: unknown) => {
      preferences.push(value);
    },
    hlsClass: FakeHls as unknown as typeof Hls,
    now: () => clock,
  };
  return {
    media,
    failures,
    states,
    preferences,
    experience,
    options,
    hls: () => {
      const instance = instances[0];
      assert.ok(instance);
      return instance;
    },
    hasHls: () => instances.length > 0,
    time: (value: number) => {
      clock = value;
    },
  };
}

test("initial caption preference hides HLS cues without dropping a default track", () => {
  const f = fixture();
  const adapter = attachPlayback(f.options);
  assert.equal(f.hls().subtitleDisplay, false);
  adapter.dispose();
  const enabled = fixture();
  const second = attachPlayback({
    ...enabled.options,
    preferences: { ...defaultPlayerPreferences, captions: "on" },
  });
  assert.equal(enabled.hls().subtitleDisplay, true);
  second.dispose();
});

test("every HLS request class has finite deadlines/retry and bounded buffers", () => {
  const config = playerHlsConfig();
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith("LoadPolicy")) {
      const policy = value as {
        default: {
          maxLoadTimeMs: number;
          errorRetry: { maxNumRetry: number };
          timeoutRetry: { maxNumRetry: number };
        };
      };
      assert.equal(policy.default.maxLoadTimeMs, 10000);
      assert.equal(policy.default.errorRetry.maxNumRetry, 1);
      assert.equal(policy.default.timeoutRetry.maxNumRetry, 1);
    }
  }
  assert.equal(config.maxBufferSize, 12 * 1024 * 1024);
  assert.equal(config.backBufferLength, 6);
  assert.equal(config.maxMaxBufferLength, 24);
  assert.equal(config.autoStartLoad, false);
});

test("adaptive media reports actual frame, switches, captions and completion without URLs", () => {
  const f = fixture();
  const adapter = attachPlayback(f.options);
  try {
    assert.equal(f.hls().source, f.options.session.manifestUrl);
    assert.equal(f.hls().started, 0);
    f.hls().emit(Hls.Events.MANIFEST_PARSED);
    assert.equal(f.hls().started, 1);
    assert.deepEqual(f.states.at(-1)?.qualities, [240, 358]);
    assert.equal(f.media.volume, 0.8);
    f.hls().levelValue = 0;
    adapter.setPreferences({ ...defaultPlayerPreferences, muted: true });
    assert.equal(
      f.hls().selections,
      0,
      "volume/mute changes must not flush an automatic rendition",
    );
    adapter.setPreferences({ ...defaultPlayerPreferences, quality: 358 });
    assert.equal(f.hls().currentLevel, 1);
    f.hls().emit(Hls.Events.LEVEL_SWITCHED, { level: 1 });
    assert.ok(f.media.frame);
    f.media.frame();
    assert.ok(f.media.frame);
    f.media.frame();
    f.media.dispatchEvent(new Event("waiting"));
    f.time(1010);
    f.media.dispatchEvent(new Event("pause"));
    f.media.dispatchEvent(new Event("playing"));
    f.media.dispatchEvent(new Event("waiting"));
    f.time(1020);
    f.media.seeking = true;
    f.media.dispatchEvent(new Event("seeking"));
    f.media.seeking = false;
    f.media.dispatchEvent(new Event("playing"));
    f.media.dispatchEvent(new Event("waiting"));
    f.time(1055);
    f.media.dispatchEvent(new Event("playing"));
    f.media.textTracks.items.push({
      kind: "subtitles",
      language: "en",
      label: "English",
      mode: "disabled",
    });
    f.media.textTracks.dispatchEvent(new Event("addtrack"));
    adapter.selectCaption(0);
    assert.equal(f.media.textTracks.items[0]?.mode, "showing");
    assert.equal(f.states.at(-1)?.captions[0]?.selected, true);
    adapter.selectCaption(-1);
    assert.equal(f.media.textTracks.items[0].mode, "hidden");
    f.media.dispatchEvent(new Event("ended"));
    assert.deepEqual(
      f.experience.snapshot().map(({ event }) => event),
      ["manifest_loaded", "rendition_switch", "first_frame", "rebuffer", "completion"],
    );
    assert.deepEqual(f.experience.summary(), {
      firstFrame: "succeeded",
      firstFrameDurationMs: f.experience.summary().firstFrameDurationMs,
      rebufferCount: 1,
      rebufferDurationMs: 35,
      eventCount: 5,
      truncated: false,
    });
    assert.doesNotMatch(JSON.stringify(f.experience.snapshot()), /https?:|titleId|sessionId/);
  } finally {
    adapter.dispose();
  }
});

test("expiry before attachment and after a throttled timer fails closed", () => {
  const expired = fixture();
  expired.time(2000);
  attachPlayback(expired.options).dispose();
  assert.equal(expired.hasHls(), false);
  assert.deepEqual(expired.failures, ["expired"]);
  const active = fixture();
  const adapter = attachPlayback(active.options);
  active.time(2001);
  active.media.dispatchEvent(new Event("play"));
  assert.deepEqual(active.failures, ["expired"]);
  assert.equal(active.hls().destroyed, 1);
  adapter.dispose();
});

test("expiry timer destroys loads and does not allow late callbacks", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  const adapter = attachPlayback(f.options);
  context.mock.timers.tick(1001);
  f.hls().emit(Hls.Events.MANIFEST_PARSED);
  assert.ok(f.media.frame);
  f.media.frame();
  adapter.setPreferences({ ...defaultPlayerPreferences, quality: 240 });
  adapter.dispose();
  assert.deepEqual(f.failures, ["expired"]);
  assert.equal(f.hls().started, 0);
  assert.equal(f.hls().destroyed, 1);
  assert.equal(f.hls().stopped, 1);
  assert.equal(f.media.cancelledFrames, 1);
  assert.equal(f.media.src, "");
  assert.equal(f.states.length, 0);
});

test("native fallback exposes automatic quality and unsupported media stops", () => {
  const f = fixture(false);
  f.media.native = "probably";
  const adapter = attachPlayback(f.options);
  f.media.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.states.at(-1)?.mode, "native");
  assert.deepEqual(f.states.at(-1)?.qualities, []);
  assert.equal(f.media.src, f.options.session.manifestUrl);
  adapter.dispose();
  const unsupported = fixture(false);
  attachPlayback(unsupported.options).dispose();
  assert.deepEqual(unsupported.failures, ["unsupported"]);
});

test("caption errors are visible but finite fatal errors tear down once", () => {
  const f = fixture();
  const adapter = attachPlayback(f.options);
  f.hls().emit(Hls.Events.ERROR, {
    fatal: false,
    type: "networkError",
    details: "subtitleLoadError",
  });
  assert.deepEqual(f.failures, ["caption"]);
  assert.equal(f.hls().destroyed, 0);
  f.hls().emit(Hls.Events.ERROR, {
    fatal: true,
    type: "networkError",
    details: "manifestLoadError",
  });
  f.hls().emit(Hls.Events.ERROR, {
    fatal: true,
    type: "networkError",
    details: "fragmentLoadError",
  });
  adapter.dispose();
  assert.deepEqual(f.failures, ["caption", "manifest"]);
  assert.equal(f.hls().destroyed, 1);
});

test("fatal failure closes one active rebuffer interval before teardown", () => {
  const f = fixture();
  const adapter = attachPlayback(f.options);
  f.hls().emit(Hls.Events.MANIFEST_PARSED);
  assert.ok(f.media.frame);
  f.media.frame();
  f.media.dispatchEvent(new Event("waiting"));
  f.time(1125);
  f.hls().emit(Hls.Events.ERROR, {
    fatal: true,
    type: "networkError",
    details: "fragmentLoadError",
  });
  adapter.dispose();
  assert.deepEqual(f.experience.summary(), {
    firstFrame: "succeeded",
    firstFrameDurationMs: f.experience.summary().firstFrameDurationMs,
    rebufferCount: 1,
    rebufferDurationMs: 125,
    eventCount: 4,
    truncated: false,
  });
  assert.deepEqual(
    f.experience.snapshot().map(({ event }) => event),
    ["manifest_loaded", "first_frame", "rebuffer", "fatal_error"],
  );
});

test("an unresponsive origin has a finite startup deadline", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.options.session.expiresAt = 900;
  const adapter = attachPlayback(f.options);
  context.mock.timers.tick(22001);
  assert.deepEqual(f.failures, ["network"]);
  assert.equal(f.hls().destroyed, 1);
  adapter.dispose();
});
