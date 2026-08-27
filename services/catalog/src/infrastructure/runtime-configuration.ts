import { localCatalogDatabase } from "./identity/local-configuration.js";

const fields = new Set([
  "ASTER_ENVIRONMENT",
  "ASTER_CATALOG_LOCAL_ENABLED",
  "ASTER_CATALOG_HTTP_HOST",
  "ASTER_CATALOG_HTTP_PORT",
  "ASTER_CATALOG_READER_DATABASE_URL",
  "ASTER_CATALOG_READER_DATABASE_PASSWORD",
]);

export function catalogRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (
    Object.keys(environment).some((key) => key.startsWith("ASTER_CATALOG_") && !fields.has(key))
  ) {
    throw new Error("Unsupported Catalog runtime configuration.");
  }
  const host = environment["ASTER_CATALOG_HTTP_HOST"] ?? "127.0.0.1";
  const port = environment["ASTER_CATALOG_HTTP_PORT"] ?? "3200";
  if (
    (host !== "127.0.0.1" && host !== "0.0.0.0") ||
    !/^[1-9][0-9]{3,4}$/u.test(port) ||
    Number(port) < 1024 ||
    Number(port) > 65535
  ) {
    throw new Error("Invalid Catalog listener configuration.");
  }
  return Object.freeze({
    host,
    port: Number(port),
    connectionString: localCatalogDatabase(environment, "reader"),
  });
}
