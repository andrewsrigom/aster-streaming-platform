FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build

WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN corepack enable && corepack install && pnpm install --frozen-lockfile
COPY tsconfig.base.json LICENSE ./
COPY apps/web ./apps/web
RUN mkdir -p apps/web/public && pnpm --filter=@aster/web build

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=256 --max-http-header-size=16384"
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /workspace/apps/web/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY --from=build --chown=node:node /workspace/LICENSE ./LICENSE
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=3s --timeout=2s --start-period=15s --retries=3 CMD ["node", "--input-type=module", "--eval", "try { const r = await fetch('http://127.0.0.1:3000/health/live', { signal: AbortSignal.timeout(1000), redirect: 'error' }); await r.body?.cancel(); process.exitCode = r.status === 200 ? 0 : 1; } catch { process.exitCode = 1; }"]
ENTRYPOINT ["node"]
CMD ["./apps/web/server.js"]
