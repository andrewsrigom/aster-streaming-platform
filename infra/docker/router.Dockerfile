FROM ghcr.io/apollographql/router:v2.17.0@sha256:b4e70cbcff5a5c3a8825aa2b201257b57a2052bbe2d7751e74d129ebaa09ffe6

COPY infra/router/router.yaml /dist/config/router.yaml
COPY infra/router/main.rhai /dist/rhai/main.rhai
COPY infra/router/generated/trusted-operations.rhai /dist/rhai/trusted-operations.rhai
COPY infra/router/generated/supergraph.graphql /dist/schema/supergraph.graphql
COPY infra/router/generated/persisted-query-manifest.json /dist/manifest/persisted-query-manifest.json
COPY LICENSE /dist/ASTER-LICENSE
COPY infra/router/LICENSE-APOLLO-ROUTER /dist/APOLLO-ROUTER-LICENSE
HEALTHCHECK --interval=3s --timeout=2s --start-period=10s --retries=3 CMD ["/bin/bash", "-ec", "exec 3<>/dev/tcp/127.0.0.1/8088; printf 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3; read -r protocol status rest <&3; test \"$status\" = 200"]
CMD ["--supergraph", "/dist/schema/supergraph.graphql", "--anonymous-telemetry-disabled"]
