"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector, useStore } from "react-redux";
import {
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaLoadingIndicator,
  MediaMuteButton,
  MediaPlaybackRateButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react";
import { buttonVariants } from "../../components/ui/button";
import { attachPlayerEngagement, type PlayerProgressView } from "../engagement/player-engagement";
import {
  defaultPlayerPreferences,
  playerActions,
  playerReducer,
  readPlayerPreferences,
  writePlayerPreferences,
} from "../../store/player/preferences";
import { createPlaybackClient } from "./client";
import { START_PLAYBACK, type PlayerSession } from "./operations";
import { attachPlayback, type PlaybackAdapter, type PlayerMediaState } from "./adapter";
import {
  createPlaybackExperience,
  failureMessage,
  type PlaybackExperience,
  type PlayerFailure,
} from "./experience";
import styles from "./player.module.css";

const createPlayerStore = () =>
  configureStore({ reducer: { player: playerReducer }, devTools: false });
type PlayerStore = ReturnType<typeof createPlayerStore>;
type PlayerState = ReturnType<PlayerStore["getState"]>;
type PlayerClient = ReturnType<typeof createPlaybackClient>;
const usePlayerStore = useStore.withTypes<PlayerStore>();

const progressMessages = {
  checking: "Checking saved progress. Playback remains available.",
  anonymous: "Sign in and select a profile to save progress. Anonymous playback continues.",
  unselected: "Select a profile to save progress.",
  unavailable: "Saved progress is unavailable. Playback continues; recheck to try again.",
  expired: "Session expired. Sign in again to save progress.",
  suspended: "Progress reporting paused while leaving this page.",
  idle: "Progress will be saved while you watch.",
  pending: "Progress not saved yet.",
  saving: "Saving progress…",
  saved: "Progress saved.",
  unconfirmed: "Save not confirmed. Recheck before continuing to save.",
  conflict: "Progress changed elsewhere. Recheck before continuing to save.",
} as const;

function Controls({
  session,
  experience,
  onFailure,
}: {
  session: PlayerSession;
  experience: PlaybackExperience;
  onFailure: (failure: PlayerFailure) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const adapter = useRef<PlaybackAdapter | null>(null);
  const progress = useRef<ReturnType<typeof attachPlayerEngagement> | null>(null);
  const store = usePlayerStore();
  const preferences = useSelector((state: PlayerState) => state.player.preferences);
  const [mediaState, setMediaState] = useState<PlayerMediaState | null>(null);
  const [progressState, setProgressState] = useState<PlayerProgressView>({ kind: "checking" });
  const focusPlay = useCallback((control: HTMLElement | null) => {
    control?.focus();
  }, []);
  useEffect(() => {
    if (!video.current) {
      return;
    }
    const attached = attachPlayback({
      media: video.current,
      session,
      experience,
      preferences: store.getState().player.preferences,
      onState: setMediaState,
      onFailure,
      onPreferences: (value) => {
        store.dispatch(playerActions.update(value));
      },
    });
    adapter.current = attached;
    let channel: BroadcastChannel | undefined;
    let reporting: ReturnType<typeof attachPlayerEngagement> | undefined;
    try {
      channel = new BroadcastChannel("aster.local-session");
      reporting = attachPlayerEngagement({
        media: video.current,
        session,
        page: window,
        visibility: document,
        sessionChanges: channel,
        onState: setProgressState,
      });
      progress.current = reporting;
    } catch {
      setProgressState({ kind: "unavailable" });
    }
    return () => {
      reporting?.dispose(true);
      progress.current = null;
      channel?.close();
      attached.dispose();
      adapter.current = null;
    };
  }, [session, experience, onFailure, store]);
  useEffect(() => {
    adapter.current?.setPreferences(preferences);
  }, [preferences]);

  const quality = mediaState?.qualities.includes(Number(preferences.quality))
    ? preferences.quality
    : "auto";
  return (
    <div className="space-y-4">
      <MediaController
        className={styles["controller"]}
        noVolumePref
        noMutedPref
        noSubtitlesLangPref
        defaultStreamType="on-demand"
        aria-label="Video player"
      >
        <video
          ref={video}
          slot="media"
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
          aria-label="Title video"
        />
        <MediaLoadingIndicator slot="centered-chrome" noAutohide />
        <MediaControlBar>
          <MediaPlayButton ref={focusPlay} />
          <MediaSeekBackwardButton seekOffset={10} />
          <MediaSeekForwardButton seekOffset={10} />
          <MediaTimeRange />
          <MediaTimeDisplay showDuration />
        </MediaControlBar>
        <MediaControlBar>
          <MediaMuteButton />
          <MediaVolumeRange />
          <MediaPlaybackRateButton rates={[0.5, 0.75, 1, 1.25, 1.5, 2]} />
          <MediaFullscreenButton />
        </MediaControlBar>
        <MediaControlBar className={styles["choices"]}>
          <label className="flex items-center gap-3">
            Quality
            <select
              className={styles["select"]}
              value={quality}
              onChange={(event) => {
                store.dispatch(
                  playerActions.update({
                    quality: event.target.value === "auto" ? "auto" : Number(event.target.value),
                  }),
                );
              }}
              disabled={!mediaState?.qualities.length}
            >
              <option value="auto">Auto</option>
              {mediaState?.qualities.map((height) => (
                <option key={height} value={height}>
                  {height}p
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3">
            Caption track
            <select
              className={styles["select"]}
              value={mediaState?.captions.find((track) => track.selected)?.index ?? -1}
              disabled={!mediaState?.captions.length}
              onChange={(event) => adapter.current?.selectCaption(Number(event.target.value))}
            >
              <option value={-1}>Off</option>
              {mediaState?.captions.map((track) => (
                <option key={track.index} value={track.index}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>
        </MediaControlBar>
      </MediaController>
      <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <p aria-live="polite" aria-atomic="true">
          {progressState.kind === "ready"
            ? `${progressState.profileName}: ${progressMessages[progressState.status]}`
            : progressMessages[progressState.kind]}
        </p>
        {progressState.kind === "ready" && progressState.resumeSeconds !== null ? (
          <button
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              progress.current?.resume();
            }}
          >
            Resume at {Math.floor(progressState.resumeSeconds / 60)}:
            {String(Math.floor(progressState.resumeSeconds % 60)).padStart(2, "0")}
          </button>
        ) : null}
        {progressState.kind !== "checking" ? (
          <button
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              void progress.current?.refresh();
            }}
          >
            Recheck saved progress
          </button>
        ) : null}
      </div>
      {mediaState?.mode === "native" ? (
        <p className="text-sm text-muted-foreground">
          Native HLS: the browser selects video quality automatically.
        </p>
      ) : null}
      {mediaState && !mediaState.captions.length ? (
        <p className="text-sm text-muted-foreground">
          This publication provides no selectable captions.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Tab through the controls; Space or Enter activates the focused button. Arrow keys adjust
        focused sliders. Escape exits fullscreen. If playback does not start, press Play.
      </p>
    </div>
  );
}

function SessionPlayer({ titleId, runtime }: { titleId: string; runtime: PlayerClient }) {
  const inFlight = useRef(false);
  const [createSession, { data, loading, reset }] = useMutation(START_PLAYBACK, {
    client: runtime.client,
    fetchPolicy: "no-cache",
  });
  const [failure, setFailure] = useState<PlayerFailure | null>(null);
  const [captionWarning, setCaptionWarning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [experience, setExperience] = useState<PlaybackExperience | null>(null);
  const onFailure = useCallback((value: PlayerFailure) => {
    if (value === "caption") {
      setCaptionWarning(true);
    } else {
      setFailure(value);
    }
  }, []);
  const begin = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    reset();
    setFailure(null);
    setCaptionWarning(false);
    setReport(null);
    const measurement = createPlaybackExperience();
    const started = performance.now();
    setExperience(measurement);
    try {
      const result = await createSession({ variables: { titleId } });
      const completed = result.data?.createPlaybackSession.code === "COMPLETED";
      measurement.record(completed ? "session_success" : "session_failure", {
        durationMs: performance.now() - started,
      });
      if (!completed) {
        setFailure(
          result.data?.createPlaybackSession.code === "NOT_PLAYABLE" ? "not-playable" : "session",
        );
      }
    } catch {
      measurement.record("session_failure", { durationMs: performance.now() - started });
      setFailure("session");
    } finally {
      inFlight.current = false;
    }
  };
  const session = !loading && !failure ? data?.createPlaybackSession.session : null;
  return (
    <section aria-label="Playback" className="space-y-5">
      {session && experience ? (
        <Controls session={session} experience={experience} onFailure={onFailure} />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-5 rounded-xl border border-border bg-black p-6 text-center">
          <p className="eyebrow">READY WHEN YOU ARE</p>
          {failure ? (
            <p role="alert" className="max-w-lg text-sm">
              {failureMessage[failure]}
            </p>
          ) : (
            <p className="max-w-lg text-sm text-muted-foreground">
              Start an anonymous session to check current availability and load this video.
            </p>
          )}
          <button
            className={buttonVariants()}
            disabled={loading}
            onClick={() => {
              void begin();
            }}
          >
            {loading
              ? "Checking availability…"
              : failure
                ? "Start a new session"
                : "Start playback"}
          </button>
        </div>
      )}
      {captionWarning ? (
        <p role="status" className="text-sm">
          {failureMessage.caption}
        </p>
      ) : null}
      {experience ? (
        <div className="space-y-3">
          <button
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              setReport(JSON.stringify(experience.snapshot(), null, 2));
            }}
          >
            Show local playback measurements
          </button>
          <p className="text-xs text-muted-foreground">
            These playback measurements keep up to 64 events in memory only, without identifiers or
            media URLs. Saved viewing progress is separate and requires a selected profile.
          </p>
          {report !== null ? (
            <pre
              aria-label="Local playback measurements"
              className="max-h-64 overflow-auto rounded-lg border border-border p-4 text-xs"
            >
              {report}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function Player({ titleId }: { titleId: string }) {
  const [store] = useState(createPlayerStore);
  const [runtime, setRuntime] = useState<PlayerClient | null>(null);
  useEffect(() => {
    let preferences = { ...defaultPlayerPreferences };
    try {
      preferences = readPlayerPreferences(window.localStorage);
    } catch {
      /* Storage access may be disabled. */
    }
    store.dispatch(playerActions.restore(preferences));
    const unsubscribe = store.subscribe(() => {
      try {
        writePlayerPreferences(window.localStorage, store.getState().player.preferences);
      } catch {
        /* Playback does not require storage. */
      }
    });
    const client = createPlaybackClient();
    setRuntime(client);
    return () => {
      unsubscribe();
      client.dispose();
    };
  }, [store]);
  return (
    <Provider store={store}>
      {runtime ? (
        <SessionPlayer titleId={titleId} runtime={runtime} />
      ) : (
        <p role="status">Preparing player…</p>
      )}
    </Provider>
  );
}
