const MAXIMUM_ACTIVE_KEYS = 1_024;
const MAXIMUM_WAITERS_PER_KEY = 31;

type Admission =
  | Readonly<{ status: "acquired"; release: () => void }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "capacity" }>;

interface Waiter {
  readonly signal: AbortSignal;
  readonly resolve: (admission: Admission) => void;
  readonly cancel: () => void;
}

interface ActiveKey {
  readonly waiters: Waiter[];
}

export function createIdempotencyAdmissionQueue() {
  const active = new Map<string, ActiveKey>();

  const permit = (key: string, entry: ActiveKey): Admission => {
    let released = false;
    return {
      status: "acquired",
      release: () => {
        if (released) {
          return;
        }
        released = true;
        while (entry.waiters.length > 0) {
          const waiter = entry.waiters.shift();
          if (!waiter) {
            break;
          }
          waiter.signal.removeEventListener("abort", waiter.cancel);
          if (waiter.signal.aborted) {
            waiter.resolve({ status: "cancelled" });
            continue;
          }
          waiter.resolve(permit(key, entry));
          return;
        }
        if (active.get(key) === entry) {
          active.delete(key);
        }
      },
    };
  };

  return Object.freeze({
    acquire(key: string, signal: AbortSignal): Promise<Admission> {
      if (!/^[a-f0-9]{64}$/u.test(key)) {
        return Promise.resolve({ status: "capacity" });
      }
      if (signal.aborted) {
        return Promise.resolve({ status: "cancelled" });
      }
      const entry = active.get(key);
      if (!entry) {
        if (active.size >= MAXIMUM_ACTIVE_KEYS) {
          return Promise.resolve({ status: "capacity" });
        }
        const created = { waiters: [] };
        active.set(key, created);
        return Promise.resolve(permit(key, created));
      }
      if (entry.waiters.length >= MAXIMUM_WAITERS_PER_KEY) {
        return Promise.resolve({ status: "capacity" });
      }
      return new Promise((resolve) => {
        const waiter: Waiter = {
          signal,
          resolve,
          cancel: () => {
            const index = entry.waiters.indexOf(waiter);
            if (index >= 0) {
              entry.waiters.splice(index, 1);
              resolve({ status: "cancelled" });
            }
          },
        };
        entry.waiters.push(waiter);
        signal.addEventListener("abort", waiter.cancel, { once: true });
        if (signal.aborted) {
          waiter.cancel();
        }
      });
    },
    snapshot: () =>
      Object.freeze({
        activeKeys: active.size,
        waiters: [...active.values()].reduce((total, entry) => total + entry.waiters.length, 0),
        maximumActiveKeys: MAXIMUM_ACTIVE_KEYS,
        maximumWaitersPerKey: MAXIMUM_WAITERS_PER_KEY,
      }),
  });
}
