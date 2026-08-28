FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build

WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/http-express/package.json ./packages/http-express/
COPY packages/postgres/package.json ./packages/postgres/
COPY packages/redis/package.json ./packages/redis/
COPY packages/broker-kafka/package.json ./packages/broker-kafka/
COPY packages/object-storage-s3/package.json ./packages/object-storage-s3/
COPY services/catalog/package.json ./services/catalog/
RUN corepack enable && corepack install && pnpm install --frozen-lockfile

COPY tsconfig.base.json turbo.json LICENSE ./
COPY packages ./packages
COPY services/catalog ./services/catalog
# Legacy deploy preserves the existing linked workspace policy; only production dependencies ship.
RUN TURBO_TELEMETRY_DISABLED=1 pnpm exec turbo run build --filter=@aster/catalog \
    && pnpm --filter=@aster/catalog --prod deploy --legacy /out

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=192
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /workspace/LICENSE ./LICENSE
COPY --chown=node:node evidence/phase-05/generated-media.json ./ui-seed-report.json
COPY --chown=node:node tools/media/generate-hls.mjs tools/media/hls-contract.mjs tools/media/fixture-export.mjs ./fixture-recipe/
USER node
EXPOSE 3200
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=3s --timeout=2s --start-period=15s --retries=3 CMD ["node", "--input-type=module", "--eval", "try { const r = await fetch('http://127.0.0.1:3200/health/ready', { signal: AbortSignal.timeout(1000), redirect: 'error' }); await r.body?.cancel(); process.exitCode = r.status === 200 ? 0 : 1; } catch { process.exitCode = 1; }"]
ENTRYPOINT ["node"]
CMD ["./dist/src/main.js"]
