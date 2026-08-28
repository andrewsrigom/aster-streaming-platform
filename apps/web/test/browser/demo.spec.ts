import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip(
  process.env["ASTER_PLAYABLE_DEMO"] !== "true",
  "Requires the isolated playable Compose demo.",
);
test("Docker-only generated demo plays real HLS with captions, direct delivery and bounded diagnostics", async ({
  page,
  request,
}, info) => {
  test.setTimeout(30000);
  const errors: string[] = [];
  const media: { origin: string; kind: string }[] = [];
  let manifest: string | undefined;
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("request", (entry) => {
    const url = new URL(entry.url());
    if (/\.(?:m3u8|ts|vtt)$/u.test(url.pathname)) {
      if (media.length < 32) {
        media.push({ origin: url.origin, kind: url.pathname.split(".").at(-1) ?? "unknown" });
      }
      if (url.pathname.endsWith("/master.m3u8")) {
        manifest = url.href;
      }
    }
  });
  const response = await page.goto("/watch/00000000-0000-4000-8000-000007000001?locale=en");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Signal / 02", exact: true })).toBeVisible();
  expect(await response?.text()).not.toMatch(/createPlaybackSession|manifestUrl|master\.m3u8/u);
  expect(media).toEqual([]);
  await page.getByRole("button", { name: "Start playback", exact: true }).press("Enter");
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: /^pause$/iu }).click();
  const captions = page.getByRole("combobox", { name: "Caption track", exact: true });
  await expect(captions).toBeEnabled();
  await expect(captions).toHaveValue("-1");
  await captions.selectOption({ label: "English" });
  await expect
    .poll(() =>
      video.evaluate((element) =>
        Array.from((element as HTMLVideoElement).textTracks).some(
          (track) => track.mode === "showing" && (track.cues?.length ?? 0) > 0,
        ),
      ),
    )
    .toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Show local playback measurements", exact: true }).click();
  const metrics = await page.locator('pre[aria-label="Local playback measurements"]').innerText();
  expect(metrics).toContain('"first_frame"');
  expect(metrics).not.toMatch(/https?:|sessionId|manifestUrl|token|cookie/u);
  expect(errors).toEqual([]);
  expect(media.some(({ kind }) => kind === "ts")).toBe(true);
  expect(media.some(({ kind }) => kind === "vtt")).toBe(true);
  expect(media.every(({ origin }) => origin === "http://127.0.0.1:9001")).toBe(true);
  if (!manifest) {
    throw new Error("Missing direct manifest request.");
  }
  for (const url of [
    manifest.replace("master.m3u8", "source.mkv"),
    manifest.replace("master.m3u8", "report.json"),
    "http://127.0.0.1:9001/aster-media-published?list-type=2",
    "http://127.0.0.1:9001/aster-media-originals?list-type=2",
    "http://127.0.0.1:9001/aster-media-published/publications/" + "0".repeat(64) + "/master.m3u8",
  ]) {
    const denied = await request.get(url, { timeout: 3000 });
    expect([403, 404]).toContain(denied.status());
  }
  await info.attach("playable-demo", {
    body: JSON.stringify(
      {
        browser: page.context().browser()?.version(),
        media,
        measurements: JSON.parse(metrics) as unknown,
        axe: {
          violations: accessibility.violations.length,
          incomplete: accessibility.incomplete.map(({ id }) => id),
        },
        originalAndReportNotPublic: true,
        listingAndOtherPrefixDenied: true,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("playable-demo.png"), fullPage: true });
});
