import assert from "node:assert/strict";

interface ProgressResponse {
  url(): string;
  ok(): boolean;
  request(): { method(): string; postDataJSON(): unknown };
}
interface ProgressPage {
  on(event: "response", listener: (response: ProgressResponse) => void): unknown;
  off(event: "response", listener: (response: ProgressResponse) => void): unknown;
}

export async function waitForGraphqlConfirmation<T>(
  page: ProgressPage,
  endpoint: string,
  options: {
    matchesRequest(body: unknown): boolean;
    confirm(): Promise<T>;
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
        // The application owns the response body. Confirm through state rendered
        // only after its GraphQL client has parsed and accepted that response.
        void options.confirm().then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error("GraphQL confirmation unavailable."));
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

export async function waitForSavedProgress(
  page: ProgressPage,
  endpoint: string,
  expected: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" },
  confirm: () => Promise<void>,
): Promise<void> {
  await waitForGraphqlConfirmation(page, endpoint, {
    matchesRequest: (request) => matchesProgressRequest(request, expected),
    confirm,
    successMessage: "Progress request must succeed",
    timeoutMessage: "Timed out waiting for saved progress.",
  });
}
