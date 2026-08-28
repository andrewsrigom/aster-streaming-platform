import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const titleId = process.env["ASTER_PLAYBACK_TITLE_ID"] ?? "00000000-0000-4000-8000-000000080001";
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(titleId)) {
  throw new Error("Invalid local playback test title.");
}
const watch = "/watch/" + titleId + "?locale=en";
test.setTimeout(35000);

const mediaState = (page: Page) =>
  page.locator("video").evaluate((element) => {
    if (!(element instanceof HTMLVideoElement)) {
      throw new Error("Expected video.");
    }
    return {
      time: element.currentTime,
      paused: element.paused,
      ready: element.readyState,
      muted: element.muted,
      rate: element.playbackRate,
      height: element.videoHeight,
    };
  });
async function start(page: Page) {
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect.poll(async () => (await mediaState(page)).ready).toBeGreaterThanOrEqual(2);
}
async function measurements(page: Page) {
  await page.getByRole("button", { name: "Show local playback measurements", exact: true }).click();
  const raw = await page.locator('pre[aria-label="Local playback measurements"]').innerText();
  expect(raw).not.toMatch(/https?:|titleId|sessionId|manifestUrl|token|cookie/u);
  return JSON.parse(raw) as { event: string; atMs: number; durationMs?: number; height?: number }[];
}
async function jsonEvidence(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: "application/json",
  });
}

test("non-delivery sample stays browsable without a Watch action, player or session authority", async ({
  page,
  request,
}, info) => {
  const sampleId = "00000000-0000-4000-8000-000005000001";
  const media: string[] = [];
  page.on("request", (entry) => {
    if (/\.(?:m3u8|ts|vtt)(?:\?|$)/u.test(entry.url())) {
      media.push(entry.url());
    }
  });
  await page.goto(`/title/${sampleId}?locale=en`);
  await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Watch title/u })).toHaveCount(0);
  await expect(
    page.getByText("This browsing sample has no playable video.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/watch/${sampleId}?locale=en`);
  await expect(
    page.getByText("This browsing sample has no playable video.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start playback", exact: true })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
  const response = await request.post("http://127.0.0.1:4000/graphql", {
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-site",
      "x-aster-csrf": "1",
    },
    data: {
      operationName: "StartPlayback",
      query:
        "mutation StartPlayback($titleId: ID!) { createPlaybackSession(titleId: $titleId) { code correlationId session { id titleId manifestUrl expiresAt } } }",
      variables: { titleId: sampleId },
    },
  });
  expect(response.status()).toBe(200);
  const result = (await response.json()) as {
    data: { createPlaybackSession: { code: string; session: unknown } };
  };
  expect(result.data.createPlaybackSession.code).toBe("NOT_PLAYABLE");
  expect(result.data.createPlaybackSession.session).toBeNull();
  expect(media).toEqual([]);
  await jsonEvidence(info, "non-delivery-guard", { code: "NOT_PLAYABLE", mediaRequests: 0 });
});

test("watch metadata is SSR-only until explicit session creation; real media bypasses GraphQL", async ({
  page,
}, info) => {
  const requests: { origin: string; kind: string; startMs: number; responseEndMs: number }[] = [];
  const operations: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("request", (request) => {
    if (request.url() === "http://127.0.0.1:4000/graphql" && request.method() === "POST") {
      const body = request.postDataJSON() as { operationName: string };
      operations.push(body.operationName);
    }
  });
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (!/\.(m3u8|ts|m4s)$/u.test(url.pathname) || requests.length >= 64) {
      return;
    }
    const timing = request.timing();
    requests.push({
      origin: url.origin,
      kind: url.pathname.endsWith(".m3u8") ? "playlist" : "segment",
      startMs: timing.startTime,
      responseEndMs: timing.responseEnd,
    });
  });
  const response = await page.goto(watch);
  if (!response) {
    throw new Error("Expected watch HTML.");
  }
  const html = await response.text();
  expect(html).toContain("Video attribution");
  // Public artwork is SSR metadata; session authority and manifests are not.
  expect(html).not.toMatch(/master\.m3u8|createPlaybackSession|manifestUrl/u);
  await expect(page.getByRole("button", { name: "Start playback", exact: true })).toBeVisible();
  expect(operations).toEqual([]);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Start playback", exact: true }).press("Enter");
  await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThan(0);
  await expect
    .poll(async () => (await measurements(page)).some(({ event }) => event === "first_frame"))
    .toBe(true);
  expect(operations).toEqual(["StartPlayback"]);
  expect(requests.some(({ kind }) => kind === "segment")).toBe(true);
  expect(requests.every(({ origin }) => origin === "http://127.0.0.1:9001")).toBe(true);
  expect(errors).toEqual([]);
  await jsonEvidence(info, "direct-media-waterfall", requests);
  await jsonEvidence(info, "playback-experience", await measurements(page));
  await page.screenshot({ path: info.outputPath("player.png"), fullPage: true });
});

test("keyboard controls change playback, quality and fullscreen; preferences survive reload", async ({
  page,
}, info) => {
  await start(page);
  const play = page.getByRole("button", { name: /^(play|pause)$/u });
  await play.focus();
  await expect(play).toBeFocused();
  if (!(await mediaState(page)).paused) {
    await play.press("Space");
  }
  await expect.poll(async () => (await mediaState(page)).paused).toBe(true);
  const before = (await mediaState(page)).time;
  await page.getByRole("button", { name: "seek forward 10 seconds", exact: true }).press("Enter");
  await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThan(before + 9);
  await page.getByRole("button", { name: "mute", exact: true }).press("Enter");
  await expect.poll(async () => (await mediaState(page)).muted).toBe(true);
  await page.getByRole("button", { name: "Playback rate 1", exact: true }).press("Enter");
  await expect.poll(async () => (await mediaState(page)).rate).toBe(1.25);
  await page.getByRole("combobox", { name: "Quality", exact: true }).selectOption("240");
  await play.press("Enter");
  await expect.poll(async () => (await mediaState(page)).height).toBe(240);
  await page.getByRole("button", { name: "enter fullscreen mode", exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "exit fullscreen mode", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Quality", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "exit fullscreen mode", exact: true }).press("Enter");
  await page.reload();
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect.poll(async () => (await mediaState(page)).rate).toBe(1.25);
  expect((await mediaState(page)).muted).toBe(true);
  await expect(page.getByRole("combobox", { name: "Quality", exact: true })).toHaveValue("240");
  await jsonEvidence(info, "restored-local-preferences", { muted: true, rate: 1.25, quality: 240 });
});

test("player controls have accessible names and no automated WCAG A/AA violations", async ({
  page,
}, info) => {
  await start(page);
  await page.getByRole("button", { name: /^(play|pause)$/u }).focus();
  const result = await new AxeBuilder({ page })
    .include('section[aria-label="Playback"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await jsonEvidence(info, "player-accessibility", {
    violations: result.violations,
    incomplete: result.incomplete,
    passes: result.passes.map(({ id }) => id),
  });
  expect(result.violations).toEqual([]);
  for (const name of ["seek", "volume"]) {
    await expect(page.getByRole("slider", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("combobox", { name: "Caption track", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "closed captions", exact: true })).toHaveCount(0);
});

test("retired/unavailable session is a deliberate retry, never a successful stale player", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("http://127.0.0.1:4000/graphql", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    attempts++;
    await route.fulfill({
      json: {
        data: {
          createPlaybackSession: {
            code: "NOT_PLAYABLE",
            correlationId: "10000000-0000-4000-8000-000000080001",
            session: null,
          },
        },
      },
    });
  });
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "not currently available" }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("button", { name: "Start a new session", exact: true }).press("Enter");
  await expect.poll(() => attempts).toBe(2);
});

test("missing manifest reports one finite media failure and removes the source", async ({
  page,
}) => {
  let loads = 0;
  await page.route("**/master.m3u8", async (route) => {
    loads++;
    await route.fulfill({ status: 404, contentType: "text/plain", body: "missing fixture" });
  });
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "playlist could not be loaded" }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  expect(loads).toBeLessThanOrEqual(2);
});

test("session expiry stops a real attached player without automatic renewal", async ({ page }) => {
  await page.clock.install();
  let sessions = 0;
  page.on("request", (request) => {
    if (request.url() === "http://127.0.0.1:4000/graphql" && request.method() === "POST") {
      sessions++;
    }
  });
  await start(page);
  await page.clock.fastForward(906000);
  await expect(page.getByRole("alert").filter({ hasText: "session expired" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  expect(sessions).toBe(1);
});

test("slow manifest has a bounded deadline and an explicit recovery action", async ({ page }) => {
  await page.clock.install();
  let release: (() => void) | undefined;
  let requested: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/master.m3u8", async (route) => {
    requested?.();
    await stalled;
    await route.abort().catch(() => undefined);
  });
  try {
    await page.goto(watch);
    await page.getByRole("button", { name: "Start playback", exact: true }).click();
    await pending;
    await page.clock.fastForward(22001);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Media delivery stopped|playlist could not be loaded/u }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start a new session", exact: true }),
    ).toBeVisible();
  } finally {
    release?.();
  }
});

test("actual HLS caption selection uses a labeled technical fixture, not invented film dialogue", async ({
  page,
}, info) => {
  await page.route("**/master.m3u8", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    expect(original.length).toBeLessThan(16384);
    const subtitle =
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="fixture",NAME="Technical English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=NO,FORCED=NO,URI="fixture-captions.m3u8"';
    const body = original
      .replace("#EXTM3U", "#EXTM3U\n" + subtitle)
      .replace(/#EXT-X-STREAM-INF:([^\n]+)/gu, "$&," + 'SUBTITLES="fixture"');
    await route.fulfill({ response, body });
    await response.dispose();
  });
  await page.route("**/fixture-captions.m3u8", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: "#EXTM3U\n#EXT-X-TARGETDURATION:600\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:596.5,\nfixture-caption.vtt\n#EXT-X-ENDLIST\n",
    }),
  );
  await page.route("**/fixture-caption.vtt", (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00.000 --> 09:56.500\nAster technical caption fixture — not film dialogue.\n",
    }),
  );
  await start(page);
  const captions = page.getByRole("combobox", { name: "Caption track", exact: true });
  await expect(captions).toBeEnabled();
  await captions.selectOption({ label: "Technical English" });
  await expect
    .poll(() =>
      page.locator("video").evaluate((element) => {
        if (!(element instanceof HTMLVideoElement)) {
          return false;
        }
        return Array.from(element.textTracks).some(
          (track) => track.mode === "showing" && (track.cues?.length ?? 0) > 0,
        );
      }),
    )
    .toBe(true);
  await captions.selectOption("-1");
  await expect(captions).toHaveValue("-1");
  await jsonEvidence(info, "caption-fixture", {
    owner: "Aster contributors",
    purpose: "technical HLS/VTT selection only; not film dialogue",
    selected: true,
    disabledAgain: true,
  });
});

test("navigation cancels a pending session and never attaches a late response", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let arrived: (() => void) | undefined;
  let requests = 0;
  let mediaRequests = 0;
  const pending = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on("request", (request) => {
    if (/\.(m3u8|ts)$/u.test(new URL(request.url()).pathname)) {
      mediaRequests++;
    }
  });
  await page.route("http://127.0.0.1:4000/graphql", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    requests++;
    arrived?.();
    await stalled;
    await route.abort().catch(() => undefined);
  });
  try {
    await page.goto(watch);
    await page.getByRole("button", { name: "Start playback", exact: true }).click();
    await pending;
    await page.getByRole("link", { name: "← Title and full attribution", exact: true }).click();
    await expect(page.getByRole("link", { name: "Watch title", exact: true })).toBeVisible();
    release?.();
    await expect(page.locator("video")).toHaveCount(0);
    expect(requests).toBe(1);
    expect(mediaRequests).toBe(0);
  } finally {
    release?.();
  }
});

test("a missing media segment stops with a recoverable network classification", async ({
  page,
}) => {
  let segmentRequests = 0;
  await page.route("**/*.ts", async (route) => {
    segmentRequests++;
    await route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "missing segment fixture",
    });
  });
  await page.goto(watch);
  await page.getByRole("button", { name: "Start playback", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Media delivery stopped" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  expect(segmentRequests).toBeGreaterThan(0);
  expect(segmentRequests).toBeLessThanOrEqual(4);
});

test("heavy player code is absent from browsing and its watch payload is measured separately", async ({
  page,
}, info) => {
  const pending: Promise<{ asset: string; encodedBytes: number; containsPlayer: boolean }>[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin !== "http://127.0.0.1:3000" ||
      !url.pathname.startsWith("/_next/static/") ||
      !url.pathname.endsWith(".js")
    ) {
      return;
    }
    pending.push(
      (async () => {
        const body = await response.text();
        expect(body.length).toBeLessThan(2 * 1024 * 1024);
        const sizes = await response.request().sizes();
        return {
          asset: url.pathname,
          encodedBytes: sizes.responseBodySize,
          containsPlayer: body.includes("manifestLoadPolicy"),
        };
      })(),
    );
  });
  await page.goto("/browse");
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName("aster.web.hydrated").length))
    .toBeGreaterThan(0);
  const browse = await Promise.all(pending);
  expect(browse.length).toBeGreaterThan(0);
  expect(browse.some(({ containsPlayer }) => containsPlayer)).toBe(false);
  await page.goto(watch);
  await expect(page.getByRole("button", { name: "Start playback", exact: true })).toBeVisible();
  const all = await Promise.all(pending);
  const names = new Set(browse.map(({ asset }) => asset));
  const added = all.filter(({ asset }) => !names.has(asset));
  expect(added.some(({ containsPlayer }) => containsPlayer)).toBe(true);
  await jsonEvidence(info, "lazy-player-payload", {
    scope:
      "Aster script response-body bytes in one fresh browser context; watch adds these assets after browsing. No timing/SLO claim.",
    browseBytes: browse.reduce((total, item) => total + item.encodedBytes, 0),
    addedWatchBytes: added.reduce((total, item) => total + item.encodedBytes, 0),
    browse,
    added,
  });
});
