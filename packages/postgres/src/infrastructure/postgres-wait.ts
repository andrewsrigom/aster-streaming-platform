export type WaitResult<T> =
  | Readonly<{ status: "completed"; value: T }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "aborted" }>
  | Readonly<{ status: "failed"; error: unknown }>;

export function waitFor<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<WaitResult<T>> {
  if (signal?.aborted) {
    void promise.catch(() => undefined);
    return Promise.resolve({ status: "aborted" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: WaitResult<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish({ status: "aborted" });
    };
    const timer = setTimeout(() => {
      finish({ status: "timed_out" });
    }, timeoutMs);
    timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        finish({ status: "completed", value });
      },
      (error: unknown) => {
        finish({ status: "failed", error });
      },
    );
  });
}
