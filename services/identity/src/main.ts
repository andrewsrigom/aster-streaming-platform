import {
  REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES,
  ReferenceRuntimeConfigError,
} from "@aster/config";

import { createAsterIdentityService } from "./create-service.js";
import type { AsterIdentityRuntime } from "./reference-runtime.js";

let service: AsterIdentityRuntime | undefined;
try {
  const entries = Object.entries(process.env).filter(([name]) =>
    REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );
  service = await createAsterIdentityService(entries);
  service.bindProcessSignals();
  const startup = await service.start();
  if (startup.status === "failed") {
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      event: "aster.identity.startup_failed",
      status: "error",
      code:
        error instanceof ReferenceRuntimeConfigError ? error.code : "ASTER_IDENTITY_STARTUP_FAILED",
      ...(error instanceof ReferenceRuntimeConfigError ? { issues: error.issues } : {}),
    })}\n`,
  );
  process.exitCode = 1;
  await service?.shutdown();
}
