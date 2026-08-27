# Catalog migrations

Migration 0001 creates only Catalog-owned titles, immutable structured rights revisions and provenance. No backfill or live deployment has occurred. The application must authorize operators and validate approval before storing a review; SQL storage is not an authorization mechanism.

Rights append advances the title version and latest revision by compare-and-set, then inserts the snapshot and audit in the same transaction. Deferred owner/provenance foreign keys reject incomplete commits. Runtime roles can neither change/delete history nor update lifecycle/publication columns. Public access and lifecycle commands remain planned.

Use the existing bounded PostgreSQL transaction adapter. Source JSON is limited to 30000 UTF-8 bytes and stored JSONB to 32768 bytes; parameters are split without breaking Unicode pairs to retain the adapter's 4096-character limit. Reads use descending revision keysets, at most 50 rows. Revisions/audit are retained as durable rights evidence without automatic deletion.

The integration runner applies up/down/up only to its new disposable, labelled PostgreSQL container. Migrations take a one-second lock timeout and two-second statement timeout. Duplicate installation fails; transactions roll back together. The down migration deliberately omits CASCADE, so an unexpected dependent object prevents removal. It destroys rights/history and must never be used against retained demo or production data; prefer backup and roll-forward after actual deployment.
