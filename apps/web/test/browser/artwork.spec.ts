import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";

const source = "/artwork/aster-v1.png";
const titleId = "00000000-0000-4000-8000-000005000001";
const optimized = (url: string, width = 480, quality = 75) =>
  `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;

test("static original and bounded optimized variants work without remote image access", async ({
  request,
}, info) => {
  const original = await request.get(source);
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toContain("image/png");
  expect(original.headers()["cache-control"]).toContain("immutable");
  const bytes = await original.body();
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1280);
  expect(bytes.readUInt32BE(20)).toBe(800);
  expect(bytes.length).toBeLessThanOrEqual(102400);
  const measurements: { width: number; bytes: number; format: string }[] = [];
  for (const width of [160, 320, 480, 768, 1280]) {
    const response = await request.get(optimized(source, width), {
      headers: { accept: "image/webp" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    const body = await response.body();
    expect(body.subarray(8, 12).toString()).toBe("WEBP");
    expect(body.length).toBeLessThanOrEqual(102400);
    measurements.push({ width, bytes: body.length, format: "webp" });
  }
  const cached = await request.get(optimized(source), { headers: { accept: "image/webp" } });
  expect(cached.headers()["x-nextjs-cache"]).toBe("HIT");
  const png = await request.get(optimized(source), { headers: { accept: "image/png" } });
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect((await png.body()).length).toBeLessThanOrEqual(102400);
  for (const invalid of [
    optimized("https://example.invalid/unapproved.png"),
    optimized("http://127.0.0.1:4000/private.png"),
    optimized("//example.invalid/unapproved.png"),
    optimized("/health/live"),
    optimized("/profiles"),
    optimized(`${source}?arbitrary=1`),
    optimized(source, 8192),
    optimized(source, 480, 100),
  ]) {
    expect((await request.get(invalid)).status()).toBe(400);
  }
  const report = {
    event: "web_artwork_variants",
    original: {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    variants: measurements,
    invalidRequestsRejected: 8,
  };
  await info.attach("artwork-variants", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify(report));
});

test("cards select responsive resources and detail credits the source-owned illustration", async ({
  browser,
}) => {
  for (const [width, scale, expectedWidth] of [
    [390, 2, 768],
    [1280, 1, 480],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: scale,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const requests: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "image") {
          requests.push(request.url());
        }
      });
      await page.goto("http://127.0.0.1:3000/browse");
      const image = page.locator("[data-artwork] img");
      await expect(image).toHaveAttribute("alt", "");
      await expect(image).toHaveAttribute("loading", "lazy");
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
      const currentSrc = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
      expect(new URL(currentSrc).searchParams.get("w")).toBe(String(expectedWidth));
      const bounds = await page.locator("[data-artwork]").boundingBox();
      if (!bounds) {
        throw new Error("Artwork must reserve visible space.");
      }
      expect(bounds.width / bounds.height).toBeCloseTo(1.6, 1);
      expect(await page.getByRole("img").count()).toBe(0);
      expect(
        await page.locator("body").evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(requests.every((url) => url.startsWith("http://127.0.0.1:3000/_next/image?"))).toBe(
        true,
      );
      await page.locator(`a[href="/title/${titleId}?locale=en"]`).click();
      await expect(page.getByRole("img", { name: /abstract lime-green orbit/u })).toBeVisible();
      await expect(page.getByRole("img")).toHaveAttribute("loading", "eager");
      await expect(page.getByRole("img")).toHaveAttribute("fetchpriority", "high");
      await expect(page.locator("figcaption")).toContainText("not film artwork");
      await expect(page.locator("figcaption").getByRole("link", { name: "MIT" })).toHaveAttribute(
        "href",
        /\/LICENSE$/u,
      );
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test("unavailable artwork keeps layout and navigation with and without JavaScript", async ({
  browser,
}) => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      await context.route("**/_next/image?**", (route) =>
        route.fulfill({ status: 503, body: "Unavailable", contentType: "text/plain" }),
      );
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:3000/browse");
      await page.waitForLoadState("networkidle");
      const cover = page.locator("[data-artwork]");
      await expect(cover).toContainText("Cover unavailable");
      const bounds = await cover.boundingBox();
      if (!bounds) {
        throw new Error("Unavailable artwork must reserve visible space.");
      }
      expect(bounds.width / bounds.height).toBeCloseTo(1.6, 1);
      if (javaScriptEnabled) {
        await expect(cover.locator("img")).toHaveCount(0);
      }
      await page.locator(`a[href="/title/${titleId}?locale=en"]`).click();
      await expect(page.getByRole("heading", { level: 1, name: "Signal / 01" })).toBeVisible();
      await expect(page.locator("figcaption")).toContainText("not film artwork");
    } finally {
      await context.close();
    }
  }
});
