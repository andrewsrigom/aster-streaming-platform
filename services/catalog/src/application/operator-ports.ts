import type { TitleMetadata } from "../domain/metadata.js";
import type { RightsUsePolicy } from "../domain/rights.js";
import type { CatalogTitleLifecycle, ValidatedPublicationReference } from "../domain/title.js";
import type { CatalogRightsTransaction, CatalogStoreResult } from "./rights-ports.js";

export type CatalogCommandKind =
  | "create"
  | "edit"
  | "review"
  | "media-ready"
  | "publish"
  | "retire"
  | "dispute"
  | "expire"
  | "reopen";
export interface CatalogOperator {
  readonly id: string;
  readonly expiresAt: number;
}
export interface CatalogOperatorAuthority {
  authorize(credential: unknown, now: number): CatalogOperator | undefined;
}
export interface CatalogCommandRequest {
  readonly credential: unknown;
  readonly signal: AbortSignal;
  readonly correlationId: string;
}
export interface CatalogCommandResult {
  readonly titleId: string;
  readonly version: number;
  readonly state: CatalogTitleLifecycle["state"];
  readonly rightsRevision: number | null;
  readonly publicationId: string | null;
}
export interface CatalogCommandReceipt {
  readonly titleId: string;
  readonly mutationId: string;
  readonly actorId: string;
  readonly digest: string;
  readonly expiresAt: number;
  readonly result: CatalogCommandResult;
}
export interface CatalogCommandAudit {
  readonly id: string;
  readonly kind: CatalogCommandKind;
  readonly actorId: string;
  readonly titleId: string;
  readonly version: number;
  readonly occurredAt: number;
  readonly correlationId: string;
  readonly mutationId: string;
  readonly reason: string | null;
  readonly metadata: TitleMetadata | null;
}
export interface CatalogPublicationEvent {
  readonly eventId: string;
  readonly eventType: "catalog.title-published" | "catalog.title-retired";
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly producer: "catalog";
  readonly aggregate: Readonly<{ type: "Title"; id: string; version: number }>;
  readonly correlationId: string;
  readonly causationId: string;
  readonly trace: Readonly<Record<string, never>>;
  readonly payload: Readonly<{
    titleId: string;
    publicationId: string | null;
    rightsRevision: number | null;
  }>;
}
export interface CatalogWorkflowTransaction extends CatalogRightsTransaction {
  findMetadata(titleId: string): Promise<TitleMetadata | undefined>;
  saveTitle(
    title: CatalogTitleLifecycle,
    expectedStoredVersion: number,
    metadata: TitleMetadata | undefined,
  ): Promise<boolean>;
  findPublication(publicationId: string): Promise<ValidatedPublicationReference | undefined>;
  pruneReceipts(titleId: string, now: number): Promise<void>;
  findReceipt(titleId: string, mutationId: string): Promise<CatalogCommandReceipt | undefined>;
  pendingCounts(titleId: string): Promise<Readonly<{ receipts: number; outbox: number }>>;
  writeReceipt(receipt: CatalogCommandReceipt): Promise<void>;
  appendCommandAudit(audit: CatalogCommandAudit): Promise<void>;
  appendPublicationEvent(event: CatalogPublicationEvent): Promise<void>;
}
export interface CatalogWorkflowUnitOfWork {
  run<T>(
    operation: (tx: CatalogWorkflowTransaction) => Promise<CatalogStoreResult<T>>,
    signal: AbortSignal,
  ): Promise<CatalogStoreResult<T>>;
}
export interface CatalogOperatorPorts {
  readonly authority: CatalogOperatorAuthority;
  readonly transactions: CatalogWorkflowUnitOfWork;
  readonly policy: RightsUsePolicy;
  readonly now: () => number;
  readonly nextId: () => string;
  readonly digest: (text: string) => string;
}
