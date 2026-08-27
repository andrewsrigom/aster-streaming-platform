# Feature Catalog

Status values: `PLANNED`, `IMPLEMENTED`, `VERIFIED`, `RELEASED`.

| Capability | Owner | Phase | Status |
|---|---|---:|---|
| Repository execution harness | Platform | 00 | RELEASED |
| Local dependency stack | Platform | 01 | RELEASED |
| Bounded Node service skeleton | Platform | 01 | RELEASED |
| Local accounts and sessions | Identity and Profiles | 02 | RELEASED |
| Multiple viewer profiles | Identity and Profiles | 02 | RELEASED |
| Profile authorization | Identity and Profiles | 02 | RELEASED |
| Rights-aware title lifecycle | Catalog | 03 | PLANNED |
| Public catalog browse | Catalog | 03 | PLANNED |
| Attribution page | Catalog | 03 | PLANNED |
| Federated supergraph | Platform | 04 | PLANNED |
| Entity extension across contexts | Platform | 04 | PLANNED |
| SSR catalog and title pages | Web | 05 | PLANNED |
| Apollo cache hydration | Web | 05 | PLANNED |
| Redux player interaction state | Web | 05 | PLANNED |
| Source acquisition | Media | 06 | PLANNED |
| FFmpeg probe and transcode | Media | 06 | PLANNED |
| HLS packaging and validation | Media | 06 | PLANNED |
| Atomic publication | Catalog and Media | 06 | PLANNED |
| Playback session | Playback | 07 | PLANNED |
| Accessible adaptive player | Web and Playback | 07 | PLANNED |
| Playback experience telemetry | Playback | 07 | PLANNED |
| Monotonic progress | Engagement | 08 | PLANNED |
| Continue-watching | Engagement | 08 | PLANNED |
| Watchlist and history | Engagement | 08 | PLANNED |
| Home rails | Discovery | 09 | PLANNED |
| Search | Discovery | 09 | PLANNED |
| Degraded home fallbacks | Discovery | 09 | PLANNED |
| Cache-aside and invalidation | Platform | 10 | PLANNED |
| TTL jitter and stale serving | Platform | 10 | PLANNED |
| Request coalescing and leases | Platform | 10 | PLANNED |
| Rate and concurrency limiting | Platform | 10 | PLANNED |
| Deadlines and bounded retries | Platform | 11 | PLANNED |
| Circuit breakers and fallbacks | Platform | 11 | PLANNED |
| Failure-injection controls | Platform | 11 | PLANNED |
| Distributed traces | Platform | 12 | PLANNED |
| SLI/SLO dashboards and alerts | Platform | 12 | PLANNED |
| Trusted GraphQL operations | Platform | 13 | PLANNED |
| Cost, depth, alias, and parser limits | Platform | 13 | PLANNED |
| DataLoader and N+1 benchmark | Platform | 13 | PLANNED |
| Load and capacity validation | Platform | 14 | PLANNED |
| Hosted release and recovery verification | Platform | 14 | PLANNED |
| Recommendations | Discovery | Extension | PLANNED |
| Scheduled live channel | Playback | Extension | PLANNED |
| Subscription entitlements | Identity and Playback | Extension | PLANNED |

Phase 02 release evidence: [local Identity API](../../evidence/phase-02/release.txt). Hosted identity remains planned. Catalog has [tested domain rules](../../services/catalog/README.md), but its complete persistent/public capability is not yet implemented.
