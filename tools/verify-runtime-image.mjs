import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const IDENTITY_BASE_IMAGE =
  "docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df";
const productionPackages = [
  "packages/config",
  "packages/runtime",
  "packages/telemetry",
  "packages/http-express",
  "packages/postgres",
  "packages/redis",
  "services/identity",
  "services/catalog",
  "services/playback",
  "services/engagement",
];
const allowedContext = [
  "**",
  "!package.json",
  "!pnpm-lock.yaml",
  "!pnpm-workspace.yaml",
  "!tsconfig.base.json",
  "!turbo.json",
  "!LICENSE",
  "!packages/**/package.json",
  "!packages/**/tsconfig.json",
  "!packages/**/src/**/*.ts",
  "!packages/**/test/**/*.ts",
  "!services/identity/package.json",
  "!services/identity/tsconfig.json",
  "!services/identity/src/**/*.ts",
  "!services/identity/test/**/*.ts",
  "!services/identity/migrations/*.sql",
  "!services/catalog/package.json",
  "!services/catalog/tsconfig.json",
  "!services/catalog/src/**/*.ts",
  "!services/catalog/test/**/*.ts",
  "!services/catalog/migrations/*.sql",
  "!services/playback/package.json",
  "!services/playback/tsconfig.json",
  "!services/playback/src/**/*.ts",
  "!services/playback/test/**/*.ts",
  "!services/playback/migrations/*.sql",
  "!services/engagement/package.json",
  "!services/engagement/tsconfig.json",
  "!services/engagement/src/**/*.ts",
  "!services/engagement/test/**/*.ts",
  "!services/engagement/migrations/*.sql",
  "!workers/media/package.json",
  "!workers/media/tsconfig.json",
  "!workers/media/src/**/*.ts",
  "!workers/media/test/**/*.ts",
  "!infra/docker/media-decoder.Dockerfile",
  "!apps/web/package.json",
  "!apps/web/tsconfig.json",
  "!apps/web/next-env.d.ts",
  "!apps/web/next.config.ts",
  "!apps/web/postcss.config.mjs",
  "!apps/web/THIRD_PARTY_NOTICES.md",
  "!apps/web/scripts/public-artifacts.ts",
  "!apps/web/scripts/verify-public-build.ts",
  "!apps/web/scripts/package-notices.ts",
  "!apps/web/licenses/GPL-3.0.txt",
  "!apps/web/licenses/LGPL-3.0.txt",
  "!apps/web/licenses/WRY-MIT.txt",
  "!apps/web/licenses/SCROLL-BAR-MIT.txt",
  "!apps/web/licenses/REACT-MIT.txt",
  "!apps/web/licenses/SOURCES.md",
  "!apps/web/app/**/*.ts",
  "!apps/web/app/**/*.tsx",
  "!apps/web/app/**/*.css",
  "!apps/web/app/icon.svg",
  "!apps/web/components/**/*.tsx",
  "!apps/web/features/**/*.ts",
  "!apps/web/features/**/*.tsx",
  "!apps/web/features/**/*.css",
  "!apps/web/lib/**/*.ts",
  "!apps/web/lib/**/*.tsx",
  "!apps/web/store/**/*.ts",
  "!apps/web/store/**/*.tsx",
  "!evidence/phase-05/generated-media.json",
  "!infra/docker/identity.Dockerfile",
  "!infra/docker/catalog.Dockerfile",
  "!infra/docker/playback.Dockerfile",
  "!infra/docker/engagement.Dockerfile",
  "!infra/docker/web.Dockerfile",
  "!infra/docker/media-fixture.Dockerfile",
  "!infra/docker/collector.Dockerfile",
  "!infra/docker/prometheus.Dockerfile",
  "!infra/docker/router.Dockerfile",
  "!infra/docker/router-trust.Dockerfile",
  "!infra/router/router.yaml",
  "!infra/router/main.rhai",
  "!infra/router/init-trust.mjs",
  "!infra/router/LICENSE-APOLLO-ROUTER",
  "!infra/router/generated/supergraph.graphql",
  "!infra/compose/collector.integration.yml",
  "!infra/compose/prometheus.local.yml",
  "!tools/media/*.mjs",
  "**/node_modules/**",
  "**/dist/**",
  "**/.git/**",
  "**/.turbo/**",
  "**/.next/**",
  "**/.env*",
  "**/*.pem",
  "**/*.key",
  "**/*.tsbuildinfo",
];

export async function readRuntimeImageSources(root) {
  const files = [
    "infra/docker/identity.Dockerfile",
    "infra/docker/catalog.Dockerfile",
    "infra/docker/playback.Dockerfile",
    "infra/docker/engagement.Dockerfile",
    "infra/docker/web.Dockerfile",
    "infra/compose/demo.yml",
    "infra/compose/playable.yml",
    "infra/docker/collector.Dockerfile",
    "infra/docker/prometheus.Dockerfile",
    ".dockerignore",
    ...productionPackages.map((path) => `${path}/package.json`),
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, await readFile(resolve(root, file), "utf8")]),
    ),
  );
}

export function validateRuntimeImage(sources) {
  const violations = [];
  const reject = (detail) => violations.push({ rule: "runtime-image", detail });
  if (Object.values(sources).some((value) => Buffer.byteLength(value) > 16_384)) {
    return [{ rule: "runtime-image", detail: "image input exceeds 16 KiB" }];
  }
  const collector =
    'FROM docker.io/otel/opentelemetry-collector:0.159.0@sha256:7725a7a10c87d8853208bdd4bb3439ad3c0d7b32b4292b9300ac07c8daba14a2\nCOPY infra/compose/collector.integration.yml /etc/aster/collector.yml\nCMD ["--config=/etc/aster/collector.yml"]';
  const prometheus =
    "FROM docker.io/prom/prometheus:v3.14.0@sha256:5ce7540c3c00ef4ab0c9d2c995c6a5b9c421f44b4a115d97a2c7af3b1c21cbb0\nCOPY infra/compose/prometheus.local.yml /etc/aster/prometheus.yml";
  if (
    sources["infra/docker/collector.Dockerfile"]?.trim() !== collector ||
    sources["infra/docker/prometheus.Dockerfile"]?.trim() !== prometheus
  ) {
    reject("telemetry images must retain reviewed base pins and baked public configuration only");
  }
  for (const owner of ["identity", "catalog", "playback", "engagement"]) {
    const dockerfile = sources[`infra/docker/${owner}.Dockerfile`] ?? "";
    const from = dockerfile.match(/^FROM .+$/gm) ?? [];
    if (
      from.join("\n") !==
      `FROM ${IDENTITY_BASE_IMAGE} AS build\nFROM ${IDENTITY_BASE_IMAGE} AS runtime`
    ) {
      reject("both build and runtime must use the reviewed immutable Node image");
    }
    for (const required of [
      "pnpm install --frozen-lockfile",
      `TURBO_TELEMETRY_DISABLED=1 pnpm exec turbo run build --filter=@aster/${owner}`,
      `pnpm --filter=@aster/${owner} --prod deploy --legacy /out`,
      "COPY --from=build --chown=node:node /out ./",
      "COPY --from=build --chown=node:node /workspace/LICENSE ./LICENSE",
      "USER node\n",
      "ENV NODE_OPTIONS=--max-old-space-size=192\n",
      "STOPSIGNAL SIGTERM\n",
      'ENTRYPOINT ["node"]\nCMD ["./dist/src/main.js"]',
      "--timeout=2s",
      "AbortSignal.timeout(1000)",
      "redirect: 'error'",
      "await r.body?.cancel()",
    ]) {
      if (!dockerfile.includes(required)) {
        reject(`runtime image contract missing: ${required}`);
      }
    }
  }
  const web = sources["infra/docker/web.Dockerfile"] ?? "";
  const webFrom = web.match(/^FROM .+$/gm) ?? [];
  if (
    webFrom.join("\n") !==
    `FROM ${IDENTITY_BASE_IMAGE} AS build\nFROM ${IDENTITY_BASE_IMAGE} AS runtime`
  ) {
    reject("Web build and runtime must use the reviewed immutable Node image");
  }
  for (const required of [
    "pnpm install --frozen-lockfile",
    "pnpm --filter=@aster/web build",
    "COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./",
    "COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static",
    "COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public",
    "COPY --from=build --chown=node:node /workspace/apps/web/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md",
    "COPY --from=build --chown=node:node /workspace/LICENSE ./LICENSE",
    'ENV NODE_OPTIONS="--max-old-space-size=256 --max-http-header-size=16384"',
    "USER node\n",
    "STOPSIGNAL SIGTERM\n",
    'ENTRYPOINT ["node"]\nCMD ["./apps/web/server.js"]',
    "http://127.0.0.1:3000/health/live",
    "AbortSignal.timeout(1000)",
    "redirect: 'error'",
  ]) {
    if (!web.includes(required)) {
      reject("Web image contract missing: " + required);
    }
  }
  if (/^COPY (?:\. |--from=build .*node_modules)/mu.test(web)) {
    reject("Web runtime must contain only traced production output and public assets");
  }
  const demo = sources["infra/compose/demo.yml"] ?? "";
  const webService = demo.split("  catalog-init:")[0] ?? "";
  const environment = webService.match(/^ {4}environment:\n(?: {6}[^\n]*\n)+/mu)?.[0];
  if (
    environment !== "    environment:\n      ASTER_WEB_ROUTER_URL: http://router:4000/graphql\n" ||
    [
      "volumes:",
      "env_file:",
      "privileged:",
      "cap_add:",
      "network_mode:",
      "entrypoint:",
      "command:",
      "${",
    ].some((text) => webService.includes(text)) ||
    [
      "    profiles: [runtime, integration, observability, full]\n",
      "    networks: [edge]\n",
      '      - "127.0.0.1:3000:3000"\n',
      '    user: "1000:1000"\n    read_only: true\n',
      "      - /app/apps/web/.next/cache:size=32m,uid=1000,gid=1000,mode=0700\n",
      "    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n",
      "    stop_grace_period: 10s\n",
      '          cpus: "1.00"\n          memory: 512M\n          pids: 64\n',
      '        max-size: "5m"\n        max-file: "2"\n',
    ].some((text) => !webService.includes(text)) ||
    demo.match(/^ {2}[a-z-]+:\n/gm)?.join("") !== "  web:\n  catalog-init:\n" ||
    !demo.includes('      ASTER_CATALOG_UI_SEED_ENABLED: "true"\n') ||
    !demo.includes('    command: ["./dist/src/initialize-web-demo.js"]\n')
  ) {
    reject("Web demo must preserve bounded public-only Web and explicit Catalog initialization");
  }
  const patterns = (sources[".dockerignore"] ?? "").replace(/\r\n/g, "\n").trim().split("\n");
  const playable = sources["infra/compose/playable.yml"] ?? "";
  for (const required of [
    "      file: demo.yml\n      service: web\n",
    "      file: media.yml\n      service: media-origin\n",
    "      file: media.yml\n      service: media-origin-init\n",
    "      playable-seed:\n        condition: service_completed_successfully\n",
    "      playable-generate:\n        condition: service_completed_successfully\n",
    '      ASTER_PLAYABLE_FIXTURE_EXPORT: "true"\n',
    '      ASTER_CATALOG_PLAYABLE_SEED_ENABLED: "true"\n',
    '    network_mode: none\n    volumes: ["playable-fixture:/output"]\n',
    '    volumes: ["playable-fixture:/fixture:ro"]\n',
    '    command: ["./dist/src/initialize-playable-demo.js"]\n',
    '    tmpfs: ["/work:size=32m,uid=1000,gid=1000,mode=0700"]\n',
    "    mem_limit: 384m\n    pids_limit: 64\n",
    "    mem_limit: 256m\n    pids_limit: 64\n",
  ]) {
    if (!playable.includes(required)) {
      reject("Playable demo boundary missing: " + required.trim());
    }
  }
  if (
    ["privileged:", "cap_add:", "env_file:", "${", "docker.sock", "read_only: false"].some(
      (value) => playable.includes(value),
    ) ||
    playable.split("    read_only: true\n").length !== 3 ||
    playable.split("    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n").length !== 3
  ) {
    reject("Playable demo must preserve isolated bounded initialization");
  }
  if (patterns.join("\n") !== allowedContext.join("\n")) {
    reject("Docker context must preserve the reviewed source-only allowlist and final exclusions");
  }
  for (const path of productionPackages) {
    try {
      const manifest = JSON.parse(sources[`${path}/package.json`] ?? "{}");
      const expected = path.startsWith("services/")
        ? '["dist/src","migrations/*.sql"]'
        : '["dist/src"]';
      if (JSON.stringify(manifest.files) !== expected) {
        reject(
          `${path} must ship compiled source and only its reviewed SQL, not tests or host artifacts`,
        );
      }
    } catch {
      reject(`${path} has invalid package metadata`);
    }
  }
  return violations;
}
