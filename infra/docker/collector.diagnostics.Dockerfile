FROM docker.io/otel/opentelemetry-collector:0.159.0@sha256:7725a7a10c87d8853208bdd4bb3439ad3c0d7b32b4292b9300ac07c8daba14a2
COPY infra/compose/collector.diagnostics.yml /etc/aster/collector.yml
CMD ["--config=/etc/aster/collector.yml"]

