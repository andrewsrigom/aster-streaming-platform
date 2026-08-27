import type {
  AsterPostgresQuery,
  AsterPostgresRows,
  AsterPostgresTransaction,
  AsterPostgresTransactionDecision,
  AsterPostgresTransactionResult,
} from "../postgres-contract.js";

import type { AsterPostgresPoolClient } from "./postgres-adapter.js";
import { waitFor } from "./postgres-wait.js";

type Failure = "failed" | "timed_out" | "aborted" | "unavailable";
const limits = { queries: 32, rows: 64, parameters: 32, text: 16_384, value: 4_096 } as const;

function validQuery(query: AsterPostgresQuery): boolean {
  // This is a programming guard, not a SQL parser or an authorization boundary.
  return (
    /^(SELECT|INSERT|UPDATE|DELETE)\s/i.test(query.text) &&
    query.text.length <= limits.text &&
    !query.text.includes(";") &&
    (!query.values ||
      (query.values.length <= limits.parameters &&
        query.values.every(
          (value) =>
            value === null ||
            typeof value === "boolean" ||
            (typeof value === "number" && Number.isFinite(value)) ||
            (typeof value === "string" && value.length <= limits.value),
        )))
  );
}

export async function executeTransaction<T>(
  client: AsterPostgresPoolClient,
  work: (transaction: AsterPostgresTransaction) => Promise<AsterPostgresTransactionDecision<T>>,
  signal: AbortSignal | undefined,
  deadline: number,
  leaseOpen: () => boolean,
): Promise<AsterPostgresTransactionResult<T>> {
  let active = true;
  let busy = false;
  let queries = 0;
  let failure: Failure | undefined;
  let committing = false;
  const queryActive = (): boolean => busy;
  const commitDispatched = (): boolean => committing;
  const remaining = (): number => Math.ceil(deadline - performance.now());
  const interrupted = (): Failure | undefined =>
    signal?.aborted
      ? "aborted"
      : !leaseOpen()
        ? "unavailable"
        : remaining() <= 0
          ? "timed_out"
          : failure;

  const execute = async (query: AsterPostgresQuery): Promise<AsterPostgresRows> => {
    const budget = remaining();
    const stopped = interrupted();
    if (stopped) {
      failure = stopped;
      throw new Error("PostgreSQL transaction interrupted.");
    }
    let request: ReturnType<AsterPostgresPoolClient["query"]>;
    try {
      // Admission and dispatch must share a turn: shutdown cannot retire the lease in between.
      committing = query.text === "COMMIT";
      request = client.query({
        ...query,
        values: query.values ? [...query.values] : [],
        query_timeout: budget,
      });
    } catch {
      failure = "unavailable";
      throw new Error("PostgreSQL transaction statement failed.");
    }
    const result = await waitFor(request, signal, budget);
    if (result.status !== "completed") {
      failure = result.status === "failed" ? "unavailable" : result.status;
      if (result.status === "failed" && result.error instanceof Error) {
        const code: unknown = Object.getOwnPropertyDescriptor(result.error, "code")?.value;
        if (code === "57014" || result.error.message === "Query read timeout") {
          failure = "timed_out";
        }
      }
      throw new Error("PostgreSQL transaction statement failed.");
    }
    const { rowCount, rows } = result.value;
    if (
      rows.length > limits.rows ||
      (rowCount !== null &&
        (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > limits.rows))
    ) {
      failure = "failed";
      throw new Error("PostgreSQL transaction result exceeds its contract.");
    }
    return { rowCount: rowCount ?? 0, rows };
  };

  const transaction: AsterPostgresTransaction = Object.freeze({
    async query(query: AsterPostgresQuery): Promise<AsterPostgresRows> {
      if (!active || busy || ++queries > limits.queries || !validQuery(query)) {
        failure = "failed";
        throw new Error("PostgreSQL transaction query rejected.");
      }
      busy = true;
      try {
        return await execute(query);
      } finally {
        busy = false;
      }
    },
  });

  try {
    await execute({ text: "BEGIN ISOLATION LEVEL READ COMMITTED" });
    const worked = await waitFor(
      Promise.resolve().then(() => work(transaction)),
      signal,
      remaining(),
    );
    active = false;
    if (worked.status !== "completed") {
      // Destroying the still-owned connection rolls back without another unbounded network wait.
      return { status: worked.status === "failed" ? (failure ?? "failed") : worked.status };
    }
    if (queryActive() || interrupted()) {
      return { status: interrupted() ?? "failed" };
    }
    if (worked.value.action === "rollback") {
      await execute({ text: "ROLLBACK" });
      return { status: "rolled_back", value: worked.value.value };
    }
    // Once COMMIT may have reached the server, no error/timeout is proof of rollback.
    await execute({ text: "COMMIT" });
    return { status: "committed", value: worked.value.value };
  } catch {
    return { status: commitDispatched() ? "indeterminate" : (failure ?? "failed") };
  } finally {
    active = false;
  }
}
