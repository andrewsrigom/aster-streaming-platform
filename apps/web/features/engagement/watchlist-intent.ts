import {
  readWatchlistCommand,
  readWatchlistOutcome,
  type WatchlistCommand,
  type WatchlistOutcome,
} from "./library-operations.ts";

export interface WatchlistIntentState {
  readonly status: "idle" | "saving" | "saved" | "unconfirmed" | "rejected";
  readonly canRetry: boolean;
}
export function createWatchlistIntent(options: {
  profileId: string;
  titleId: string;
  present: boolean;
  send: (input: WatchlistCommand, signal: AbortSignal) => Promise<WatchlistOutcome>;
  onState: (state: WatchlistIntentState) => void;
  onCompleted: () => void;
  identifier?: () => string;
}) {
  const lifetime = new AbortController();
  const disposed = () => lifetime.signal.aborted;
  let command: WatchlistCommand | undefined;
  let attempts = 0;
  let state: WatchlistIntentState = { status: "idle", canRetry: false };
  const publish = (status: WatchlistIntentState["status"]) => {
    if (!disposed()) {
      state = { status, canRetry: status === "unconfirmed" && attempts < 2 };
      options.onState(state);
    }
  };
  return {
    async submit() {
      if (disposed() || (state.status !== "idle" && !state.canRetry)) {
        return;
      }
      command ??= readWatchlistCommand(
        {
          profileId: options.profileId,
          titleId: options.titleId,
          present: options.present,
          idempotencyKey: options.identifier ? options.identifier() : crypto.randomUUID(),
        },
        options.profileId,
      );
      attempts++;
      publish("saving");
      try {
        const response = await options.send(
          command,
          AbortSignal.any([lifetime.signal, AbortSignal.timeout(4000)]),
        );
        if (disposed()) {
          return;
        }
        const result = readWatchlistOutcome(response, command);
        if (result.code === "COMPLETED") {
          publish("saved");
          options.onCompleted();
        } else {
          publish(
            [
              "UNAVAILABLE",
              "BACKPRESSURE",
              "LIMIT_EXCEEDED",
              "CANCELLED",
              "INDETERMINATE",
            ].includes(result.code)
              ? "unconfirmed"
              : "rejected",
          );
        }
      } catch {
        publish("unconfirmed");
      }
    },
    dispose() {
      lifetime.abort();
    },
  };
}
