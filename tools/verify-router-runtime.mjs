import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serviceBlock, volumeBlock } from "./verify-optional-platform.mjs";

const routerImage =
  "ghcr.io/apollographql/router:v2.17.0@sha256:b4e70cbcff5a5c3a8825aa2b201257b57a2052bbe2d7751e74d129ebaa09ffe6";
const nodeImage =
  "docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df";

export function validateRouterRuntime(source) {
  const violations = [];
  for (const name of ["router", "router-trust-init"]) {
    const block = serviceBlock(source, name);
    const runtime = name === "router";
    const required = [
      "    logging: *local-logging\n    profiles: [runtime, integration, observability, full]\n",
      "    build:\n      context: ../..\n      dockerfile: infra/docker/" +
        (runtime ? "router" : "router-trust") +
        ".Dockerfile\n",
      "      com.aster.environment: local\n      com.aster.scope: platform\n",
      '    user: "1000:1000"\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n',
      '    restart: "no"\n',
      ...(runtime
        ? [
            '      ASTER_ROUTER_OTLP_ENABLED: "false"\n      APOLLO_EXPOSE_QUERY_PLAN: "false"\n',
            "    depends_on:\n      router-trust-init:\n        condition: service_completed_successfully\n      catalog:\n        condition: service_healthy\n      playback:\n        condition: service_healthy\n",
            '    ports:\n      - "127.0.0.1:4000:4000"\n',
            "    volumes:\n      - identity-router-trust:/run/aster-router/identity:ro\n      - catalog-router-trust:/run/aster-router/catalog:ro\n      - playback-router-trust:/run/aster-router/playback:ro\n      - engagement-router-trust:/run/aster-router/engagement:ro\n      - discovery-router-trust:/run/aster-router/discovery:ro\n    networks: [platform, edge]\n",
            "    stop_grace_period: 10s\n",
            '          cpus: "1.00"\n          memory: 384M\n          pids: 64\n',
          ]
        : [
            "    volumes:\n      - identity-router-trust:/run/aster-router/identity\n      - catalog-router-trust:/run/aster-router/catalog\n      - playback-router-trust:/run/aster-router/playback\n      - engagement-router-trust:/run/aster-router/engagement\n      - discovery-router-trust:/run/aster-router/discovery\n      - playback-catalog-trust:/run/aster-playback-catalog\n      - engagement-identity-trust:/run/aster-engagement-identity\n      - engagement-playback-trust:/run/aster-engagement-playback\n      - engagement-catalog-trust:/run/aster-engagement-catalog\n      - discovery-catalog-trust:/run/aster-discovery-catalog\n    network_mode: none\n",
            "    stop_grace_period: 5s\n",
            '          cpus: "0.25"\n          memory: 64M\n          pids: 32\n',
          ]),
    ];
    const forbidden = [
      "entrypoint:",
      "command:",
      "healthcheck:",
      "image:",
      "env_file:",
      "privileged:",
      "cap_add:",
      "${",
      "APOLLO_KEY",
      "APOLLO_GRAPH_REF",
      ...(runtime ? ["network_mode:"] : ["networks:", "ports:", "    environment:", "depends_on:"]),
    ];
    if (
      required.some((value) => !block.includes(value)) ||
      forbidden.some((value) => block.includes(value)) ||
      block.match(/^ {6}- /gm)?.length !== (runtime ? 6 : 10)
    ) {
      violations.push({
        rule: "router-runtime",
        detail: name + " violates private trust, packaging, readiness or resource bounds",
      });
    }
  }
  for (const owner of ["identity", "catalog", "playback", "engagement", "discovery"]) {
    if (!source.includes(volumeBlock(owner + "-router-trust", "disposable-local"))) {
      violations.push({
        rule: "router-runtime",
        detail: "Router trust volumes require disposable local ownership",
      });
    }
  }
  return violations;
}

export async function readRouterSources(root) {
  const names = [
    "infra/router/router.yaml",
    "infra/docker/router.Dockerfile",
    "infra/docker/router-trust.Dockerfile",
    "infra/router/LICENSE-APOLLO-ROUTER",
  ];
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(resolve(root, name), "utf8")]),
    ),
  );
}

export function validateRouterSources(sources) {
  const violations = [];
  const contracts = {
    "infra/docker/router.Dockerfile": [
      "FROM " + routerImage + "\n",
      "COPY infra/router/router.yaml /dist/config/router.yaml\n",
      "COPY infra/router/main.rhai /dist/rhai/main.rhai\n",
      "COPY infra/router/generated/supergraph.graphql /dist/schema/supergraph.graphql\n",
      "COPY LICENSE /dist/ASTER-LICENSE\n",
      "COPY infra/router/LICENSE-APOLLO-ROUTER /dist/APOLLO-ROUTER-LICENSE\n",
      "HEALTHCHECK --interval=3s --timeout=2s --start-period=10s --retries=3",
      'CMD ["--supergraph", "/dist/schema/supergraph.graphql", "--anonymous-telemetry-disabled"]',
    ],
    "infra/docker/router-trust.Dockerfile": [
      "FROM " + nodeImage + "\n",
      "RUN install -d -m 0700 -o node -g node /run/aster-router/identity /run/aster-router/catalog /run/aster-router/playback /run/aster-router/engagement /run/aster-router/discovery /run/aster-playback-catalog /run/aster-engagement-identity /run/aster-engagement-playback /run/aster-engagement-catalog /run/aster-discovery-catalog\n",
      "COPY infra/router/init-trust.mjs /app/init-trust.mjs\n",
      "COPY LICENSE /app/LICENSE\nUSER node\n",
      'ENTRYPOINT ["node", "/app/init-trust.mjs"]',
    ],
    "infra/router/router.yaml": [
      "csrf:\n  required_headers: [x-aster-csrf]\ncors:\n  policies:\n    - origins: [http://127.0.0.1:4000, http://127.0.0.1:3000]\n  allow_credentials: true\n  methods: [POST]\n  allow_headers: [content-type, x-aster-csrf]\n",
      "  introspection: false\n",
      "  redact_query_validation_errors: true\n",
      "  early_cancel: true\n",
      "  connection_shutdown_timeout: 5s\n",
      "        limit: 128\n",
      "    http_max_request_bytes: 32768\n",
      "    http1_max_request_headers: 64\n",
      "    parser_max_tokens: 2000\n",
      "    parser_max_recursion: 32\n",
      "    max_recursive_selections: 512\n",
      "      http_max_response_size: 256 KiB\n",
      "    timeout: 3s\n    concurrency_limit: 8\n",
      "      capacity: 64\n      interval: 1s\n",
      "    timeout: 2s\n    deduplicate_query: false\n",
      "include_subgraph_errors:\n  all: false\n",
      "              named: cookie\n",
      "              value: ${file./run/aster-router/identity/identity.key}\n",
      "              value: ${file./run/aster-router/catalog/catalog.key}\n",
      "              value: ${file./run/aster-router/playback/playback.key}\n",
      "              value: ${file./run/aster-router/engagement/engagement.key}\n",
      "              value: ${file./run/aster-router/discovery/discovery.key}\n",
      "    engagement:\n      timeout: 2700ms\n",
      "    discovery:\n      timeout: 1700ms\n",
      "  subgraphs:\n    playback:\n      timeout: 2700ms\n",
      "  experimental.expose_query_plan: false\n",
      "      default_attribute_requirement_level: none\n",
      "        endpoint: http://collector:4318\n",
      "          max_queue_size: 128\n",
      "          max_export_batch_size: 64\n",
      "          max_export_timeout: 1s\n",
      "          max_concurrent_exports: 1\n",
    ],
    "infra/router/LICENSE-APOLLO-ROUTER": ["Elastic License 2.0", "Apollo"],
  };
  for (const [file, required] of Object.entries(contracts)) {
    const source = sources[file] ?? "";
    if (source.length > 32768 || required.some((value) => !source.includes(value))) {
      violations.push({
        rule: "router-source",
        detail: file + " violates the reviewed runtime contract",
      });
    }
  }
  for (const file of ["infra/docker/router.Dockerfile", "infra/docker/router-trust.Dockerfile"]) {
    const source = sources[file] ?? "";
    const allowed = file.endsWith("/router.Dockerfile")
      ? /^(?:FROM|COPY|HEALTHCHECK|CMD) /
      : /^(?:FROM|RUN install -d |COPY|USER node$|ENTRYPOINT )/;
    if (source.split("\n").some((line) => line && !allowed.test(line))) {
      violations.push({
        rule: "router-source",
        detail: file + " contains an unreviewed runtime instruction",
      });
    }
  }
  const config = sources["infra/router/router.yaml"] ?? "";
  if (
    /max_depth:|max_aliases:|max_root_fields:|APOLLO_KEY|APOLLO_GRAPH_REF|matching:/.test(config) ||
    config.match(/named: cookie/g)?.length !== 2 ||
    /(?:catalog|playback):\n(?:(?! {4}[a-z]+:)[\s\S])*named: cookie/.test(config)
  ) {
    violations.push({
      rule: "router-source",
      detail: "Router cannot propagate arbitrary headers or activate key-protected limits",
    });
  }
  return violations;
}
