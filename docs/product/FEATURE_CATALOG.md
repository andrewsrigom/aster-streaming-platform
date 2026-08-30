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
| Home rails | Discovery | 09 | RELEASED |
| Search | Discovery | 09 | RELEASED |
| Degraded home fallbacks | Discovery | 09 | RELEASED |
| SSR home rails and search | Web | 09 | RELEASED |
| Profile-safe home enhancement | Web and Engagement | 09 | RELEASED |
| Cache-aside and invalidation | Platform | 10 | RELEASED |
| TTL jitter and stale serving | Platform | 10 | RELEASED |
| Request coalescing and leases | Platform | 10 | RELEASED |
| Rate and concurrency limiting | Platform | 10 | RELEASED |
| Deadlines and bounded retries | Platform | 11 | RELEASED |
| Circuit breakers and fallbacks | Platform | 11 | RELEASED |
| Failure-injection controls | Platform | 11 | IMPLEMENTED |
| Resilience game days and runbooks | Platform | 11 | IMPLEMENTED |
| Distributed traces | Platform | 12 | PLANNED |
| SLI/SLO operational dashboard | Platform | 12 | IMPLEMENTED |
| Multi-window SLO alerts | Platform | 12 | PLANNED |
| Trusted GraphQL operations | Platform | 13 | PLANNED |
| Cost, depth, alias, and parser limits | Platform | 13 | PLANNED |
| DataLoader and N+1 benchmark | Platform | 13 | PLANNED |
| Load and capacity validation | Platform | 14 | PLANNED |
| Hosted release and recovery verification | Platform | 14 | PLANNED |
| Recommendations | Discovery | Extension | PLANNED |
| Scheduled live channel | Playback | Extension | PLANNED |
| Subscription entitlements | Identity and Playback | Extension | PLANNED |

Release status through Phase10 and the released Phase11 slices is summarized in
[current state](../../.ai/CURRENT_STATE.md) and linked phase evidence. Phase11
resilience is active: its circuit breaker is released, and the private failure
laboratory plus five game days/runbooks are implemented as candidates. Their
protected release, hosted identity and hosted release remain planned.
