"use client";

import * as Primitive from "@radix-ui/react-dialog";
import { useLayoutEffect, useRef, type PropsWithChildren } from "react";
import { Button } from "./button";

// Adapted from shadcn/ui; Radix owns modal focus, keyboard and screen-reader semantics.
export function Dialog({
  children,
  busy,
  close,
  restoreFocus,
}: PropsWithChildren<{ busy: boolean; close: () => void; restoreFocus: () => void }>) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    // Disabling the focused action can leave Radix's previous target unfocusable.
    if (busy) {
      closeButton.current?.focus();
    }
  }, [busy]);
  return (
    <Primitive.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <Primitive.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-border bg-background p-6 shadow-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Primitive.Title className="text-2xl font-semibold">Your profiles</Primitive.Title>
              <Primitive.Description className="mt-2 text-sm text-muted-foreground">
                Local demo only. Use fictional names; accounts and profiles remain on this machine.
              </Primitive.Description>
            </div>
            <Primitive.Close asChild>
              <Button ref={closeButton} variant="outline" aria-label="Close profiles">
                Close
              </Button>
            </Primitive.Close>
          </div>
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
