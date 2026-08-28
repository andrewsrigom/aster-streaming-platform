export {
  EVENT_TOPICS,
  MAX_EVENT_BYTES,
  eventIdentifier,
  eventVersion,
  eventRecord,
  normalizeEvent,
} from "./domain/envelope.js";
export type { EventEnvelope, EventOwner } from "./domain/envelope.js";
export { createOutboxRelay } from "./application/relay.js";
export type { OutboxClaim, OutboxPort, RelayPorts, RelayStep } from "./application/relay.js";
export {
  createIdentityEventSignature,
  IDENTITY_EVENT_SIGNATURE,
} from "./infrastructure/identity-signature.js";
export { createPostgresOutbox } from "./infrastructure/postgres-outbox.js";
export {
  createLocalEventDelivery,
  loadLocalIdentityEventCredential,
  localEventDeliveryEnabled,
  localEventDatabase,
} from "./infrastructure/local-runtime.js";
export type {
  EventDeliveryLifecycle,
  IdentityDeliveryHandler,
} from "./infrastructure/local-runtime.js";
