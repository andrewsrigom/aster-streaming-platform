import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const endpoint = "http://127.0.0.1:4000/graphql";
const titleId = "00000000-0000-4000-8000-000005000001";
const docker = async (...args: string[]) =>
  promisify(execFile)("docker", args, {
    timeout: 5000,
    maxBuffer: 16384,
    windowsHide: true,
  });

test("Router outage renders useful SSR without JavaScript and explicit retry recovers", async ({
  browser,
  page,
}) => {
  // Four real deadline-bound routes plus one hydrated route, not a timing benchmark.
  test.setTimeout(45000);
  const router = process.env["ASTER_ROUTER_CONTAINER"] ?? "aster-router-1";
  expect(router).toMatch(/^aster(?:-[a-z0-9-]+)?-router-1$/u);
  const inspection = await docker("inspect", "--format", "{{json .Config.Labels}}", router);
  const labels = JSON.parse(inspection.stdout) as Record<string, string>;
  expect(labels["com.aster.environment"]).toBe("local");
  expect(labels["com.docker.compose.service"]).toBe("router");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const noJs = await context.newPage();
  let browserQueries = 0;
  page.on("request", (request) => {
    if (request.url() === endpoint) {
      browserQueries++;
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await docker("pause", router);
    try {
      for (const path of ["/", "/attribution", `/title/${titleId}`, "/browse?locale=pt-BR"]) {
        const response = await noJs.goto(`http://127.0.0.1:3000${path}`);
        expect(response?.status()).toBe(200);
        await expect(noJs.locator("main").getByRole("alert")).toContainText(
          "temporarily unavailable",
        );
        await expect(noJs.getByRole("link", { name: "Reload page", exact: true })).toBeVisible();
        expect(await response?.text()).not.toMatch(
          /ASTER_WEB_ROUTER_URL|http:\/\/router:4000|aster-test-only/u,
        );
      }
      await page.goto("/browse");
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "temporarily unavailable",
      );
      await page.waitForLoadState("networkidle");
      expect(browserQueries).toBe(0);
    } finally {
      await docker("unpause", router);
    }
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
    expect(browserQueries).toBe(1);
    await noJs.getByRole("link", { name: "Reload page", exact: true }).click();
    await expect(noJs.getByRole("heading", { name: "Sinal / 01", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        event: "public_outage_recovery",
        noJsRoutes: 4,
        initialBrowserQueries: 0,
        explicitRetryQueries: browserQueries,
      }),
    );
  } finally {
    await context.close();
  }
});

test("refresh announces stale data only while pending, rejects partial errors, and retries once", async ({
  page,
}) => {
  await page.goto("/browse");
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route(endpoint, async (route) => {
    attempts++;
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { titles: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } } },
        errors: [{ message: "private-failure-canary" }],
      }),
    });
  });
  try {
    await page.getByRole("button", { name: "Refresh collection", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Previously loaded details may be stale" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Checking…", exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator("main").getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("private-failure-canary");
  await expect(page.locator("main")).not.toContainText("The collection is quiet");
  expect(attempts).toBe(1);
  await page.unroute(endpoint);
  let retries = 0;
  page.on("request", (request) => {
    if (request.url() === endpoint) {
      retries++;
    }
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
  expect(retries).toBe(1);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

test("explicit refresh follows the current consumer after shared-query route changes", async ({
  page,
}) => {
  await page.goto("/browse");
  await page.waitForLoadState("networkidle");
  let requests = 0;
  page.on("request", (request) => {
    if (request.url() === endpoint) {
      requests++;
    }
  });
  for (const [link, heading] of [
    ["Attribution", "Credit where it belongs."],
    ["Collection", "Browse the Aster collection"],
  ] as const) {
    const previousRequests = requests;
    await page.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(requests).toBe(previousRequests);
    await page.getByRole("button", { name: "Refresh collection", exact: true }).click();
    await expect.poll(() => requests).toBe(previousRequests + 1);
    await expect(
      page.getByRole("button", { name: "Refresh collection", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
  }
});

test("empty rails, missing titles and invalid inputs differ from unavailable data", async ({
  page,
}) => {
  await page.goto("/?locale=pt-BR");
  await expect(
    page.getByLabel("Featured").getByRole("heading", { name: "Sinal / 01", exact: true }),
  ).toBeVisible();
  await page.route(endpoint, (route) => {
    const request = route.request().postDataJSON() as { operationName?: string };
    if (request.operationName !== "HomePublic") {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          homeRails: {
            code: "COMPLETED",
            correlationId: "00000000-0000-4000-8000-000000090001",
            generation: "00000000-0000-4000-8000-000000090002",
            generatedAt: 1000,
            featured: {
              code: "EMPTY",
              rail: {
                key: "featured",
                kind: "FEATURED",
                source: "FEATURED",
                oldestIndexedAt: null,
                freshUntil: null,
                edges: [],
              },
            },
            recentlyAdded: {
              code: "EMPTY",
              rail: {
                key: "recently-added",
                kind: "RECENTLY_ADDED",
                source: "RECENTLY_ADDED",
                oldestIndexedAt: null,
                freshUntil: null,
                edges: [],
              },
            },
            trending: {
              code: "EMPTY",
              rail: {
                key: "trending",
                kind: "TRENDING",
                source: "TRENDING",
                oldestIndexedAt: null,
                freshUntil: null,
                edges: [],
              },
            },
            genres: { code: "EMPTY", rails: [] },
          },
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Refresh discovery", exact: true }).click();
  await expect(page.getByText("No titles in this rail.", { exact: true })).toHaveCount(3);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.unroute(endpoint);
  await page.goto("/title/00000000-0000-4000-8000-000005099999");
  await expect(
    page.getByRole("heading", { name: "This title is not in the collection.", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  const response = await page.goto("/browse?after=../invalid");
  expect(response?.status()).toBe(404);
});
