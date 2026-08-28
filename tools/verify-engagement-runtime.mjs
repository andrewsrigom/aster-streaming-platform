import { BROKER_IMAGE, serviceBlock, volumeBlock } from "./verify-optional-platform.mjs";

export function validateEventDeliveryOverlay(source) {
  const violations = [];
  const reject = (detail) => violations.push({ rule: "event-runtime", detail });
  const services = source.split("\nvolumes:\n")[0] ?? "";
  const names = [...services.matchAll(/^ {2}([a-z-]+):$/gmu)].map((match) => match[1]).sort();
  if (
    JSON.stringify(names) !==
    JSON.stringify([
      "broker",
      "broker-init",
      "catalog",
      "engagement",
      "identity",
      "router-trust-init",
    ])
  ) {
    reject("event activation must stay inside the reviewed owner/broker service set");
  }
  if (
    ["ports:", "privileged:", "cap_add:", "network_mode:", "${"].some((value) =>
      source.includes(value),
    )
  ) {
    reject("event overlay must not expose ports, grant privileges or accept interpolated targets");
  }
  for (const owner of ["identity", "catalog", "engagement"]) {
    const block = serviceBlock(source, owner);
    if (!block.includes('      ASTER_EVENTS_ENABLED: "true"\n') || block.includes("depends_on:")) {
      reject(owner + " event activation must remain optional for request readiness");
    }
    if (
      owner === "catalog"
        ? block.includes("volumes:")
        : !block.includes("      - identity-event-trust:/run/aster-identity-events:ro\n")
    ) {
      reject(owner + " has invalid Identity event-key access");
    }
  }
  const trust = serviceBlock(source, "router-trust-init");
  if (
    !trust.includes('      ASTER_IDENTITY_EVENTS_TRUST_ENABLED: "true"\n') ||
    !trust.includes("      - identity-event-trust:/run/aster-identity-events\n") ||
    source.match(/:\/run\/aster-identity-events/gu)?.length !== 3
  ) {
    reject("event key is created once and mounted only by its producer and consumer");
  }
  if (
    !source.includes(
      "      com.aster.authority: durable-local\n      com.aster.environment: local\n      com.aster.owner: identity\n",
    )
  ) {
    reject("retained signed backlog requires durable Identity event-key ownership");
  }
  const initializer = serviceBlock(source, "broker-init");
  for (const value of [
    "    image: " + BROKER_IMAGE + "\n",
    "    networks: [platform]\n",
    '    user: "1000:1000"\n',
    "    read_only: true\n",
    "    cap_drop: [ALL]\n",
    "    security_opt: [no-new-privileges:true]\n",
    "    cpus: 0.5\n",
    "    mem_limit: 160m\n",
    "    pids_limit: 64\n",
    "      - /etc/kafka/secrets:size=1m,uid=1000,gid=1000,mode=0750\n",
    "      - /mnt/shared/config:size=1m,uid=1000,gid=1000,mode=0750\n",
    "      - /var/lib/kafka/data:size=1m,uid=1000,gid=1000,mode=0750\n",
    '    restart: "no"\n',
    "for topic in aster.identity.profile.v1 aster.catalog.publication.v1 aster.engagement.v1; do",
    "--create --if-not-exists",
    "--partitions 1 --replication-factor 1",
    "--config retention.ms=3600000 --config retention.bytes=16777216 --config max.message.bytes=16384",
    "--describe --topic",
    "grep -F 'PartitionCount: 1'",
    "grep -F 'ReplicationFactor: 1'",
  ]) {
    if (!initializer.includes(value)) {
      reject("topic initialization is missing its finite contract: " + value.trim());
    }
  }
  return violations;
}

export function eventShutdownComplete(statuses, records) {
  const owners = ["identity", "catalog", "engagement"];
  return (
    statuses.length === owners.length &&
    owners.every((owner) => {
      const matches = statuses.filter((status) => status.owner === owner);
      return (
        matches.length === 1 &&
        matches[0].running === false &&
        matches[0].oomKilled === false &&
        matches[0].exitCode === 143 &&
        records.some(
          (record) =>
            record.service === owner &&
            record.event === "aster.lifecycle.shutdown_completed" &&
            record.outcome === "ok" &&
            record.attributes?.outcome === "completed" &&
            record.attributes?.trigger === "sigterm",
        )
      );
    })
  );
}

export function validateEngagementRuntime(source) {
  const violations = [];
  for (const name of ["engagement", "engagement-init"]) {
    const runtime = name === "engagement";
    const block = serviceBlock(source, name);
    const required = [
      "    logging: *local-logging\n    profiles: [runtime, integration, observability, full]\n",
      "    build:\n      context: ../..\n      dockerfile: infra/docker/engagement.Dockerfile\n",
      "      com.aster.environment: local\n      com.aster.scope: platform\n",
      "      ASTER_ENVIRONMENT: local\n",
      "    networks: [platform]\n",
      '    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n',
      '    stop_grace_period: 15s\n    restart: "no"\n',
      ...(runtime
        ? [
            "    depends_on:\n      engagement-init:\n        condition: service_completed_successfully\n      router-trust-init:\n        condition: service_completed_successfully\n",
            '      ASTER_ENGAGEMENT_LOCAL_ENABLED: "true"\n      ASTER_ENGAGEMENT_HTTP_HOST: 0.0.0.0\n      ASTER_ENGAGEMENT_HTTP_PORT: "3400"\n',
            "      ASTER_ENGAGEMENT_DATABASE_URL: postgresql://aster_engagement_local@postgres:5432/aster\n      ASTER_ENGAGEMENT_DATABASE_PASSWORD: aster-test-only\n",
            '      ASTER_ROUTER_TRUST_ENABLED: "true"\n',
            "    volumes:\n      - engagement-router-trust:/run/aster-router:ro\n      - engagement-identity-trust:/run/aster-engagement-identity:ro\n      - engagement-playback-trust:/run/aster-engagement-playback:ro\n      - engagement-catalog-trust:/run/aster-engagement-catalog:ro\n",
            '          cpus: "1.00"\n          memory: 384M\n          pids: 64\n',
          ]
        : [
            "    depends_on:\n      postgres:\n        condition: service_healthy\n",
            '      ASTER_ENGAGEMENT_MIGRATION_ENABLED: "true"\n      ASTER_ENGAGEMENT_ADMIN_DATABASE_URL: postgresql://aster@postgres:5432/aster\n      ASTER_ENGAGEMENT_ADMIN_DATABASE_PASSWORD: aster-test-only\n',
            '    command: ["./dist/src/migrate-local.js"]\n',
            "    healthcheck:\n      disable: true\n",
            '          cpus: "0.25"\n          memory: 128M\n          pids: 32\n',
          ]),
    ];
    const forbidden = [
      "ports:",
      "entrypoint:",
      "image:",
      "env_file:",
      "privileged:",
      "network_mode:",
      "cap_add:",
      "${",
      "redis",
      "      identity:\n",
      "      playback:\n",
      "      catalog:\n",
      "      engagement:\n",
      "discovery",
      ...(runtime
        ? ["command:", "healthcheck:", "ASTER_ENGAGEMENT_ADMIN", "ASTER_ENGAGEMENT_MIGRATION"]
        : ["volumes:"]),
    ];
    if (
      required.some((value) => !block.includes(value)) ||
      forbidden.some((value) => block.includes(value)) ||
      (runtime && block.match(/^ {6}- /gm)?.length !== 4)
    ) {
      violations.push({
        rule: "engagement-runtime",
        detail: name + " violates owner isolation, credentials, packaging or finite lifecycle",
      });
    }
  }
  for (const name of [
    "engagement-router-trust",
    "engagement-identity-trust",
    "engagement-playback-trust",
    "engagement-catalog-trust",
  ]) {
    if (!source.includes(volumeBlock(name, "disposable-local"))) {
      violations.push({
        rule: "engagement-runtime",
        detail: name + " requires disposable local ownership",
      });
    }
  }
  return violations;
}
