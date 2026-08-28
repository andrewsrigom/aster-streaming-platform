"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApolloProvider, useApolloClient, useQuery } from "@apollo/client/react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { useShellDispatch, useShellSelector } from "../../store/shell/provider";
import { shellActions } from "../../store/shell/store";
import { createIdentityClient } from "./client";
import {
  CREATE_PROFILE,
  DEMO_SIGN_IN,
  PROFILES,
  SELECT_PROFILE,
  SIGN_OUT,
  VIEWER,
  type ProfilePreferences,
} from "./operations";

type Runtime = ReturnType<typeof createIdentityClient> & { generation: number };
type Notice = Parameters<typeof shellActions.refreshed>[0];
const notices = {
  selected: "Profile selected. Current preferences were reloaded.",
  created: "Profile created. Choose it below.",
  "signed-in": "Local session started.",
  "signed-out": "Signed out. Private cached data was discarded.",
  expired: "The session window ended. Recheck the session before continuing.",
  refresh:
    "Session refreshed. If an operation was interrupted, check the current state before trying again.",
  rejected: "The operation was not completed. Review the current profiles before trying again.",
};

export default function ProfileDialog({
  close,
  restoreFocus,
}: {
  close: () => void;
  restoreFocus: () => void;
}) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const current = useRef<Runtime | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(false);
  const dispatch = useShellDispatch();
  const notice = useShellSelector((state) => state.shell.notice);
  const busy = useShellSelector((state) => state.shell.busy);
  const replace = useCallback(
    (nextNotice: Notice) => {
      if (!mounted.current) {
        return;
      }
      const generation = (current.current?.generation ?? 0) + 1;
      current.current?.dispose();
      const next = { ...createIdentityClient(), generation };
      current.current = next;
      setRuntime(next);
      dispatch(shellActions.refreshed(nextNotice));
    },
    [dispatch],
  );
  useEffect(() => {
    mounted.current = true;
    replace(null);
    const broadcast = new BroadcastChannel("aster.local-session");
    channel.current = broadcast;
    broadcast.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === "changed") {
        replace("refresh");
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") {
        replace("refresh");
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      current.current?.dispose();
      broadcast.close();
      channel.current = null;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [replace]);
  const changed = (nextNotice: Notice) => {
    channel.current?.postMessage("changed");
    replace(nextNotice);
  };
  const expire = () => {
    if (!mounted.current) {
      return;
    }
    current.current?.dispose();
    setRuntime(null);
    dispatch(shellActions.refreshed("expired"));
  };
  return (
    <Dialog busy={busy} close={close} restoreFocus={restoreFocus}>
      {/* Persistent explicit live regions also avoid Orca's status-bar event filtering. */}
      <div aria-live="polite" aria-atomic="true" className={busy ? "mt-5 text-sm" : "text-sm"}>
        {busy ? "Saving with Identity…" : ""}
      </div>
      <div
        aria-live="polite"
        aria-atomic="true"
        className={notice ? "mt-5 rounded-md border border-border p-3 text-sm" : "text-sm"}
      >
        {notice ? notices[notice] : ""}
      </div>
      {runtime ? (
        <ApolloProvider client={runtime.client} key={runtime.generation}>
          <ProfileFlow
            runtime={runtime}
            changed={changed}
            expire={expire}
            refresh={() => {
              replace("refresh");
            }}
          />
        </ApolloProvider>
      ) : notice === "expired" ? (
        <Button
          className="mt-5"
          onClick={() => {
            replace("refresh");
          }}
        >
          Recheck session
        </Button>
      ) : (
        <p role="status" className="py-6">
          Checking local session…
        </p>
      )}
    </Dialog>
  );
}

function ProfileFlow({
  runtime,
  changed,
  expire,
  refresh,
}: {
  runtime: Runtime;
  changed: (notice: Notice) => void;
  expire: () => void;
  refresh: () => void;
}) {
  const viewer = useQuery(VIEWER);
  const profiles = useQuery(PROFILES, { skip: !viewer.data?.me });
  const client = useApolloClient();
  const dispatch = useShellDispatch();
  const { busy, step } = useShellSelector((state) => state.shell);
  const pending = useRef(false);
  const expiresAt = viewer.data?.me?.expiresAt;
  const expiryRef = useRef(expire);
  expiryRef.current = expire;
  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const duration = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(duration)) {
      expiryRef.current();
      return;
    }
    const timer = setTimeout(
      () => {
        expiryRef.current();
      },
      Math.max(0, Math.min(duration, 1800000)),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [expiresAt]);
  async function run(action: () => Promise<string | undefined>, success: Notice) {
    if (pending.current || runtime.isDisposed()) {
      return;
    }
    pending.current = true;
    dispatch(shellActions.busy(true));
    try {
      const code = await action();
      if (!runtime.isDisposed()) {
        changed(code === "COMPLETED" ? success : "rejected");
      }
    } catch {
      if (!runtime.isDisposed()) {
        changed("refresh");
      }
    } finally {
      pending.current = false;
      if (!runtime.isDisposed()) {
        dispatch(shellActions.busy(false));
      }
    }
  }
  if (viewer.loading || (viewer.data?.me && profiles.loading)) {
    return (
      <p role="status" className="py-6">
        Checking local session…
      </p>
    );
  }
  if (viewer.error || profiles.error) {
    return (
      <div className="space-y-4 py-6">
        <p role="alert">Profiles are temporarily unavailable. Public browsing still works.</p>
        <Button onClick={refresh}>Retry session</Button>
      </div>
    );
  }
  if (!viewer.data?.me) {
    return (
      <div className="space-y-4 py-6">
        <p>
          You are signed out. Start the fixed local demo session; no password or external account is
          needed.
        </p>
        <Button
          disabled={busy}
          onClick={() =>
            void run(
              async () => (await client.mutate({ mutation: DEMO_SIGN_IN })).data?.demoSignIn.code,
              "signed-in",
            )
          }
        >
          {busy ? "Starting session…" : "Start local session"}
        </Button>
      </div>
    );
  }
  const snapshot = profiles.data?.profiles;
  return (
    <div className="space-y-5 py-6" aria-busy={busy}>
      {step === "create" ? (
        <CreateProfile
          busy={busy}
          submit={(profile) =>
            void run(
              async () =>
                (
                  await client.mutate({
                    mutation: CREATE_PROFILE,
                    variables: { input: { mutationId: crypto.randomUUID(), profile } },
                  })
                ).data?.createProfile.code,
              "created",
            )
          }
          cancel={() => dispatch(shellActions.step("list"))}
        />
      ) : (
        <>
          {!snapshot?.profiles.length && <p>No profiles yet. Create one with a fictional name.</p>}
          <ul className="space-y-3" aria-label="Available profiles">
            {snapshot?.profiles.map((profile) => (
              <li key={profile.id}>
                <Button
                  className="w-full justify-between text-left"
                  variant="outline"
                  disabled={busy}
                  aria-pressed={profile.id === snapshot.activeProfileId}
                  onClick={() =>
                    void run(
                      async () =>
                        (
                          await client.mutate({
                            mutation: SELECT_PROFILE,
                            variables: { id: profile.id },
                          })
                        ).data?.selectProfile.code,
                      "selected",
                    )
                  }
                >
                  <span>
                    {profile.displayName}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {profile.locale} · {profile.maturity}
                    </span>
                  </span>
                  {profile.id === snapshot.activeProfileId && <span>Active</span>}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => dispatch(shellActions.step("create"))}>
              Create profile
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => (await client.mutate({ mutation: SIGN_OUT })).data?.signOut.code,
                  "signed-out",
                )
              }
            >
              Sign out
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function CreateProfile({
  busy,
  submit,
  cancel,
}: {
  busy: boolean;
  submit: (profile: ProfilePreferences) => void;
  cancel: () => void;
}) {
  const [name, setName] = useState("");
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [locale, setLocale] = useState("en-US");
  const [maturity, setMaturity] = useState<ProfilePreferences["maturity"]>("GENERAL");
  const inputClass =
    "mt-2 min-h-11 w-full rounded-md border border-border bg-card px-3 focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) {
          submit({ displayName: name, locale, maturity });
        }
      }}
    >
      <h2 className="text-xl font-semibold" tabIndex={-1} ref={heading}>
        Create a profile
      </h2>
      <label className="block">
        Fictional display name
        <input
          className={inputClass}
          required
          maxLength={60}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          disabled={busy}
          autoComplete="off"
        />
      </label>
      <label className="block">
        Language
        <select
          className={inputClass}
          value={locale}
          onChange={(event) => {
            setLocale(event.target.value);
          }}
          disabled={busy}
        >
          <option value="en-US">English</option>
          <option value="pt-BR">Português</option>
        </select>
      </label>
      <label className="block">
        Maturity preference
        <select
          className={inputClass}
          value={maturity}
          onChange={(event) => {
            setMaturity(event.target.value as ProfilePreferences["maturity"]);
          }}
          disabled={busy}
        >
          <option value="GENERAL">General</option>
          <option value="TEEN">Teen</option>
          <option value="MATURE">Mature</option>
        </select>
      </label>
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving profile…" : "Save profile"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={cancel}>
          Back to profiles
        </Button>
      </div>
    </form>
  );
}
