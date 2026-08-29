FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN install -d -m 0700 -o node -g node /run/aster-router/identity /run/aster-router/catalog /run/aster-router/playback /run/aster-router/engagement /run/aster-router/discovery /run/aster-playback-catalog /run/aster-engagement-identity /run/aster-engagement-playback /run/aster-engagement-catalog /run/aster-discovery-catalog
COPY infra/router/init-trust.mjs /app/init-trust.mjs
RUN install -d -m 0700 -o node -g node /run/aster-identity-events
COPY LICENSE /app/LICENSE
USER node
ENTRYPOINT ["node", "/app/init-trust.mjs"]
