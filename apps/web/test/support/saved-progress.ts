import assert from "node:assert/strict";

interface ProgressResponse {
  url(): string;
  ok(): boolean;
  request(): { method(): string; postDataJSON(): unknown };
  json(): Promise<unknown>;
}
interface ProgressPage {
  on(event: "response", listener: (response: ProgressResponse) => void): unknown;
  off(event: "response", listener: (response: ProgressResponse) => void): unknown;
}

export async function waitForGraphqlResponseJson<T>(
  page: ProgressPage,
  endpoint: string,
  options: {
    matchesRequest(body: unknown): boolean;
    successMessage: string;
    timeoutMessage: string;
    timeoutMs?: number;
  },
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 12000;
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 12000);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("response", observe);
      reject(new Error(options.timeoutMessage));
    }, timeoutMs);
    const observe = (response: ProgressResponse): void => {
      if (response.url() !== endpoint || response.request().method() !== "POST") {
        return;
      }
      try {
        if (!options.matchesRequest(response.request().postDataJSON())) {
          return;
        }
      } catch {
        return;
      }
      page.off("response", observe);
      try {
        assert.equal(response.ok(), true, options.successMessage);
        // Chromium can discard a response body as its document changes. Begin the
        // sole selected body read before this response event returns.
        void response.json().then(
          (body) => {
            clearTimeout(timer);
            resolve(body as T);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(
              error instanceof Error ? error : new Error("GraphQL response body unavailable."),
            );
          },
        );
      } catch (error) {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("GraphQL response selection failed."));
      }
    };
    page.on("response", observe);
  });
}

function matchesProgressRequest(
  body: unknown,
  expected: { titleId: string; positionMs: number },
): boolean {
  const request = body as {
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
}

function verifyProgressResponse(
  body: unknown,
  expected: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" },
): void {
  const result = body as {
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

export async function waitForSavedProgress(
  page: ProgressPage,
  endpoint: string,
  expected: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" },
): Promise<void> {
  const body = await waitForGraphqlResponseJson(page, endpoint, {
    matchesRequest: (request) => matchesProgressRequest(request, expected),
    successMessage: "Progress request must succeed",
    timeoutMessage: "Timed out waiting for saved progress.",
  });
  verifyProgressResponse(body, expected);
}
