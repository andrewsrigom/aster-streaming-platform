import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import { publicArtifactFindings } from "../../scripts/public-artifacts";

test("served HTML and browser-loaded public/lazy assets contain no private server artifacts", async ({
  page,
  request,
}, info) => {
  const artifacts: { path: string; bytes: number; sha256: string }[] = [];
  const origin = "http://127.0.0.1:3000";
  async function inspect(path: string, contentType: RegExp) {
    const response = await request.get(`${origin}${path}`, { timeout: 8000 });
    try {
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toMatch(contentType);
      const body = await response.body();
      expect(body.length).toBeGreaterThan(0);
      expect(publicArtifactFindings(body.toString("utf8"))).toEqual([]);
      artifacts.push({
        path,
        bytes: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
      });
    } finally {
      await response.dispose();
    }
  }
  for (const path of [
    "/",
    "/browse",
    "/browse?locale=pt-BR",
    "/search",
    "/search?q=Signal",
    "/title/00000000-0000-4000-8000-000005000001",
    "/attribution",
    "/profiles",
  ]) {
    await inspect(path, /text\/html/u);
  }
  await page.goto("/browse");
  await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start local session" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const paths = await page.evaluate(() => [
    ...new Set(
      performance
        .getEntriesByType("resource")
        .map((entry) => new URL(entry.name))
        .filter(
          (url) =>
            url.origin === location.origin &&
            url.pathname.startsWith("/_next/static/") &&
            /\.(?:js|css)$/u.test(url.pathname),
        )
        .map((url) => url.pathname),
    ),
  ]);
  expect(paths.length).toBeGreaterThan(1);
  expect(paths.length).toBeLessThanOrEqual(64);
  for (const path of paths) {
    await inspect(path, /(?:javascript|text\/css)/u);
  }
  await info.attach("public-artifact-inventory", {
    body: JSON.stringify(artifacts),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify({
      event: "web_served_artifact_scan",
      htmlRoutes: 8,
      loadedAssets: paths.length,
      findings: 0,
    }),
  );
});
