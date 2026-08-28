import { serviceBlock, volumeBlock } from "./verify-optional-platform.mjs";

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
