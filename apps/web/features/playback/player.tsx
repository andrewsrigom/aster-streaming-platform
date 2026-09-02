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
  playbackTelemetryPolicy,
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

function PlaybackControls({
  session,
  experience,
  onFailure,
}: {
  session: PlayerSession;
  experience: PlaybackExperience;
  onFailure: (failure: PlayerFailure) => void;
}) {
  const mediaElementRef = useRef<HTMLVideoElement>(null);
  const playbackAdapterRef = useRef<PlaybackAdapter | null>(null);
  const progressReporterRef = useRef<ReturnType<typeof attachPlayerEngagement> | null>(null);
  const playerStore = usePlayerStore();
  const preferences = useSelector((state: PlayerState) => state.player.preferences);
  const [playerMediaState, setPlayerMediaState] = useState<PlayerMediaState | null>(null);
  const [progressState, setProgressState] = useState<PlayerProgressView>({ kind: "checking" });
  const focusPlayControl = useCallback((control: HTMLElement | null) => {
    control?.focus();
  }, []);

  useEffect(() => {
    if (!mediaElementRef.current) {
      return;
    }

    const playbackAttachment = attachPlayback({
      media: mediaElementRef.current,
      session,
      experience,
      preferences: playerStore.getState().player.preferences,
      onState: setPlayerMediaState,
      onFailure,
      onPreferences: (value) => {
        playerStore.dispatch(playerActions.update(value));
      },
    });
    playbackAdapterRef.current = playbackAttachment;

    let sessionChangeChannel: BroadcastChannel | undefined;
    let progressReporting: ReturnType<typeof attachPlayerEngagement> | undefined;
    try {
      sessionChangeChannel = new BroadcastChannel("aster.local-session");
      progressReporting = attachPlayerEngagement({
        media: mediaElementRef.current,
        session,
        page: window,
        visibility: document,
        sessionChanges: sessionChangeChannel,
        onState: setProgressState,
      });
      progressReporterRef.current = progressReporting;
    } catch {
      setProgressState({ kind: "unavailable" });
    }

    return () => {
      progressReporting?.dispose(true);
      progressReporterRef.current = null;
      sessionChangeChannel?.close();
      playbackAttachment.dispose();
      playbackAdapterRef.current = null;
    };
  }, [session, experience, onFailure, playerStore]);

  useEffect(() => {
    playbackAdapterRef.current?.setPreferences(preferences);
  }, [preferences]);

  const selectedQuality = playerMediaState?.qualities.includes(Number(preferences.quality))
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
          ref={mediaElementRef}
          slot="media"
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
          aria-label="Title video"
        />
        <MediaLoadingIndicator slot="centered-chrome" noAutohide />
        <MediaControlBar>
          <MediaPlayButton ref={focusPlayControl} />
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
              value={selectedQuality}
              onChange={(event) => {
                playerStore.dispatch(
                  playerActions.update({
                    quality: event.target.value === "auto" ? "auto" : Number(event.target.value),
                  }),
                );
              }}
              disabled={!playerMediaState?.qualities.length}
            >
              <option value="auto">Auto</option>
              {playerMediaState?.qualities.map((height) => (
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
              value={playerMediaState?.captions.find((track) => track.selected)?.index ?? -1}
              disabled={!playerMediaState?.captions.length}
              onChange={(event) =>
                playbackAdapterRef.current?.selectCaption(Number(event.target.value))
              }
            >
              <option value={-1}>Off</option>
              {playerMediaState?.captions.map((track) => (
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
              progressReporterRef.current?.resume();
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
              void progressReporterRef.current?.refresh();
            }}
          >
            Recheck saved progress
          </button>
        ) : null}
      </div>
      {playerMediaState?.mode === "native" ? (
        <p className="text-sm text-muted-foreground">
          Native HLS: the browser selects video quality automatically.
        </p>
      ) : null}
      {playerMediaState && !playerMediaState.captions.length ? (
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

function playbackSessionFailure(resultCode: string | undefined): PlayerFailure | undefined {
  if (resultCode === "COMPLETED") {
    return undefined;
  }
  if (resultCode === "NOT_PLAYABLE") {
    return "not-playable";
  }
  return "session";
}

function PlaybackSessionFlow({
  titleId,
  playbackClient,
}: {
  titleId: string;
  playbackClient: PlayerClient;
}) {
  const sessionRequestInFlight = useRef(false);
  const playbackExperienceRef = useRef<PlaybackExperience | null>(null);
  const [createPlaybackSession, { data: sessionResponse, loading, reset }] = useMutation(
    START_PLAYBACK,
    {
      client: playbackClient.client,
      fetchPolicy: "no-cache",
    },
  );
  const [playbackFailure, setPlaybackFailure] = useState<PlayerFailure | null>(null);
  const [hasCaptionWarning, setHasCaptionWarning] = useState(false);
  const [measurementReport, setMeasurementReport] = useState<string | null>(null);
  const [playbackExperience, setPlaybackExperience] = useState<PlaybackExperience | null>(null);
  const handlePlaybackFailure = useCallback((failure: PlayerFailure) => {
    if (failure === "caption") {
      setHasCaptionWarning(true);
      return;
    }

    setPlaybackFailure(failure);
  }, []);

  useEffect(
    () => () => {
      playbackExperienceRef.current?.dispose();
      playbackExperienceRef.current = null;
    },
    [],
  );

  const requestPlaybackSession = async () => {
    if (sessionRequestInFlight.current) {
      return;
    }

    sessionRequestInFlight.current = true;
    reset();
    setPlaybackFailure(null);
    setHasCaptionWarning(false);
    setMeasurementReport(null);
    playbackExperienceRef.current?.dispose();

    const playbackAttempt = createPlaybackExperience();
    const sessionRequestStartedAt = performance.now();
    playbackExperienceRef.current = playbackAttempt;
    setPlaybackExperience(playbackAttempt);

    try {
      const sessionResult = await createPlaybackSession({ variables: { titleId } });
      const sessionFailure = playbackSessionFailure(sessionResult.data?.createPlaybackSession.code);
      playbackAttempt.record(sessionFailure ? "session_failure" : "session_success", {
        durationMs: performance.now() - sessionRequestStartedAt,
        ...(sessionFailure ? { error: sessionFailure } : {}),
      });
      if (sessionFailure) {
        setPlaybackFailure(sessionFailure);
      }
    } catch {
      playbackAttempt.record("session_failure", {
        durationMs: performance.now() - sessionRequestStartedAt,
        error: "session",
      });
      setPlaybackFailure("session");
    } finally {
      sessionRequestInFlight.current = false;
    }
  };

  const activeSession =
    !loading && !playbackFailure ? sessionResponse?.createPlaybackSession.session : null;
  let sessionActionLabel = "Start playback";
  if (loading) {
    sessionActionLabel = "Checking availability…";
  } else if (playbackFailure) {
    sessionActionLabel = "Start a new session";
  }

  return (
    <section aria-label="Playback" className="space-y-5">
      {activeSession && playbackExperience ? (
        <PlaybackControls
          session={activeSession}
          experience={playbackExperience}
          onFailure={handlePlaybackFailure}
        />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-5 rounded-xl border border-border bg-black p-6 text-center">
          <p className="eyebrow">READY WHEN YOU ARE</p>
          {playbackFailure ? (
            <p role="alert" className="max-w-lg text-sm">
              {failureMessage[playbackFailure]}
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
              void requestPlaybackSession();
            }}
          >
            {sessionActionLabel}
          </button>
        </div>
      )}
      {hasCaptionWarning ? (
        <p role="status" className="text-sm">
          {failureMessage.caption}
        </p>
      ) : null}
      {playbackExperience ? (
        <div className="space-y-3">
          <button
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              setMeasurementReport(
                JSON.stringify(
                  {
                    policy: playbackTelemetryPolicy,
                    summary: playbackExperience.summary(),
                    events: playbackExperience.snapshot(),
                  },
                  null,
                  2,
                ),
              );
            }}
          >
            Show local playback measurements
          </button>
          <p className="text-xs text-muted-foreground">
            Every local attempt keeps up to 64 events until retry or page exit. Nothing is sent or
            stored, and identifiers and media URLs are excluded. Saved viewing progress is separate
            and requires a selected profile.
          </p>
          {measurementReport !== null ? (
            <pre
              aria-label="Local playback measurements"
              className="max-h-64 overflow-auto rounded-lg border border-border p-4 text-xs"
            >
              {measurementReport}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function Player({ titleId }: { titleId: string }) {
  const [playerStore] = useState(createPlayerStore);
  const [playbackClient, setPlaybackClient] = useState<PlayerClient | null>(null);

  useEffect(() => {
    let preferences = { ...defaultPlayerPreferences };
    try {
      preferences = readPlayerPreferences(window.localStorage);
    } catch {
      /* Storage access may be disabled. */
    }
    playerStore.dispatch(playerActions.restore(preferences));

    const unsubscribeFromPreferences = playerStore.subscribe(() => {
      try {
        writePlayerPreferences(window.localStorage, playerStore.getState().player.preferences);
      } catch {
        /* Playback does not require storage. */
      }
    });
    const initializedPlaybackClient = createPlaybackClient();
    setPlaybackClient(initializedPlaybackClient);

    return () => {
      unsubscribeFromPreferences();
      initializedPlaybackClient.dispose();
    };
  }, [playerStore]);

  return (
    <Provider store={playerStore}>
      {playbackClient ? (
        <PlaybackSessionFlow key={titleId} titleId={titleId} playbackClient={playbackClient} />
      ) : (
        <p role="status">Preparing player…</p>
      )}
    </Provider>
  );
}
