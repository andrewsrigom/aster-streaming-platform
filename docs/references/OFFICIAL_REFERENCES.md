# Official References

Use current official documentation during implementation. Exact runtime and library versions are pinned in the repository and must be checked against the documentation for those versions.

## Content and licensing

- Blender Studio Films: https://studio.blender.org/films/
- Creative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/
- Creative Commons Attribution 4.0 legal code: https://creativecommons.org/licenses/by/4.0/legalcode
- Creative Commons Attribution 3.0: https://creativecommons.org/licenses/by/3.0/

Do not infer that every film or asset uses the same license. Review each official film page and exact downloadable asset.

## Node.js

- Node.js documentation: https://nodejs.org/docs/latest/api/
- Node.js previous releases and support schedule: https://nodejs.org/en/about/previous-releases
- Node.js 24 LTS announcement and support window: https://nodejs.org/en/blog/release/v24.11.0
- Node.js 24.19.0 release artifacts and checksums: https://nodejs.org/dist/v24.19.0/
- Streams: https://nodejs.org/api/stream.html
- Worker threads: https://nodejs.org/api/worker_threads.html
- Performance hooks: https://nodejs.org/api/perf_hooks.html
- Process memory: https://nodejs.org/api/process.html#processmemoryusage
- Avoid blocking the event loop: https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop

## Package management

- pnpm installation and Node.js compatibility: https://pnpm.io/installation
- pnpm 11.24.0 registry metadata: https://registry.npmjs.org/pnpm/11.24.0
- pnpm workspaces: https://pnpm.io/workspaces
- pnpm workspace settings: https://pnpm.io/settings
- pnpm dependency-resolution and supply-chain settings: https://pnpm.io/settings/dependency-resolution
- Corepack documentation: https://github.com/nodejs/corepack#readme
- Turborepo installation: https://turborepo.com/docs/getting-started/installation
- Turborepo task configuration: https://turborepo.com/docs/crafting-your-repository/configuring-tasks
- Turborepo configuration reference: https://turborepo.com/docs/reference/configuration
- Turborepo 2.10.12 release: https://github.com/vercel/turborepo/releases/tag/v2.10.12
- Turborepo 2.10.12 registry metadata: https://registry.npmjs.org/turbo/2.10.12

## GraphQL and Apollo

- GraphQL specification: https://spec.graphql.org/
- Apollo Federation: https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/federation
- Federation directives: https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/directives
- Apollo Router: https://www.apollographql.com/docs/graphos/routing
- Router security: https://www.apollographql.com/docs/graphos/routing/security
- Demand control: https://www.apollographql.com/docs/graphos/routing/security/demand-control
- Persisted queries: https://www.apollographql.com/docs/graphos/routing/security/persisted-queries
- Apollo Client caching: https://www.apollographql.com/docs/react/caching/overview
- Apollo Client with Next.js: https://www.apollographql.com/docs/react/integrations/nextjs

## Redis

- Redis documentation: https://redis.io/docs/latest/
- Client-side caching concepts: https://redis.io/docs/latest/develop/use/client-side-caching/
- Distributed locks: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
- Rate limiting patterns: https://redis.io/learn/howtos/ratelimiting/
- Scripting: https://redis.io/docs/latest/develop/programmability/eval-intro/
- Key eviction: https://redis.io/docs/latest/develop/reference/eviction/

## PostgreSQL

- PostgreSQL documentation: https://www.postgresql.org/docs/current/
- Transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- Explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
- Indexes: https://www.postgresql.org/docs/current/indexes.html
- Full-text search: https://www.postgresql.org/docs/current/textsearch.html

## Events

- Apache Kafka protocol and design documentation: https://kafka.apache.org/documentation/
- CloudEvents specification: https://cloudevents.io/

Aster uses its own minimal domain-event envelope initially; CloudEvents remains a reference rather than an automatic dependency.

## Media

- HTTP Live Streaming specification, RFC 8216: https://www.rfc-editor.org/rfc/rfc8216
- FFmpeg documentation: https://ffmpeg.org/documentation.html
- FFmpeg formats: https://ffmpeg.org/ffmpeg-formats.html
- FFmpeg codecs: https://ffmpeg.org/ffmpeg-codecs.html
- hls.js documentation: https://github.com/video-dev/hls.js/

## Web

- Next.js documentation: https://nextjs.org/docs
- React documentation: https://react.dev/
- Redux Toolkit: https://redux-toolkit.js.org/
- Web performance: https://web.dev/explore/fast
- Web Content Accessibility Guidelines 2.2: https://www.w3.org/TR/WCAG22/
- WAI media accessibility: https://www.w3.org/WAI/media/av/

## Observability

- OpenTelemetry documentation: https://opentelemetry.io/docs/
- OpenTelemetry JavaScript: https://opentelemetry.io/docs/languages/js/
- Prometheus documentation: https://prometheus.io/docs/
- Grafana documentation: https://grafana.com/docs/
- W3C Trace Context: https://www.w3.org/TR/trace-context/

## Security

- OWASP GraphQL Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html
- OWASP API Security: https://owasp.org/API-Security/
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OpenSSF Scorecard: https://securityscorecards.dev/
- CycloneDX: https://cyclonedx.org/

## Testing

- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/
- Testcontainers for Node.js: https://node.testcontainers.org/
- k6: https://grafana.com/docs/k6/latest/

## Reference policy

- Prefer official specifications and primary documentation.
- Record the version consulted in implementation evidence.
- Do not copy examples without understanding their failure and security assumptions.
- Update this file when a primary technology changes.
