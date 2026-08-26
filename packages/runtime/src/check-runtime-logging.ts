import { createAsterLogger } from "./index.js";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";

try {
  const logger = createAsterLogger({
    service: "runtime-check",
    environment: "local",
    version: "0.0.0",
    traceContextProvider: () => ({ traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 }),
  });
  const success = logger.info({
    event: "aster.logging.check",
    operation: "runtime.logging",
    outcome: "ok",
    properties: [
      ["format", "json"],
      ["destination", "stdout"],
    ],
  });
  const error = new Error("diagnostic-error-secret-never-emit", {
    cause: new Error("diagnostic-cause-secret-never-emit"),
  });
  Object.defineProperty(error, "code", { value: "DIAGNOSTIC_FAILURE" });
  const redacted = logger.warn({
    event: "aster.logging.redaction_check",
    operation: "runtime.logging",
    outcome: "degraded",
    errorCategory: "logging.diagnostic",
    error,
    properties: [
      ["authorization", "diagnostic-token-secret-never-emit"],
      ["redaction", "configured"],
    ],
  });
  if (success !== "written" || redacted !== "written") {
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    `${JSON.stringify({ event: "aster.logging.check_failed", outcome: "error" })}\n`,
  );
  process.exitCode = 1;
}
