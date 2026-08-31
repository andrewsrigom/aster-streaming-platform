FROM docker.io/grafana/tempo:3.0.0@sha256:78439f7f7cf3c97122846c13a832e060c6c7ef67dcc814dccf0a5f3f78393a93
COPY --chown=10001:10001 infra/observability/tempo.yml /etc/aster/tempo.yml
USER 10001:10001

