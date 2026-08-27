import { serviceBlock } from "./verify-optional-platform.mjs";

export function validateCatalogRuntime(source) {
  const violations = [];
  for (const name of ["catalog", "catalog-init"]) {
    const block = serviceBlock(source, name);
    const required = [
      "    profiles: [runtime, integration, observability, full]\n",
      "    logging: *local-logging\n",
      "    build:\n      context: ../..\n      dockerfile: infra/docker/catalog.Dockerfile\n",
      "      com.aster.environment: local\n      com.aster.scope: platform\n",
      '    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n',
      "    security_opt: [no-new-privileges:true]\n",
      '    restart: "no"\n',
      "      ASTER_ENVIRONMENT: local\n",
      ...(name === "catalog"
        ? [
            "    depends_on:\n      catalog-init:\n        condition: service_completed_successfully\n",
            '      ASTER_CATALOG_LOCAL_ENABLED: "true"\n      ASTER_CATALOG_HTTP_HOST: 0.0.0.0\n      ASTER_CATALOG_HTTP_PORT: "3200"\n',
            "      ASTER_CATALOG_READER_DATABASE_URL: postgresql://aster_catalog_reader_local@postgres:5432/aster\n      ASTER_CATALOG_READER_DATABASE_PASSWORD: aster-test-only\n",
            '      ASTER_ROUTER_TRUST_ENABLED: "true"\n',
            "      router-trust-init:\n        condition: service_completed_successfully\n",
            "    volumes:\n      - catalog-router-trust:/run/aster-router:ro\n    networks: [platform]\n",
            "    stop_grace_period: 15s\n",
            '          cpus: "1.00"\n          memory: 384M\n          pids: 64\n',
          ]
        : [
            "    depends_on:\n      postgres:\n        condition: service_healthy\n",
            '      ASTER_CATALOG_OPERATOR_ENABLED: "true"\n      ASTER_CATALOG_ADMIN_DATABASE_URL: postgresql://aster@postgres:5432/aster\n      ASTER_CATALOG_ADMIN_DATABASE_PASSWORD: aster-test-only\n',
            '    command: ["./dist/src/migrate-local.js"]\n    networks: [platform]\n',
            "    healthcheck:\n      disable: true\n    stop_grace_period: 5s\n",
            '          cpus: "0.25"\n          memory: 128M\n          pids: 32\n',
          ]),
    ];
    const forbidden = [
      "image:",
      "entrypoint:",
      "env_file:",
      "privileged:",
      "network_mode:",
      "cap_add:",
      "${",
      ...(name === "catalog"
        ? ["ports:", "command:", "healthcheck:", "ASTER_CATALOG_OPERATOR", "ASTER_CATALOG_ADMIN"]
        : ["ports:", "volumes:"]),
    ];
    if (
      required.some((text) => !block.includes(text)) ||
      forbidden.some((text) => block.includes(text)) ||
      (name === "catalog" && block.match(/^ {6}- /gm)?.length !== 1)
    ) {
      violations.push({
        rule: "catalog-runtime",
        detail: name + " violates its local read-only/runtime or finite initializer contract",
      });
    }
  }
  return violations;
}
