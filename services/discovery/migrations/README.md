# Discovery migrations

Migration `0001` creates Discovery-owned source fences, two-generation projection state and weighted PostgreSQL search documents. `aster_discovery_runtime` can only read the active projection. `aster_discovery_projector` owns bounded derived-state writes and cannot access Catalog tables.

The down migration succeeds only before any projection or replacement generation exists. Once derived fences exist, preserve them and roll forward; never remove Catalog or retained media to repair Discovery.
