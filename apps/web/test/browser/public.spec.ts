import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { print } from "graphql";
import { TITLE_DETAIL, type DetailData } from "../../lib/apollo/operations";

const titleId = "00000000-0000-4000-8000-000005000001";

test("valid title details omit absent optional metadata without empty separators", async ({
  page,
}) => {
  await page.goto("/title/" + titleId);
  await expect(page.getByRole("heading", { level: 1, name: "Signal / 01" })).toBeVisible();
  const baselineResponse = await page.request.post("http://127.0.0.1:4000/graphql", {
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-site",
      "x-aster-csrf": "1",
    },
    data: {
      operationName: "TitleDetail",
      query: print(TITLE_DETAIL),
      variables: { id: titleId, locale: "en" },
    },
  });
  expect(baselineResponse.ok()).toBe(true);
  const baseline = (await baselineResponse.json()) as { data: DetailData };
  expect(baseline.data.title).not.toBeNull();
  await baselineResponse.dispose();
  let genres: string[] = ["Short"];
  await page.route("http://127.0.0.1:4000/graphql", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = {
      data: { title: { ...baseline.data.title, releaseYear: null, runtimeSeconds: null, genres } },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.getByRole("button", { name: "Refresh collection", exact: true }).click();
  await expect(page.locator("article > p", { hasText: /^Short$/u })).toBeVisible();
  await expect(page.locator("article > p.text-sm:not(.border)")).toHaveText("Short");
  genres = [];
  await page.getByRole("button", { name: "Refresh collection", exact: true }).click();
  await expect(page.locator("article > p", { hasText: /^Short$/u })).toHaveCount(0);
  await expect(page.locator("article > p.text-sm:not(.border)")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Attribution and rights" })).toBeVisible();
});

test("published public HTML hydrates without browser GraphQL or automatic route prefetch", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const unexpected: string[] = [];
  const started = new Date().toISOString();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(message.text());
    }
  });
  page.on("request", (request) => {
    if (request.url().includes("/graphql") || request.url().includes("_rsc=")) {
      unexpected.push(request.url());
    }
  });
  const response = await page.goto("/");
  if (!response) {
    throw new Error("Expected an HTML navigation response.");
  }
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<h3[^>]*>Signal \/ 01<\/h3>/u);
  await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
  const router = process.env["ASTER_ROUTER_CONTAINER"] ?? "aster-router-1";
  expect(router).toMatch(/^aster(?:-[a-z0-9-]+)?-router-1$/u);
  const logs = await promisify(execFile)("docker", ["logs", "--since", started, router], {
    timeout: 3000,
    maxBuffer: 65536,
    windowsHide: true,
  });
  const events = logs.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const operations = events.filter(
    (event) => event["kind"] === "aster.router.operation" && event["aster.operation"] === "Browse",
  );
  expect(operations).toHaveLength(1);
  expect(operations[0]?.["graphql_error"]).toBe(false);
  await info.attach("ssr-html", { body: html, contentType: "text/html" });
  console.log(
    JSON.stringify({
      event: "web_public_hydration",
      browserGraphqlOrPrefetch: unexpected.length,
      consoleErrorsOrWarnings: errors.length,
      ssrTitle: true,
      routerBrowseOperations: operations.length,
    }),
  );
});

test("Portuguese public browsing and title attribution work with JavaScript disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "fr-FR" });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3000/browse?locale=pt-BR");
    await expect(page.getByRole("heading", { name: "Sinal / 01", exact: true })).toBeVisible();
    await page.locator(`a[href="/title/${titleId}?locale=pt-BR"]`).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sinal / 01" })).toBeVisible();
    await expect(page.getByText("Copyright holder", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "MIT · unversioned" })).toHaveAttribute(
      "href",
      /\/LICENSE$/u,
    );
  } finally {
    await context.close();
  }
});

test("delayed scripts do not hide public content or create hydration mismatches", async ({
  page,
}) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/_next/static/**/*.js", async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto("/browse?locale=pt-BR", { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Sinal / 01", exact: true })).toBeVisible();
  } finally {
    release();
  }
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("keyboard-only skip, title navigation and attribution navigation", async ({ page }) => {
  await page.goto("/browse");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  const card = page.locator(`a[href="/title/${titleId}?locale=en"]`);
  for (
    let step = 0;
    step < 4 && !(await card.evaluate((element) => element === document.activeElement));
    step++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(card).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Signal / 01" })).toBeVisible();
  const attribution = page.getByRole("link", { name: "Attribution", exact: true });
  for (
    let step = 0;
    step < 10 && !(await attribution.evaluate((element) => element === document.activeElement));
    step++
  ) {
    await page.keyboard.press("Tab");
  }
  await expect(attribution).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Credit where it belongs." }),
  ).toBeVisible();
  await expect(page.getByText("Copyright holder", { exact: true })).toBeVisible();
});
