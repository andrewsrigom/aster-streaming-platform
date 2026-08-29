"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { ProfileLauncher } from "../../store/shell/provider";
import { attachPrivateProfile, type PrivateProfileView } from "./profile-context";

export type ReadyProfile = Extract<PrivateProfileView, { kind: "ready" }>;
const messages = {
  checking: "Checking your profile…",
  anonymous: "Sign in and select a local profile to use your library.",
  unselected: "Select a profile to use your library.",
  unavailable: "Your profile is unavailable. Public browsing and playback remain available.",
  expired: "Your session expired. Sign in again to use your library.",
  suspended: "Private data cleared while this page is inactive.",
};
export function PrivateProfile({
  children,
  feature = "your library",
}: {
  children: (scope: ReadyProfile) => ReactNode;
  feature?: string;
}) {
  const [state, setState] = useState<PrivateProfileView>({ kind: "checking" });
  const controller = useRef<ReturnType<typeof attachPrivateProfile> | null>(null);
  useEffect(() => {
    let channel: BroadcastChannel | undefined;
    let profile: ReturnType<typeof attachPrivateProfile> | undefined;
    try {
      channel = new BroadcastChannel("aster.local-session");
      profile = attachPrivateProfile({
        page: window,
        visibility: document,
        sessionChanges: channel,
        onState: setState,
      });
      controller.current = profile;
    } catch {
      setState({ kind: "unavailable" });
    }
    return () => {
      profile?.dispose();
      channel?.close();
      controller.current = null;
    };
  }, []);
  return (
    <div className="space-y-5">
      <p aria-live="polite" aria-atomic="true">
        {state.kind === "ready"
          ? `Profile: ${state.profileName}`
          : state.kind === "anonymous"
            ? `Sign in and select a local profile to use ${feature}.`
            : state.kind === "unselected"
              ? `Select a profile to use ${feature}.`
              : messages[state.kind]}
      </p>
      {state.kind === "ready" ? (
        <Fragment key={state.generation}>{children(state)}</Fragment>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <ProfileLauncher label="Choose a profile" />
        {state.kind !== "checking" ? (
          <Button
            variant="outline"
            onClick={() => {
              void controller.current?.refresh();
            }}
          >
            Recheck profile
          </Button>
        ) : null}
      </div>
    </div>
  );
}
