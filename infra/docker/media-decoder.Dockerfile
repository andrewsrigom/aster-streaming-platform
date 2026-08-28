FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY workers/media/package.json ./workers/media/
RUN corepack enable && corepack install && pnpm install --frozen-lockfile
COPY workers/media ./workers/media
RUN pnpm --filter=@aster/media build && pnpm --filter=@aster/media --prod deploy --legacy /out

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=15 update \
    && apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=15 install --yes --no-install-recommends ffmpeg=7:5.1.9-0+deb12u1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY LICENSE ./LICENSE
USER node
ENV NODE_OPTIONS=--max-old-space-size=128
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "./dist/src/main.js"]
