import { localCatalogDatabase } from "./identity/local-configuration.js";
import { localEventDeliveryEnabled } from "@aster/event-delivery";

const fields = new Set([
  "ASTER_ENVIRONMENT",
  "ASTER_CATALOG_LOCAL_ENABLED",
  "ASTER_CATALOG_HTTP_HOST",
  "ASTER_CATALOG_HTTP_PORT",
  "ASTER_CATALOG_READER_DATABASE_URL",
  "ASTER_CATALOG_READER_DATABASE_PASSWORD",
  "ASTER_CATALOG_PLAYBACK_READ_ENABLED",
  "ASTER_CATALOG_ENGAGEMENT_READ_ENABLED",
  "ASTER_CATALOG_DISCOVERY_READ_ENABLED",
  "ASTER_CATALOG_DISCOVERY_READER_DATABASE_URL",
  "ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD",
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
  const routerTrust = environment["ASTER_ROUTER_TRUST_ENABLED"];
  const playbackRead = environment["ASTER_CATALOG_PLAYBACK_READ_ENABLED"];
  const engagementRead = environment["ASTER_CATALOG_ENGAGEMENT_READ_ENABLED"];
  const discoveryRead = environment["ASTER_CATALOG_DISCOVERY_READ_ENABLED"];
  const discoveryDatabaseConfigured =
    environment["ASTER_CATALOG_DISCOVERY_READER_DATABASE_URL"] !== undefined ||
    environment["ASTER_CATALOG_DISCOVERY_READER_DATABASE_PASSWORD"] !== undefined;
  if (
    (host !== "127.0.0.1" && host !== "0.0.0.0") ||
    !/^[1-9][0-9]{3,4}$/u.test(port) ||
    Number(port) < 1024 ||
    Number(port) > 65535 ||
    (routerTrust !== undefined && routerTrust !== "true" && routerTrust !== "false") ||
    (playbackRead !== undefined && playbackRead !== "true" && playbackRead !== "false") ||
    (playbackRead === "true" && routerTrust !== "true") ||
    (engagementRead !== undefined && engagementRead !== "true" && engagementRead !== "false") ||
    (engagementRead === "true" && routerTrust !== "true") ||
    (discoveryRead !== undefined && discoveryRead !== "true" && discoveryRead !== "false") ||
    (discoveryRead === "true" && routerTrust !== "true") ||
    (discoveryRead !== "true" && discoveryDatabaseConfigured)
  ) {
    throw new Error("Invalid Catalog listener configuration.");
  }
  const validatedHost: "127.0.0.1" | "0.0.0.0" = host;
  const base = {
    host: validatedHost,
    port: Number(port),
    connectionString: localCatalogDatabase(environment, "reader"),
    events: localEventDeliveryEnabled(
      environment["ASTER_EVENTS_ENABLED"],
      environment["ASTER_ENVIRONMENT"],
    ),
    ...(routerTrust === "true" ? { routerTrust: true as const } : {}),
    ...(playbackRead === "true" ? { playbackRead: true as const } : {}),
    ...(engagementRead === "true" ? { engagementRead: true as const } : {}),
    discoveryRead: false as const,
  };
  return discoveryRead === "true"
    ? Object.freeze({
        ...base,
        discoveryRead: true as const,
        discoveryConnectionString: localCatalogDatabase(environment, "discovery-reader"),
      })
    : Object.freeze(base);
}
