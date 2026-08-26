import {
  REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES,
  ReferenceRuntimeConfigError,
  createReferenceRuntimeConfigDiagnostic,
  loadReferenceRuntimeConfig,
} from "./index.js";

function writeJson(stream: NodeJS.WriteStream, value: unknown): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

try {
  const ownedEnvironmentEntries = Object.entries(process.env).filter(([name]) =>
    REFERENCE_RUNTIME_CONFIG_OWNED_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );
  const configuration = loadReferenceRuntimeConfig(ownedEnvironmentEntries);
  writeJson(process.stdout, createReferenceRuntimeConfigDiagnostic(configuration));
} catch (error) {
  if (error instanceof ReferenceRuntimeConfigError) {
    writeJson(process.stderr, {
      event: "aster.configuration.invalid",
      status: "error",
      code: error.code,
      issues: error.issues,
    });
  } else {
    writeJson(process.stderr, {
      event: "aster.configuration.invalid",
      status: "error",
      code: "ASTER_CONFIGURATION_INTERNAL",
      issues: [
        {
          variable: "<owned-variables>",
          classification: "unknown",
          reason: "internal",
        },
      ],
    });
  }
  process.exitCode = 1;
}
