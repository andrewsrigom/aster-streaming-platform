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
  "!infra/",
  "!infra/docker/",
  "!infra/docker/identity.Dockerfile",
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
  const dockerfile = sources["infra/docker/identity.Dockerfile"] ?? "";
  const from = dockerfile.match(/^FROM .+$/gm) ?? [];
  if (
    from.join("\n") !==
    `FROM ${IDENTITY_BASE_IMAGE} AS build\nFROM ${IDENTITY_BASE_IMAGE} AS runtime`
  ) {
    reject("both build and runtime must use the reviewed immutable Node image");
  }
  for (const required of [
    "pnpm install --frozen-lockfile",
    "TURBO_TELEMETRY_DISABLED=1 pnpm exec turbo run build --filter=@aster/identity",
    "pnpm --filter=@aster/identity --prod deploy --legacy /out",
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
  const patterns = (sources[".dockerignore"] ?? "").replace(/\r\n/g, "\n").trim().split("\n");
  if (patterns.join("\n") !== allowedContext.join("\n")) {
    reject("Docker context must preserve the reviewed source-only allowlist and final exclusions");
  }
  for (const path of productionPackages) {
    try {
      const manifest = JSON.parse(sources[`${path}/package.json`] ?? "{}");
      if (JSON.stringify(manifest.files) !== '["dist/src"]') {
        reject(`${path} must ship only compiled source, not tests or host artifacts`);
      }
    } catch {
      reject(`${path} has invalid package metadata`);
    }
  }
  return violations;
}
