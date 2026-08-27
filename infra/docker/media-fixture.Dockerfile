FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=15 update \
    && apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=15 install -y --no-install-recommends ffmpeg=7:5.1.9-0+deb12u1
WORKDIR /app
COPY tools/media/ ./
COPY LICENSE ./LICENSE
USER node
ENV NODE_OPTIONS=--max-old-space-size=128
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "/app/generate-hls.mjs"]
