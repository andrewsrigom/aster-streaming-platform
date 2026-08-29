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
| Rights-aware title lifecycle | Catalog | 03 | RELEASED |
| Public catalog browse | Catalog | 03 | RELEASED |
| Attribution page | Catalog | 03 | RELEASED |
| Federated supergraph | Platform | 04 | RELEASED |
| Entity extension across contexts | Platform | 04 | RELEASED |
| SSR catalog and title pages | Web | 05 | RELEASED |
| Apollo cache hydration | Web | 05 | RELEASED |
| Redux player interaction state | Web | 05 | RELEASED |
| Source acquisition | Media | 06 | RELEASED |
| FFmpeg probe and transcode | Media | 06 | RELEASED |
| HLS packaging and validation | Media | 06 | RELEASED |
| Atomic publication | Catalog and Media | 06 | RELEASED |
| Playback session | Playback | 07 | RELEASED |
| Accessible adaptive player | Web and Playback | 07 | RELEASED |
| Playback experience telemetry | Playback | 07 | RELEASED |
| Monotonic progress | Engagement | 08 | RELEASED |
| Continue-watching | Engagement | 08 | RELEASED |
| Watchlist and history | Engagement | 08 | RELEASED |
| Home rails | Discovery | 09 | PLANNED |
| Search | Discovery | 09 | IMPLEMENTED |
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

Release status through Phase 08 is summarized in [current state](../../.ai/CURRENT_STATE.md) and linked phase evidence. Discovery search has implemented local tests and runtime acceptance in the active candidate; it becomes `RELEASED` only after protected merge and exact-main CI. Hosted identity and hosted release remain planned.
