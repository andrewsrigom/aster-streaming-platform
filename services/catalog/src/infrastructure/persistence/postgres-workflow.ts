import type { AsterPostgresAdapter, AsterPostgresTransaction } from "@aster/postgres";
import type {
  CatalogCommandReceipt,
  CatalogWorkflowTransaction,
  CatalogWorkflowUnitOfWork,
} from "../../application/operator-ports.js";
import { normalizeTitleMetadata } from "../../domain/metadata.js";
import { normalizePublication, normalizeTitleLifecycle } from "../../domain/title.js";
import {
  catalogChecksum,
  catalogIdentifier,
  catalogRecord,
  catalogText,
  catalogTimestamp,
  catalogTraceparent,
  catalogVersion,
} from "../../domain/values.js";
import {
  catalogUnitOfWork,
  chunks,
  InvalidCatalogInput,
  invalidRow,
  one,
  requireId,
  rightsRepositories,
  row,
} from "./postgres-rights.js";

function json(value: unknown, limit = 30000): string {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > limit) {
    throw new InvalidCatalogInput();
  }
  return text;
}
function integer(value: unknown): number {
  const parsed = typeof value === "string" && /^\d{1,12}$/u.test(value) ? Number(value) : value;
  if (!catalogTimestamp(parsed)) {
    return invalidRow();
  }
  return parsed;
}
function receiptRow(value: unknown): CatalogCommandReceipt {
  const data = row(value);
  const result = catalogRecord(data["result"], [
    "titleId",
    "version",
    "state",
    "rightsRevision",
    "publicationId",
  ]);
  const title = result
    ? normalizeTitleLifecycle({
        id: result["titleId"],
        version: result["version"],
        state: result["state"],
        rightsRevision: result["rightsRevision"],
        publicationId: result["publicationId"],
      })
    : undefined;
  if (
    !title ||
    title.id !== data["title_id"] ||
    title.version !== data["title_version"] ||
    !catalogIdentifier(data["mutation_id"]) ||
    !catalogIdentifier(data["actor_id"]) ||
    !catalogChecksum(data["digest"])
  ) {
    return invalidRow();
  }
  return Object.freeze({
    titleId: title.id,
    mutationId: data["mutation_id"],
    actorId: data["actor_id"],
    digest: data["digest"],
    expiresAt: integer(data["expires_at"]),
    result: Object.freeze({
      titleId: title.id,
      version: title.version,
      state: title.state,
      rightsRevision: title.rightsRevision,
      publicationId: title.publicationId,
    }),
  });
}
function repositories(tx: AsterPostgresTransaction): CatalogWorkflowTransaction {
  return {
    ...rightsRepositories(tx),
    async findMetadata(titleId) {
      requireId(titleId);
      const result = await tx.query({
        text: "SELECT metadata FROM catalog.titles WHERE id = $1",
        values: [titleId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const data = row(result.rows[0]);
      if (data["metadata"] === null) {
        return undefined;
      }
      return normalizeTitleMetadata(data["metadata"]) ?? invalidRow();
    },
    async saveTitle(value, expectedStoredVersion, metadata) {
      const title = normalizeTitleLifecycle(value);
      const normalized = metadata === undefined ? undefined : normalizeTitleMetadata(metadata);
      if (
        !title ||
        !catalogVersion(expectedStoredVersion) ||
        (title.version !== expectedStoredVersion && title.version !== expectedStoredVersion + 1) ||
        (metadata !== undefined && !normalized)
      ) {
        throw new InvalidCatalogInput();
      }
      const parts = chunks(json(normalized ?? null));
      const result = await tx.query({
        text: "UPDATE catalog.titles SET version = $2, state = $3, rights_revision = $4, publication_id = $5, metadata = CASE WHEN $7::boolean THEN ($8 || $9 || $10 || $11 || $12 || $13 || $14 || $15 || $16)::jsonb ELSE metadata END WHERE id = $1 AND version = $6",
        values: [
          title.id,
          title.version,
          title.state,
          title.rightsRevision,
          title.publicationId,
          expectedStoredVersion,
          normalized !== undefined,
          ...parts,
        ],
      });
      if (result.rowCount === 0) {
        return false;
      }
      one(result.rowCount);
      return true;
    },
    async findPublication(publicationId) {
      requireId(publicationId);
      const result = await tx.query({
        text: "SELECT id, title_id, rights_revision, source_checksum, manifest_url, validation_report_id, validated_at FROM catalog.publications WHERE id = $1",
        values: [publicationId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const data = row(result.rows[0]);
      const publication = normalizePublication(
        {
          id: data["id"],
          titleId: data["title_id"],
          rightsRevision: data["rights_revision"],
          sourceChecksum: data["source_checksum"],
          manifestUrl: data["manifest_url"],
          validationReportId: data["validation_report_id"],
          validatedAt: integer(data["validated_at"]),
        },
        253402300799,
      );
      return publication?.id === publicationId ? publication : invalidRow();
    },
    async wasPublicationActive(titleId, publicationId, beforeVersion) {
      requireId(titleId);
      requireId(publicationId);
      if (!catalogVersion(beforeVersion)) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "SELECT 1 FROM catalog.publication_activations WHERE title_id = $1 AND publication_id = $2 AND title_version < $3 LIMIT 1",
        values: [titleId, publicationId, beforeVersion],
      });
      return result.rowCount === 1;
    },
    async pruneReceipts(titleId, now) {
      requireId(titleId);
      if (!catalogTimestamp(now)) {
        throw new InvalidCatalogInput();
      }
      await tx.query({
        text: "DELETE FROM catalog.command_receipts WHERE title_id = $1 AND expires_at <= $2",
        values: [titleId, now],
      });
    },
    async findReceipt(titleId, mutationId) {
      requireId(titleId);
      requireId(mutationId);
      const result = await tx.query({
        text: "SELECT title_id, mutation_id, actor_id, digest, expires_at, title_version, result FROM catalog.command_receipts WHERE title_id = $1 AND mutation_id = $2",
        values: [titleId, mutationId],
      });
      if (result.rowCount === 0) {
        return undefined;
      }
      one(result.rowCount);
      const receipt = receiptRow(result.rows[0]);
      return receipt.titleId === titleId && receipt.mutationId === mutationId
        ? receipt
        : invalidRow();
    },
    async pendingCounts(titleId) {
      requireId(titleId);
      const result = await tx.query({
        text: "SELECT (SELECT count(*)::integer FROM catalog.command_receipts WHERE title_id = $1) AS receipts, (SELECT count(*)::integer FROM catalog.publication_outbox WHERE title_id = $1) AS outbox",
        values: [titleId],
      });
      one(result.rowCount);
      const data = row(result.rows[0]);
      const receipts = integer(data["receipts"]);
      const outbox = integer(data["outbox"]);
      if (receipts > 64 || outbox > 128) {
        return invalidRow();
      }
      return { receipts, outbox };
    },
    async writeReceipt(receipt) {
      const checked = receiptRow({
        title_id: receipt.titleId,
        mutation_id: receipt.mutationId,
        actor_id: receipt.actorId,
        digest: receipt.digest,
        expires_at: receipt.expiresAt,
        title_version: receipt.result.version,
        result: receipt.result,
      });
      const result = await tx.query({
        text: "INSERT INTO catalog.command_receipts (title_id, mutation_id, actor_id, digest, expires_at, title_version, result, slot) SELECT $1, $2, $3, $4, $5, $6, $7::jsonb, n FROM generate_series(1, 64) AS n WHERE NOT EXISTS (SELECT 1 FROM catalog.command_receipts r WHERE r.title_id = $1 AND r.slot = n) ORDER BY n LIMIT 1",
        values: [
          checked.titleId,
          checked.mutationId,
          checked.actorId,
          checked.digest,
          checked.expiresAt,
          checked.result.version,
          json(checked.result, 1024),
        ],
      });
      one(result.rowCount);
    },
    async appendCommandAudit(audit) {
      for (const id of [
        audit.id,
        audit.titleId,
        audit.actorId,
        audit.correlationId,
        audit.mutationId,
      ]) {
        requireId(id);
      }
      const metadata = audit.metadata === null ? null : normalizeTitleMetadata(audit.metadata);
      if (
        !catalogVersion(audit.version) ||
        !catalogTimestamp(audit.occurredAt) ||
        ![
          "create",
          "edit",
          "review",
          "media-ready",
          "publish",
          "replace",
          "rollback",
          "retire",
          "dispute",
          "expire",
          "reopen",
        ].includes(audit.kind) ||
        (audit.reason !== null && !catalogText(audit.reason, 512)) ||
        metadata === undefined
      ) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "INSERT INTO catalog.command_audit (id, title_id, title_version, kind, actor_id, occurred_at, correlation_id, mutation_id, reason, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF(($10 || $11 || $12 || $13 || $14 || $15 || $16 || $17 || $18)::jsonb, 'null'::jsonb))",
        values: [
          audit.id,
          audit.titleId,
          audit.version,
          audit.kind,
          audit.actorId,
          audit.occurredAt,
          audit.correlationId,
          audit.mutationId,
          audit.reason,
          ...chunks(json(metadata)),
        ],
      });
      one(result.rowCount);
    },
    async appendPublicationEvent(event) {
      const aggregateType: unknown = event.aggregate.type;
      const schemaVersion: unknown = event.schemaVersion;
      const producer: unknown = event.producer;
      const trace = catalogRecord(event.trace, []) ?? catalogRecord(event.trace, ["traceparent"]);
      for (const id of [
        event.eventId,
        event.aggregate.id,
        event.payload.titleId,
        event.correlationId,
        event.causationId,
      ]) {
        requireId(id);
      }
      if (
        aggregateType !== "Title" ||
        !catalogVersion(event.aggregate.version) ||
        event.aggregate.id !== event.payload.titleId ||
        !["catalog.title-published", "catalog.title-retired"].includes(event.eventType) ||
        schemaVersion !== 1 ||
        producer !== "catalog" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(event.occurredAt) ||
        !Number.isFinite(Date.parse(event.occurredAt)) ||
        !trace ||
        (trace["traceparent"] !== undefined && !catalogTraceparent(trace["traceparent"])) ||
        (event.payload.publicationId !== null && !catalogIdentifier(event.payload.publicationId)) ||
        (event.payload.rightsRevision !== null && !catalogVersion(event.payload.rightsRevision))
      ) {
        throw new InvalidCatalogInput();
      }
      const result = await tx.query({
        text: "INSERT INTO catalog.publication_outbox (event_id, title_id, title_version, event_type, event, slot) SELECT $1, $2, $3, $4, $5::jsonb, n FROM generate_series(1, 128) AS n WHERE NOT EXISTS (SELECT 1 FROM catalog.publication_outbox o WHERE o.title_id = $2 AND o.slot = n) ORDER BY n LIMIT 1",
        values: [
          event.eventId,
          event.aggregate.id,
          event.aggregate.version,
          event.eventType,
          json(event, 3500),
        ],
      });
      one(result.rowCount);
    },
  };
}
export function createPostgresCatalogWorkflow(
  database: Pick<AsterPostgresAdapter, "transaction">,
): CatalogWorkflowUnitOfWork {
  return catalogUnitOfWork(database, repositories);
}
