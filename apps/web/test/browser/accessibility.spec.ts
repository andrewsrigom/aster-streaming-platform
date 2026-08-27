import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type TestInfo } from "@playwright/test";

const titlePath = "/title/00000000-0000-4000-8000-000005000001";
const endpoint = "http://127.0.0.1:4000/graphql";

async function audit(page: Page, info: TestInfo, state: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const summarize = (items: typeof result.violations) =>
    items.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target }) => target),
      checks: nodes.flatMap((node) =>
        [...node.any, ...node.all, ...node.none].map(({ id, message, relatedNodes }) => ({
          id,
          message,
          relatedTargets: relatedNodes?.map(({ target }) => target),
        })),
      ),
    }));
  const report = {
    state,
    engine: result.testEngine,
    environment: result.testEnvironment,
    viewport: page.viewportSize(),
    violations: summarize(result.violations),
    incomplete: summarize(result.incomplete),
    passedRules: result.passes.map(({ id }) => id),
    inapplicableRules: result.inapplicable.map(({ id }) => id),
  };
  await info.attach(`accessibility-${state}`, {
    body: JSON.stringify(report),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify({
      event: "web_accessibility",
      state,
      violations: report.violations,
      incomplete: report.incomplete.map(({ id }) => id),
    }),
  );
  expect(report.violations).toEqual([]);
  for (const incomplete of report.incomplete) {
    if (incomplete.id === "color-contrast") {
      const measurements: { ratio: number; foreground: string; background: string }[] = [];
      for (const target of incomplete.targets) {
        expect(target).toHaveLength(1);
        const selector = target[0];
        if (typeof selector !== "string") {
          throw new Error("Unexpected contrast target.");
        }
        const targetElement = page.locator(selector);
        const artwork = await targetElement.evaluate((element) =>
          element.parentElement?.hasAttribute("data-artwork"),
        );
        expect(artwork).toBe(true);
        await expect(targetElement).toHaveText("Cover unavailable");
        // The opaque illustration covers this fallback. Retain the original
        // incomplete result and measure its actual flat foreground/background.
        const measurement = await targetElement.evaluate((element) => {
          const luminance = (color: string) => {
            const channels = /^rgb\((\d+), (\d+), (\d+)\)$/u.exec(color);
            if (!channels) {
              throw new Error("Expected opaque RGB artwork colors.");
            }
            return channels.slice(1).reduce((total, channel, index) => {
              const value = Number(channel) / 255;
              const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
              const weight = [0.2126, 0.7152, 0.0722][index];
              if (weight === undefined) {
                throw new Error("Unexpected color channel.");
              }
              return total + linear * weight;
            }, 0);
          };
          const surface = element.parentElement;
          if (!surface) {
            throw new Error("Missing artwork background.");
          }
          const foreground = getComputedStyle(element).color;
          const background = getComputedStyle(surface).backgroundColor;
          const fg = luminance(foreground);
          const bg = luminance(background);
          return {
            foreground,
            background,
            ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
          };
        });
        expect(measurement.ratio).toBeGreaterThanOrEqual(4.5);
        measurements.push(measurement);
      }
      await info.attach(`fallback-contrast-${state}`, {
        body: JSON.stringify({ measurements }),
        contentType: "application/json",
      });
      continue;
    }
    // axe cannot prove Radix's runtime focus trap. Check its actual behavior,
    // including focus guards and the aria-hidden background, without excluding a rule.
    expect(incomplete.id).toBe("aria-hidden-focus");
    const dialog = page.getByRole("dialog", { name: "Your profiles" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(0);
    await page.locator(".skip-link").focus();
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let step = 0; step < 12; step++) {
        await page.keyboard.press(key);
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
      }
    }
    await info.attach(`focus-containment-${state}`, {
      body: JSON.stringify({
        outsideFocusRecovered: true,
        forwardTabs: 12,
        backwardTabs: 12,
        backgroundMainExposed: false,
      }),
      contentType: "application/json",
    });
  }
  return report;
}

for (const width of [390, 1280]) {
  test(`public routes and Portuguese metadata pass automated accessibility at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 844 });
    for (const [path, heading] of [
      ["/", /A little curiosity\.\s*A different perspective\./u],
      ["/browse?locale=pt-BR", "Browse the Aster collection"],
      [titlePath, "Signal / 01"],
      ["/attribution", "Credit where it belongs."],
      ["/profiles", "Who is exploring?"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await audit(page, info, `${width}-${path.split("?")[0]?.replaceAll("/", "-") || "home"}`);
    }
  });
}

test("profile dialog exposes labelled signed-out, busy, list, create and failure states", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60000);
  let release = () => {};
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/profiles");
    const launcher = page.getByRole("button", { name: "Choose a profile" });
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: "Your profiles" });
    await expect(dialog).toHaveAccessibleDescription(/Local demo only/u);
    await expect(page.getByRole("button", { name: "Start local session" })).toBeVisible();
    await audit(page, info, "profiles-signed-out");
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(endpoint, async (route) => {
      await held;
      await route.continue();
    });
    await page.getByRole("button", { name: "Start local session" }).click();
    await expect(page.getByRole("button", { name: "Starting session…" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Close profiles" })).toBeFocused();
    await expect(
      dialog.getByRole("status").filter({ hasText: "Saving with Identity…" }),
    ).toBeVisible();
    try {
      // Inspect the real transient state within the unmodified four-second deadline.
      // A full axe scan plus tab traversal can outlive it on a busy host.
      await page.locator(".skip-link").focus();
      const close = page.getByRole("button", { name: "Close profiles" });
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(close).toBeFocused();
      await info.attach("busy-semantics", {
        body: JSON.stringify({
          state: "profiles-busy",
          outsideFocusRecovered: true,
          forwardAndBackwardTrap: true,
          snapshot: await dialog.ariaSnapshot(),
        }),
        contentType: "application/json",
      });
    } finally {
      release();
    }
    await expect(page.getByRole("button", { name: "Create profile", exact: true })).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    await audit(page, info, "profiles-list");
    await page.getByRole("button", { name: "Create profile", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Create a profile", exact: true }),
    ).toBeFocused();
    await audit(page, info, "profiles-create");
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
    await page.route(endpoint, (route) => route.fulfill({ status: 503, body: "unavailable" }));
    await launcher.click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await audit(page, info, "profiles-unavailable");
    await page.keyboard.press("Escape");
    await expect(launcher).toBeFocused();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    const response = await context.request.post(endpoint, {
      timeout: 8000,
      headers: {
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "same-site",
        "x-aster-csrf": "1",
      },
      data: { operationName: "SignOut", query: "mutation SignOut { signOut { code } }" },
    });
    expect(response.ok()).toBe(true);
  }
});
