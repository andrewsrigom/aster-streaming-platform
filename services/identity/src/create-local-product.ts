import { createHash } from "node:crypto";

import type { ReferenceRuntimeConfig } from "@aster/config";
import {
  loadLocalRouterTrust,
  createLocalEngagementReadTrust,
  loadLocalEngagementReadCredential,
} from "@aster/http-express";
import type { AsterPostgresAdapter } from "@aster/postgres";
import type { AsterRedisAdapter } from "@aster/redis";
import type { AsterClock, AsterIdentifierGenerator, AsterLogger } from "@aster/runtime";
import type { AsterOperationLimitMetricInput, AsterTraceContext } from "@aster/telemetry";

import { createRateLimitedIdentityProfiles } from "./application/profile-operation-limit.js";
import { createIdentityProfiles } from "./application/profiles.js";
import { createIdentitySessions } from "./application/sessions.js";
import { createProfilePolicy } from "./domain/profile.js";
import { createLocalIdentityAdapter } from "./infrastructure/identity/local-identity.js";
import { createPostgresProfiles } from "./infrastructure/persistence/postgres-profiles.js";
import { createPostgresSessions } from "./infrastructure/persistence/postgres-sessions.js";
import { createIdentityProfileOperationLimiter } from "./infrastructure/profile-operation-limiter.js";
import { createIdentitySubgraph } from "./transport/identity-subgraph.js";

export async function createLocalIdentityProduct(
  configuration: ReferenceRuntimeConfig,
  database: Pick<AsterPostgresAdapter, "transaction">,
  clock: AsterClock,
  identifiers: AsterIdentifierGenerator,
  logger: AsterLogger,
  activeTraceContext: () => AsterTraceContext | undefined,
  redis: Pick<AsterRedisAdapter, "connect" | "consumeTokenBucket" | "snapshot">,
  recordOperationLimit: (input: AsterOperationLimitMetricInput) => unknown,
) {
  if (!configuration.localDemo) {
    throw new Error("Local Identity product mode is required.");
  }
  const local = {
    environment: configuration.environment,
    localDemoEnabled: true,
    publicOrigin: configuration.localDemo.publicOrigin,
  };
  const now = (): number => Math.floor(clock.now().getTime() / 1_000);
  const identity = await createLocalIdentityAdapter(local, now);
  const shared = {
    identity,
    signerId: identifiers.generate(),
    now,
    nextId: () => identifiers.generate(),
    digest: (value: string) => createHash("sha256").update(value).digest("hex"),
  };
  const sessions = createIdentitySessions({
    ...shared,
    transactions: createPostgresSessions(database),
  });
  const profilePolicy = createProfilePolicy();
  const baseProfiles = createIdentityProfiles({
    ...shared,
    transactions: createPostgresProfiles(database),
    policy: profilePolicy,
  });
  const limiter = createIdentityProfileOperationLimiter({
    environment: configuration.environment === "integration" ? "test" : configuration.environment,
    redis,
    digest: shared.digest,
    recordMetric: recordOperationLimit,
  });
  const graph = await createIdentitySubgraph({
    configuration: local,
    activeTraceContext,
    nowSeconds: now,
    ...(configuration.localDemo.engagementRead
      ? {
          engagementTrust: createLocalEngagementReadTrust(
            "identity",
            await loadLocalEngagementReadCredential("identity"),
          ),
        }
      : {}),
    ...(configuration.localDemo.routerTrust
      ? { routerTrust: await loadLocalRouterTrust("identity") }
      : {}),
    applications: {
      sessions,
      profiles: createRateLimitedIdentityProfiles({
        profiles: baseProfiles,
        sessions,
        limiter,
        nextId: shared.nextId,
        digest: shared.digest,
      }),
    },
    onOperation: (trace) => {
      logger.info({
        event: "aster.identity.graphql_completed",
        operation: trace.operation,
        requestId: trace.correlationId,
        durationMs: trace.durationMs,
        outcome: trace.code === "COMPLETED" ? "ok" : "rejected",
        properties: [
          ["code", trace.code],
          ["trace_id", trace.traceId],
          ["span_id", trace.spanId],
        ],
      });
    },
    onDiagnostic: (code) => {
      logger.warn({ event: "aster.identity.graphql_diagnostic", errorCategory: code });
    },
  });
  return Object.freeze({
    middleware: graph.middleware,
    async stop(): Promise<void> {
      limiter.close();
      await graph.stop();
    },
    async probe(signal: AbortSignal): Promise<"ready" | "unavailable"> {
      const result = await database.transaction(async (tx) => {
        const role = await tx.query({
          text: `SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
            AND pg_has_role(current_user, 'aster_identity_runtime', 'USAGE')
            AND NOT has_schema_privilege(current_user, 'identity', 'CREATE') AS allowed
            FROM pg_roles WHERE rolname = current_user`,
        });
        const value = role.rows[0] as Record<string, unknown> | undefined;
        if (role.rowCount !== 1 || value?.["allowed"] !== true) {
          return { action: "rollback", value: false };
        }
        // Check required columns and SELECT privileges without returning or scanning product data.
        await tx.query({
          text: `SELECT a.id, s.active_profile_id, p.version, r.mutation_id, u.event_id, o.envelope
            FROM identity.accounts a, identity.sessions s, identity.profiles p,
              identity.profile_receipts r, identity.profile_audit u, identity.profile_outbox o
            WHERE false`,
        });
        return { action: "rollback", value: true };
      }, signal);
      return result.status === "rolled_back" && result.value ? "ready" : "unavailable";
    },
  });
}
