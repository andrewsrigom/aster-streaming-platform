FROM docker.io/grafana/grafana:13.2.0@sha256:3fd54ae1214669f8355f065ec9f6445d5279a3d77095ab048ca045685272429b
COPY --chown=472:0 infra/grafana/provisioning /etc/grafana/provisioning
COPY --chown=472:0 infra/grafana/dashboards /etc/grafana/provisioning/dashboards-json
COPY --chown=472:0 infra/grafana/diagnostics/tempo.yml /etc/grafana/provisioning/datasources/tempo.yml
USER 472

