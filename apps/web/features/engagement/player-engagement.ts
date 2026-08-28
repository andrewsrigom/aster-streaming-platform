import { createIdentityClient } from "../identity/client.ts";
import { PROFILES, VIEWER } from "../identity/operations.ts";
import type { PlayerSession } from "../playback/operations.ts";
import { createEngagementClient } from "./client.ts";
import { attachMediaProgress } from "./media-progress.ts";
import { PLAYER_PROGRESS, RECORD_PROGRESS } from "./operations.ts";
import { createProgressReporter, type ProgressSaveStatus } from "./progress-reporter.ts";
import { selectedProfile } from "./profile-context.ts";

export type PlayerProgressView =
  | Readonly<{
      kind: "checking" | "anonymous" | "unselected" | "unavailable" | "expired" | "suspended";
    }>
  | Readonly<{
      kind: "ready";
      profileName: string;
      status: ProgressSaveStatus;
      resumeSeconds: number | null;
    }>;
interface Generation {
  identity: ReturnType<typeof createIdentityClient>;
  engagement?: ReturnType<typeof createEngagementClient>;
  media?: ReturnType<typeof attachMediaProgress>;
  cancelExpiry?: () => void;
}
export function attachPlayerEngagement(options: {
  media: Parameters<typeof attachMediaProgress>[0]["media"];
  session: PlayerSession;
  page: EventTarget;
  visibility: EventTarget & Pick<Document, "visibilityState">;
  sessionChanges: EventTarget;
  onState: (state: PlayerProgressView) => void;
  fetcher?: typeof fetch;
  now?: () => number;
  schedule?: (work: () => void, delayMs: number) => () => void;
}) {
  const now = options.now ?? Date.now;
  const schedule =
    options.schedule ??
    ((work, delayMs) => {
      const timer = setTimeout(work, delayMs);
      return () => {
        clearTimeout(timer);
      };
    });
  const lifetime = new AbortController();
  let current: Generation | undefined;
  let view: PlayerProgressView | undefined;
  const publish = (next: PlayerProgressView) => {
    if (!lifetime.signal.aborted && JSON.stringify(view) !== JSON.stringify(next)) {
      view = next;
      options.onState(next);
    }
  };
  const stop = (finalAttempt = false) => {
    const previous = current;
    current = undefined;
    previous?.cancelExpiry?.();
    previous?.media?.dispose(finalAttempt);
    previous?.engagement?.dispose(finalAttempt);
    previous?.identity.dispose();
  };
  const fresh = (generation: Generation) => !lifetime.signal.aborted && current === generation;
  const refresh = async () => {
    if (lifetime.signal.aborted) {
      return;
    }
    stop();
    if (options.visibility.visibilityState !== "visible") {
      publish({ kind: "suspended" });
      return;
    }
    publish({ kind: "checking" });
    const generation: Generation = { identity: createIdentityClient(options.fetcher) };
    current = generation;
    try {
      const viewer = await generation.identity.client.query({
        query: VIEWER,
        fetchPolicy: "network-only",
      });
      if (!fresh(generation)) {
        return;
      }
      if (viewer.data?.me === null) {
        stop();
        publish({ kind: "anonymous" });
        return;
      }
      if (!viewer.data?.me) {
        throw new Error("Missing viewer.");
      }
      const owned = await generation.identity.client.query({
        query: PROFILES,
        fetchPolicy: "network-only",
      });
      if (!fresh(generation)) {
        return;
      }
      if (!owned.data?.profiles) {
        throw new Error("Missing profiles.");
      }
      const scope = selectedProfile(viewer.data.me, owned.data.profiles, now());
      if (!scope) {
        stop();
        publish({ kind: "unselected" });
        return;
      }
      const expire = () => {
        if (fresh(generation)) {
          stop();
          publish({ kind: "expired" });
        }
      };
      generation.cancelExpiry = schedule(expire, Math.min(scope.expiresAt - now(), 2147483647));
      const engagement = createEngagementClient(scope, options.fetcher, now);
      generation.engagement = engagement;
      const result = await engagement.client.query({
        query: PLAYER_PROGRESS,
        variables: { profileId: scope.profileId, titleId: options.session.titleId },
      });
      if (!fresh(generation)) {
        return;
      }
      if (now() >= scope.expiresAt) {
        expire();
        return;
      }
      if (!result.data?.profile) {
        throw new Error("Missing progress response.");
      }
      let status: ProgressSaveStatus = "idle";
      let resumeSeconds: number | null = null;
      const notify = () => {
        if (fresh(generation)) {
          if (now() >= scope.expiresAt) {
            expire();
          } else {
            publish({ kind: "ready", profileName: scope.profileName, status, resumeSeconds });
          }
        }
      };
      const reporter = createProgressReporter({
        profileId: scope.profileId,
        titleId: options.session.titleId,
        playbackSessionId: options.session.id,
        sequence: result.data.profile.progress?.sequence ?? 0,
        now,
        schedule,
        async save(input, signal) {
          const response = await engagement.client.mutate({
            mutation: RECORD_PROGRESS,
            variables: { input },
            context: { fetchOptions: { signal } },
          });
          const outcome = response.data?.recordProgress;
          if (!outcome) {
            return { code: "INDETERMINATE" };
          }
          if (outcome.code === "COMPLETED") {
            if (!outcome.progress) {
              return { code: "INDETERMINATE" };
            }
            return { code: "COMPLETED", sequence: outcome.progress.sequence };
          }
          return { code: outcome.code };
        },
        finish: (input) => {
          engagement.finish(input);
        },
        onStatus: (next) => {
          status = next;
          notify();
        },
      });
      if (!fresh(generation)) {
        reporter.dispose();
        return;
      }
      generation.media = attachMediaProgress({
        media: options.media,
        reporter,
        saved: result.data.profile.progress,
        onResumeAvailable: (seconds) => {
          resumeSeconds = seconds;
          notify();
        },
      });
    } catch {
      if (fresh(generation)) {
        stop();
        publish({ kind: "unavailable" });
      }
    }
  };
  const listen = (target: EventTarget, event: string, handler: EventListener) => {
    target.addEventListener(event, handler, { signal: lifetime.signal });
  };
  listen(options.sessionChanges, "message", (event) => {
    if ((event as MessageEvent<unknown>).data === "changed") {
      void refresh();
    }
  });
  listen(options.visibility, "visibilitychange", () => {
    if (options.visibility.visibilityState === "visible") {
      void refresh();
    } else {
      current?.media?.flush();
    }
  });
  listen(options.page, "pagehide", () => {
    stop(true);
    publish({ kind: "suspended" });
  });
  listen(options.page, "pageshow", () => {
    if (!current) {
      void refresh();
    }
  });
  void refresh();
  return {
    refresh,
    resume: () => current?.media?.resume() ?? false,
    dispose(finalAttempt = false) {
      if (!lifetime.signal.aborted) {
        lifetime.abort();
        stop(finalAttempt);
      }
    },
  };
}
