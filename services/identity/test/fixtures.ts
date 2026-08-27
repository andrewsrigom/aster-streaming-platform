import { createAsterLogger } from "@aster/runtime";

export const configurationEntries = [
  ["ASTER_ENV", "integration"],
  ["ASTER_HTTP_HOST", "127.0.0.1"],
  ["ASTER_HTTP_PORT", "3100"],
  ["ASTER_SERVICE_NAME", "identity-test"],
  ["ASTER_STARTUP_DEADLINE_MS", "5000"],
  ["DATABASE_URL", "postgresql://localhost/controlled"],
  ["REDIS_URL", "redis://localhost/0"],
] as const;

export const silentLogger: typeof createAsterLogger = (options) =>
  createAsterLogger({ ...options, destination: { write: () => undefined } });

export function controlledDependency() {
  const state = { ready: true, closed: false, connects: 0, probes: 0 };
  return {
    state,
    connect: () => {
      state.connects += 1;
      return Promise.resolve({ status: state.ready ? "completed" : "unavailable" });
    },
    probe: () => {
      state.probes += 1;
      return Promise.resolve({ status: state.ready ? "completed" : "unavailable" });
    },
    close: () => {
      state.closed = true;
      return Promise.resolve({ status: "completed" });
    },
  };
}
