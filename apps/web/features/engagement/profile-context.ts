import { createIdentityClient } from "../identity/client.ts";
import { PROFILES, VIEWER, type Profile, type Viewer } from "../identity/operations.ts";
import { playerIdentifier } from "../playback/operations.ts";
import { createEngagementClient } from "./client.ts";

export function selectedProfile(
  viewer: Viewer,
  profiles: { profiles: Profile[]; activeProfileId: string | null },
  now: number,
) {
  const expiresAt = Date.parse(viewer.expiresAt);
  if (
    !playerIdentifier(viewer.accountId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    !Array.isArray(profiles.profiles) ||
    profiles.profiles.length > 5 ||
    new Set(profiles.profiles.map((profile) => profile.id)).size !== profiles.profiles.length ||
    profiles.profiles.some((profile) => !playerIdentifier(profile.id))
  ) {
    throw new Error("Invalid profile context.");
  }
  if (profiles.activeProfileId === null) {
    return null;
  }
  const selected = profiles.profiles.find((profile) => profile.id === profiles.activeProfileId);
  if (
    !selected ||
    typeof selected.displayName !== "string" ||
    !selected.displayName.trim() ||
    Array.from(selected.displayName).length > 60 ||
    /[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u.test(selected.displayName)
  ) {
    throw new Error("Invalid selected profile.");
  }
  return { profileId: selected.id, profileName: selected.displayName, expiresAt };
}

export type PrivateProfileView =
  | { kind: "checking" | "anonymous" | "unselected" | "unavailable" | "expired" | "suspended" }
  | {
      kind: "ready";
      generation: number;
      profileId: string;
      profileName: string;
      runtime: ReturnType<typeof createEngagementClient>;
    };
interface Generation {
  identity: ReturnType<typeof createIdentityClient>;
  runtime?: ReturnType<typeof createEngagementClient>;
  cancelExpiry?: () => void;
}

// Library and watchlist controls have no unload write: invalidation discards all private work.
export function attachPrivateProfile(options: {
  visibility: EventTarget & Pick<Document, "visibilityState">;
  page: EventTarget;
  sessionChanges: EventTarget;
  onState: (state: PrivateProfileView) => void;
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
  let generationId = 0;
  const fresh = (generation: Generation) => !lifetime.signal.aborted && current === generation;
  const stop = () => {
    const old = current;
    current = undefined;
    old?.cancelExpiry?.();
    old?.runtime?.dispose();
    old?.identity.dispose();
  };
  const publish = (state: PrivateProfileView) => {
    if (!lifetime.signal.aborted) {
      options.onState(state);
    }
  };
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
      const runtime = createEngagementClient(scope, options.fetcher, now);
      generation.runtime = runtime;
      generation.cancelExpiry = schedule(
        () => {
          if (fresh(generation)) {
            stop();
            publish({ kind: "expired" });
          }
        },
        Math.max(0, Math.min(scope.expiresAt - now(), 2147483647)),
      );
      publish({
        kind: "ready",
        generation: ++generationId,
        profileId: scope.profileId,
        profileName: scope.profileName,
        runtime,
      });
    } catch {
      if (fresh(generation)) {
        stop();
        publish({ kind: "unavailable" });
      }
    }
  };
  options.sessionChanges.addEventListener(
    "message",
    (event) => {
      if ((event as MessageEvent<unknown>).data === "changed") {
        void refresh();
      }
    },
    { signal: lifetime.signal },
  );
  options.visibility.addEventListener(
    "visibilitychange",
    () => {
      void refresh();
    },
    { signal: lifetime.signal },
  );
  options.page.addEventListener(
    "pagehide",
    () => {
      stop();
      publish({ kind: "suspended" });
    },
    { signal: lifetime.signal },
  );
  options.page.addEventListener(
    "pageshow",
    () => {
      if (!current) {
        void refresh();
      }
    },
    { signal: lifetime.signal },
  );
  void refresh();
  return {
    refresh,
    dispose() {
      lifetime.abort();
      stop();
    },
  };
}
