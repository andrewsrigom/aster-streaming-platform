import assert from "node:assert/strict";

interface ProgressResponse {
  url(): string;
  ok(): boolean;
  request(): { method(): string; postDataJSON(): unknown };
  json(): Promise<unknown>;
}
interface ProgressPage {
  waitForResponse(
    predicate: (response: ProgressResponse) => boolean,
    options: { timeout: number },
  ): Promise<ProgressResponse>;
}

export async function waitForSavedProgress(
  page: ProgressPage,
  endpoint: string,
  expected: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" },
): Promise<void> {
  const response = await page.waitForResponse(
    (candidate) => {
      if (candidate.url() !== endpoint || candidate.request().method() !== "POST") {
        return false;
      }
      const request = candidate.request().postDataJSON() as {
        operationName?: string;
        variables?: { input?: { titleId?: string; positionMs?: number } };
      } | null;
      const input = request?.variables?.input;
      return (
        request?.operationName === "RecordProgress" &&
        input?.titleId === expected.titleId &&
        typeof input.positionMs === "number" &&
        Math.abs(input.positionMs - expected.positionMs) < 150
      );
    },
    { timeout: 12000 },
  );
  // One selected body must be consumed before navigation; async predicates can leave
  // other body reads running after a matching response has resolved the waiter.
  assert.equal(response.ok(), true, "Progress request must succeed");
  const result = (await response.json()) as {
    data?: {
      recordProgress?: {
        code: string;
        progress?: { titleId: string; positionMs: number; status: string };
      };
    };
  } | null;
  const value = result?.data?.recordProgress;
  assert.equal(value?.code, "COMPLETED", "Progress must be durably acknowledged");
  assert.ok(value.progress);
  assert.equal(value.progress.titleId, expected.titleId);
  assert.equal(value.progress.status, expected.status);
  assert.ok(Math.abs(value.progress.positionMs - expected.positionMs) < 150);
}
