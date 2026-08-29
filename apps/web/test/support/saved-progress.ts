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

function matchesProgressRequest(
  candidate: ProgressResponse,
  endpoint: string,
  expected: { titleId: string; positionMs: number },
): boolean {
  if (candidate.url() !== endpoint || candidate.request().method() !== "POST") {
    return false;
  }
  try {
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
  } catch {
    return false;
  }
}

async function verifyProgressResponse(
  response: ProgressResponse,
  expected: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" },
): Promise<void> {
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

export async function waitForSavedProgress(
  page: ProgressPage,
  endpoint: string,
  expected: { titleId: string; positionMs: number; status: "IN_PROGRESS" | "COMPLETED" },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("response", observe);
      reject(new Error("Timed out waiting for saved progress."));
    }, 12000);
    const observe = (response: ProgressResponse): void => {
      if (!matchesProgressRequest(response, endpoint, expected)) {
        return;
      }
      clearTimeout(timer);
      page.off("response", observe);
      // Chromium can discard a response body as its document changes. Begin the single
      // selected body read in this event turn, while the resource is still addressable.
      void verifyProgressResponse(response, expected).then(resolve, reject);
    };
    page.on("response", observe);
  });
}
