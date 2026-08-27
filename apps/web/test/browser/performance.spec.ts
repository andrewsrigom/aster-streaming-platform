import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import type { Metric } from "web-vitals";

// DOM snapshots and trace recording perturb input-to-paint timing under CPU throttling.
test.use({ trace: "off", screenshot: "off" });

const budgets = {
  initialJs: 250 * 1024,
  interactiveJs: 350 * 1024,
  image: 100 * 1024,
  initialImages: 200 * 1024,
  LCP: 2500,
  INP: 200,
  CLS: 0.1,
  hydration: 3500,
};

async function resources(page: Page) {
  return page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => ({
      path: new URL(entry.name).pathname,
      bytes: entry.encodedBodySize,
      decodedBytes: entry.decodedBodySize,
      type: entry.initiatorType,
    })),
  );
}

test("cold mobile browsing and explicit interactions meet the initial laboratory budgets", async ({
  browser,
  request,
}, info) => {
  test.setTimeout(60000);
  const library = await readFile(
    new URL("./web-vitals.attribution.iife.js", import.meta.resolve("web-vitals")),
    "utf8",
  );
  expect((await request.get("/browse")).status()).toBe(200);
  expect(
    (
      await request.get("/_next/image?url=%2Fartwork%2Faster-v1.png&w=768&q=75", {
        headers: { accept: "image/webp" },
      })
    ).status(),
  ).toBe(200);
  const samples = [];
  for (let visit = 1; visit <= 3; visit++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: "en-US",
      serviceWorkers: "block",
    });
    try {
      const page = await context.newPage();
      const vitals: Partial<Record<"LCP" | "INP" | "CLS", number>> = {};
      let interaction: unknown;
      await page.exposeFunction(
        "__asterReportMetric",
        (metric: Pick<Metric, "name" | "value"> & { events: unknown }) => {
          if (metric.name === "LCP" || metric.name === "INP" || metric.name === "CLS") {
            vitals[metric.name] = metric.value;
          }
          if (metric.name === "INP") {
            interaction = metric.events;
          }
        },
      );
      await page.addInitScript({
        content: `${library}
          if (location.origin === "http://127.0.0.1:3000") {
            for (const register of [webVitals.onLCP, webVitals.onINP, webVitals.onCLS]) {
              register(({ name, value, attribution }) => window.__asterReportMetric({
                name, value, events: name === "INP" ? {
                  inputDelay: attribution.inputDelay,
                  processingDuration: attribution.processingDuration,
                  presentationDelay: attribution.presentationDelay,
                  target: attribution.interactionTarget,
                  scripts: attribution.longAnimationFrameEntries.slice(0, 10).flatMap(f =>
                    f.scripts.slice(0, 10).map(s => ({
                      duration: s.duration, invoker: s.invoker,
                      sourceURL: s.sourceURL, sourceFunctionName: s.sourceFunctionName
                    })))
                } : null
              }), {
                reportAllChanges: true, durationThreshold: 16
              });
            }
          }`,
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8,
        connectionType: "cellular3g",
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const automaticRequests: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("/graphql") || req.url().includes("_rsc=")) {
          automaticRequests.push(req.url());
        }
      });
      await page.goto("http://127.0.0.1:3000/browse");
      await page.waitForFunction(() => performance.getEntriesByName("aster.web.hydrated").length);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
      expect(automaticRequests).toEqual([]);
      const initial = await resources(page);
      const hydration = await page.evaluate(() => {
        const marks = performance.getEntriesByName("aster.web.hydrated");
        return { count: marks.length, ms: marks[0]?.startTime };
      });
      expect(hydration.count).toBe(1);
      expect(hydration.ms).toBeDefined();
      const response = page.waitForResponse("http://127.0.0.1:4000/graphql");
      await page.getByRole("button", { name: "Refresh collection" }).click();
      expect((await response).status()).toBe(200);
      await page.getByRole("button", { name: "Profiles", exact: true }).click();
      await expect(page.getByRole("button", { name: "Start local session" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await page.waitForLoadState("networkidle");
      const interactive = await resources(page);
      const initialJs = initial.filter((resource) => resource.path.endsWith(".js"));
      const interactiveJs = interactive.filter((resource) => resource.path.endsWith(".js"));
      const images = initial.filter((resource) => resource.type === "img");
      const sum = (entries: { bytes: number }[]) =>
        entries.reduce((total, entry) => total + entry.bytes, 0);
      expect(initialJs.length).toBeGreaterThan(0);
      expect(initialJs.every((resource) => resource.bytes > 0)).toBe(true);
      expect(images.length).toBeGreaterThan(0);
      expect(images.every((resource) => resource.bytes > 0)).toBe(true);
      // End the real document lifecycle; headless tabs do not become hidden on bringToFront.
      await page.goto("about:blank");
      await expect.poll(() => Object.keys(vitals).sort()).toEqual(["CLS", "INP", "LCP"]);
      const sample = {
        visit,
        initialJsBytes: sum(initialJs),
        interactiveJsBytes: sum(interactiveJs),
        initialImageBytes: sum(images),
        hydrationMs: hydration.ms,
        vitals: { ...vitals },
        interaction,
        initialResources: initial,
        interactiveResources: interactive,
        initialBrowserGraphqlOrPrefetch: 0,
      };
      samples.push(sample);
      await info.attach(`performance-visit-${visit}`, {
        body: JSON.stringify(sample, null, 2),
        contentType: "application/json",
      });
      console.log(
        JSON.stringify({
          event: "web_mobile_lab",
          visit,
          initialJsBytes: sample.initialJsBytes,
          interactiveJsBytes: sample.interactiveJsBytes,
          initialImageBytes: sample.initialImageBytes,
          hydrationMs: sample.hydrationMs,
          vitals: sample.vitals,
          interaction,
        }),
      );
      expect.soft(sample.initialJsBytes).toBeLessThanOrEqual(budgets.initialJs);
      expect.soft(sample.interactiveJsBytes).toBeLessThanOrEqual(budgets.interactiveJs);
      expect.soft(sample.initialImageBytes).toBeLessThanOrEqual(budgets.initialImages);
      expect.soft(images.every((resource) => resource.bytes <= budgets.image)).toBe(true);
      expect.soft(sample.hydrationMs).toBeLessThanOrEqual(budgets.hydration);
      expect.soft(vitals.LCP).toBeLessThanOrEqual(budgets.LCP);
      expect.soft(vitals.INP).toBeLessThanOrEqual(budgets.INP);
      expect.soft(vitals.CLS).toBeLessThanOrEqual(budgets.CLS);
    } finally {
      await context.close();
    }
  }
  await info.attach("performance-lab", {
    body: JSON.stringify({ browser: browser.version(), budgets, samples }, null, 2),
    contentType: "application/json",
  });
});
