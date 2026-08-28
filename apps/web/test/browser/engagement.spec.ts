import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { print } from "graphql";
import { PROFILES } from "../../features/identity/operations";

test.skip(
  process.env["ASTER_ENGAGEMENT_DEMO"] !== "true",
  "Requires a fresh isolated personalized playable demo.",
);
const endpoint = "http://127.0.0.1:4000/graphql";
const titleId = "00000000-0000-4000-8000-000007000001";
const watch = `/watch/${titleId}?locale=en`;
async function createProfile(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "Your profiles" });
  await dialog.getByRole("button", { name: "Create profile", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Fictional display name" }).fill(name);
  await dialog.getByRole("button", { name: "Save profile", exact: true }).click();
  await dialog.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(dialog.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "Close profiles" }).click();
}
function savedResponse(page: Page, position?: number, status?: string) {
  return page.waitForResponse(
    async (response) => {
      if (
        response.url() !== endpoint ||
        response.request().method() !== "POST" ||
        (response.request().postDataJSON() as { operationName?: string }).operationName !==
          "RecordProgress"
      ) {
        return false;
      }
      const result = (await response.json()) as {
        data?: {
          recordProgress?: {
            code: string;
            progress?: { positionMs: number; status: string };
          };
        };
      };
      const value = result.data?.recordProgress;
      return (
        value?.code === "COMPLETED" &&
        !!value.progress &&
        (position === undefined || Math.abs(value.progress.positionMs - position) < 150) &&
        (status === undefined || value.progress.status === status)
      );
    },
    { timeout: 12000 },
  );
}

test("real profile progress, resume, library, watchlist and optional-save failure", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  const initial = await page.goto("/library");
  expect(initial?.status()).toBe(200);
  const html = await initial?.text();
  expect(html).not.toMatch(/profileId|positionMs|aster_local_session=/u);
  await page.getByRole("button", { name: "Choose a profile", exact: true }).click();
  await page.getByRole("button", { name: "Start local session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create profile", exact: true })).toBeVisible();
  const before = await context.request.post(endpoint, {
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-site",
      "x-aster-csrf": "1",
    },
    data: { query: print(PROFILES), operationName: "Profiles" },
  });
  const baseline = (await before.json()) as { data?: { profiles: { profiles: unknown[] } } };
  expect(
    baseline.data?.profiles.profiles,
    "Refuse to modify a retained profile collection",
  ).toEqual([]);
  await createProfile(page, "Journey One");
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).press("Enter");
  const video = page.locator("video");
  await expect(page.getByText(/^Journey One: /u)).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThan(1);
  const saved = savedResponse(page, 2000, "IN_PROGRESS");
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    media.pause();
    media.currentTime = 2;
  });
  await saved;
  await expect(page.getByText("Journey One: Progress saved.", { exact: true })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: "Resume title", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Viewing history", exact: true }).click();
  await expect(page.getByRole("link", { name: "Signal / 02", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Signal / 02", exact: true }).click();
  await page.getByRole("button", { name: "Manage watchlist", exact: true }).click();
  await page.getByRole("button", { name: "Add to watchlist", exact: true }).click();
  await expect(page.getByText("This title is in your watchlist.", { exact: true })).toBeVisible();
  await page.goto("/library");
  await page.getByRole("button", { name: "Watchlist", exact: true }).click();
  await expect(page.getByRole("link", { name: "Signal / 02", exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole("button", { name: "Remove from watchlist", exact: true }).click();
  await expect(page.getByText("Nothing here yet.", { exact: true })).toBeVisible();
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect(page.getByText(/^Journey One: /u)).toBeVisible();
  const resume = page.getByRole("button", { name: /^Resume at /u });
  if (await resume.isVisible()) {
    await resume.click();
  }
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThanOrEqual(1.9);
  const completion = savedResponse(page, undefined, "COMPLETED");
  await video.evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    media.currentTime = media.duration - 0.1;
    await media.play();
  });
  await completion;
  await page.goto("/library");
  await expect(page.getByText("Nothing here yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Viewing history", exact: true }).click();
  await expect(page.getByText(/· Completed$/u)).toBeVisible();
  await page.getByRole("button", { name: "Choose a profile", exact: true }).click();
  await createProfile(page, "Journey Two");
  await expect(page.getByText("Profile: Journey Two", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Viewing history", exact: true }).click();
  await expect(page.getByText("Nothing here yet.", { exact: true })).toBeVisible();
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect(page.getByText(/^Journey Two: /u)).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThan(1);
  await page.route(endpoint, async (route) => {
    if (
      route.request().method() === "POST" &&
      (route.request().postDataJSON() as { operationName?: string }).operationName ===
        "RecordProgress"
    ) {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    media.pause();
    media.currentTime = 1;
  });
  await expect(
    page.getByText(/Journey Two: (Saved progress is unavailable|Save not confirmed)/u),
  ).toBeVisible();
  await video.evaluate((element) => (element as HTMLVideoElement).play());
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.2);
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Close profiles", exact: true }).click();
  await expect(
    page.getByText("Sign in and select a profile to save progress. Anonymous playback continues.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(
    /profileId|positionMs|manifestUrl|Journey One|Journey Two/u,
  );
  expect(errors).toEqual([]);
  await info.attach("engagement-journey", {
    contentType: "application/json",
    body: JSON.stringify({
      savedAndResumed: true,
      completedInHistoryOnly: true,
      watchlistAddedAndRemoved: true,
      profileIsolation: true,
      saveTransportFailureDoesNotStopMedia: true,
      signedOutPrivateStateCleared: true,
      axeViolations: axe.violations.length,
      browser: context.browser()?.version(),
      limitation:
        "fresh generated six-second demo; injected browser transport failure, not a host benchmark",
    }),
  });
});
