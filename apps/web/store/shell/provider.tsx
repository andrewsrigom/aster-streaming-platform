"use client";

import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import dynamic from "next/dynamic";
import { Button } from "../../components/ui/button";
import { createShellStore, shellActions, type ShellRoot, type ShellStore } from "./store";

const ProfileDialog = dynamic(() => import("../../features/identity/dialog"), {
  ssr: false,
  loading: () => (
    <p role="status" className="fixed bottom-4 right-4 bg-card p-4">
      Opening profiles…
    </p>
  ),
});
const FocusContext = createContext<{ current: HTMLElement | null } | null>(null);
export const useShellDispatch = useDispatch.withTypes<ShellStore["dispatch"]>();
export const useShellSelector = useSelector.withTypes<ShellRoot>();

function Overlay() {
  const open = useShellSelector((state) => state.shell.dialog === "profiles");
  const dispatch = useShellDispatch();
  const opener = useContext(FocusContext);
  return open ? (
    <ProfileDialog
      close={() => dispatch(shellActions.close())}
      restoreFocus={() => opener?.current?.focus()}
    />
  ) : null;
}

export function ShellProvider({ children }: PropsWithChildren) {
  const store = useRef<ShellStore | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  if (!store.current) {
    store.current = createShellStore();
  }
  return (
    <Provider store={store.current}>
      <FocusContext.Provider value={opener}>
        {children}
        <Overlay />
      </FocusContext.Provider>
    </Provider>
  );
}

export function ProfileLauncher({ label = "Profiles" }: { label?: string }) {
  const dispatch = useShellDispatch();
  const opener = useContext(FocusContext);
  return (
    <Button
      variant="outline"
      aria-haspopup="dialog"
      onClick={(event) => {
        if (opener) {
          opener.current = event.currentTarget;
        }
        dispatch(shellActions.open());
      }}
    >
      {label}
    </Button>
  );
}
