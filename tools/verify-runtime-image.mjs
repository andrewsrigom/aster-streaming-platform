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
];
const allowedContext = [
  "**",
  "!package.json",
  "!pnpm-lock.yaml",
  "!pnpm-workspace.yaml",
  "!tsconfig.base.json",
  "!turbo.json",
  "!LICENSE",
  "!packages/",
  "!packages/**/",
  "!packages/**/package.json",
  "!packages/**/tsconfig.json",
  "!packages/**/src/**/*.ts",
  "!packages/**/test/**/*.ts",
  "!services/",
  "!services/identity/",
  "!services/identity/**/",
  "!services/identity/package.json",
  "!services/identity/tsconfig.json",
  "!services/identity/src/**/*.ts",
  "!services/identity/test/**/*.ts",
  "!services/identity/migrations/*.sql",
  "!services/catalog/",
  "!services/catalog/**/",
  "!services/catalog/package.json",
  "!services/catalog/tsconfig.json",
  "!services/catalog/src/**/*.ts",
  "!services/catalog/test/**/*.ts",
  "!services/catalog/migrations/*.sql",
  "!infra/",
  "!infra/docker/",
  "!infra/docker/identity.Dockerfile",
  "!infra/docker/catalog.Dockerfile",
  "!infra/docker/media-fixture.Dockerfile",
  "!infra/docker/collector.Dockerfile",
  "!infra/docker/prometheus.Dockerfile",
  "!infra/docker/router.Dockerfile",
  "!infra/docker/router-trust.Dockerfile",
  "!infra/router/",
  "!infra/router/router.yaml",
  "!infra/router/main.rhai",
  "!infra/router/init-trust.mjs",
  "!infra/router/LICENSE-APOLLO-ROUTER",
  "!infra/router/generated/",
  "!infra/router/generated/supergraph.graphql",
  "!infra/compose/",
  "!infra/compose/collector.integration.yml",
  "!infra/compose/prometheus.local.yml",
  "!tools/",
  "!tools/media/",
  "!tools/media/*.mjs",
  "**/node_modules/**",
  "**/dist/**",
  "**/.git/**",
  "**/.turbo/**",
  "**/.env*",
  "**/*.pem",
  "**/*.key",
  "**/*.tsbuildinfo",
];

export async function readRuntimeImageSources(root) {
  const files = [
    "infra/docker/identity.Dockerfile",
    "infra/docker/catalog.Dockerfile",
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
  for (const owner of ["identity", "catalog"]) {
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
  const patterns = (sources[".dockerignore"] ?? "").replace(/\r\n/g, "\n").trim().split("\n");
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
