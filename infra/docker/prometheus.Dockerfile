FROM docker.io/prom/prometheus:v3.14.0@sha256:5ce7540c3c00ef4ab0c9d2c995c6a5b9c421f44b4a115d97a2c7af3b1c21cbb0
COPY infra/compose/prometheus.local.yml /etc/aster/prometheus.yml
COPY infra/observability/slo-rules.yml /etc/aster/slo-rules.yml
COPY infra/observability/slo-alerts.yml /etc/aster/slo-alerts.yml
