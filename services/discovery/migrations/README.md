# Discovery migrations

Migration `0001` creates Discovery-owned source fences, two-generation projection state and weighted PostgreSQL search documents. `aster_discovery_runtime` can only read the active projection. `aster_discovery_projector` owns bounded derived-state writes and cannot access Catalog tables.

The down migration succeeds only before any projection or replacement generation exists. Once derived fences exist, preserve them and roll forward; never remove Catalog or retained media to repair Discovery.

Migration `0002` adds a128-record exact-byte quarantine and replay boundary for bounded Catalog broker hints. Only the projector role can call its security-definer functions; runtime search cannot read recovery records. The bounded local replay command is documented in the service README; it revalidates one UUID-selected record through current Catalog authority and deletes it only after durable success. The down migration requires an empty quarantine. A full quarantine leaves the broker offset uncommitted instead of skipping a poison record.

The released search readiness accepts ordered markers `1–2` and the single
reviewed additive successor `1–3`, but rejects gaps and future marker `4`. Release
that compatibility stage before applying migration `0003`; the search binary
continues using only migration-2 objects. Its init preflight also accepts marker
`3` after a newer image applies it, but its fixed two-script list never applies
that migration. Valid bootstrap/partial migration states remain supported and a
four-row read makes marker `4` fail closed. This makes migration-first rollout
and rollback compatible while the later rails binary requires its new view.

Migration `0003` adds only the security-barrier `discovery.rail_documents` view.
It joins generation rows to title fences when source version and document digest
both match, preventing an older generation from borrowing newer metadata. Runtime
has read-only access; projector and public roles have none. Its down migration
drops only the view and preserves every fence, generation and search document.
