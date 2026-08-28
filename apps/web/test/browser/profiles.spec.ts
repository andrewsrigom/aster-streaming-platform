import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { publicArtifactFindings } from "../../scripts/public-artifacts";

const endpoint = "http://127.0.0.1:4000/graphql";

test("failed mutation and failed owner recheck never announce a refreshed session", async ({
  page,
  context,
}) => {
  await page.goto("/profiles");
  await page.getByRole("button", { name: "Choose a profile" }).click();
  await page.getByRole("button", { name: "Start local session" }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  try {
    for (const failedRead of ["Viewer", "Profiles"]) {
      await page.route(endpoint, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const request = route.request().postDataJSON() as { operationName?: string };
        if (request.operationName === "SignOut" || request.operationName === failedRead) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ errors: [{ message: "private failure canary" }] }),
          });
        } else {
          await route.continue();
        }
      });
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("alert")).toContainText("Profiles are temporarily unavailable");
      await expect(dialog).not.toContainText("Session refreshed");
      await expect(dialog).not.toContainText("private failure canary");
      await expect(
        dialog
          .locator('[aria-live="polite"][aria-atomic="true"]')
          .filter({ hasText: "Check the current session" }),
      ).toBeVisible();
      await page.unroute(endpoint);
      await page.getByRole("button", { name: "Retry session" }).click();
      await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    }
  } finally {
    await page.unroute(endpoint);
    await context.request.post(endpoint, {
      headers,
      data: { operationName: "SignOut", query: "mutation SignOut { signOut { code } }" },
    });
  }
});
const headers = {
  origin: "http://127.0.0.1:3000",
  "sec-fetch-site": "same-site",
  "x-aster-csrf": "1",
};
async function cleanupProfile(request: APIRequestContext, profileId: string) {
  const signedIn = await request.post(endpoint, {
    headers,
    data: { operationName: "DemoSignIn", query: "mutation DemoSignIn { demoSignIn { code } }" },
  });
  expect(signedIn.ok()).toBe(true);
  const removed = await request.post(endpoint, {
    headers,
    data: {
      operationName: "DeleteProfile",
      query:
        "mutation DeleteProfile($input: DeleteProfileInput!) { deleteProfile(input: $input) { code } }",
      variables: { input: { mutationId: randomUUID(), profileId, expectedVersion: 1 } },
    },
  });
  const result = (await removed.json()) as { data?: { deleteProfile: { code: string } } };
  expect(result.data?.deleteProfile.code).toBe("COMPLETED");
  await request.post(endpoint, {
    headers,
    data: { operationName: "SignOut", query: "mutation SignOut { signOut { code } }" },
  });
}

async function profileSnapshot(request: APIRequestContext) {
  const response = await request.post(endpoint, {
    headers,
    data: {
      operationName: "Profiles",
      query: "query Profiles { profiles { profiles { id displayName } } }",
    },
  });
  const body = (await response.json()) as {
    data: { profiles: { profiles: { id: string; displayName: string }[] } };
  };
  return body.data.profiles.profiles;
}

test("real local session creates/selects a profile with keyboard focus and private cache reset", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      errors.push(message.text());
    }
  });
  let created: string | undefined;
  let baseline: Set<string> | undefined;
  try {
    const response = await page.goto("/profiles");
    const html = await response?.text();
    expect(html).toContain("Who is exploring?");
    expect(html).not.toContain("aster_local_session=");
    const launcher = page.getByRole("button", { name: "Choose a profile" });
    await expect(launcher).toHaveCSS("justify-content", "center");
    await launcher.focus();
    await page.keyboard.press("Enter");
    const modal = page.getByRole("dialog", { name: "Your profiles" });
    await expect(modal).toBeVisible();
    const close = page.getByRole("button", { name: "Close profiles" });
    await expect(close).toBeFocused();
    await expect(page.getByRole("button", { name: "Start local session" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Start local session" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Create profile", exact: true })).toBeVisible();
    const before = new Set((await profileSnapshot(context.request)).map((profile) => profile.id));
    baseline = before;
    const cookie = (await context.cookies(endpoint)).find(
      (entry) => entry.name === "aster_local_session",
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(await page.evaluate(() => document.cookie.includes("aster_local_session"))).toBe(false);
    await page.getByRole("button", { name: "Create profile", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Create a profile", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("textbox", { name: "Fictional display name" })).toBeFocused();
    await page.keyboard.type("Browser fixture");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save profile" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page
        .locator('[aria-live="polite"][aria-atomic="true"]')
        .filter({ hasText: "Profile created" }),
    ).toBeVisible();
    const added = (await profileSnapshot(context.request)).filter(
      (profile) => !before.has(profile.id) && profile.displayName === "Browser fixture",
    );
    expect(added).toHaveLength(1);
    created = added[0]?.id;
    if (!created || !cookie?.value) {
      throw new Error("Expected a disposable profile and an HTTP-only session.");
    }
    for (const path of [
      "/",
      "/browse",
      "/title/00000000-0000-4000-8000-000005000001",
      "/attribution",
      "/profiles",
    ]) {
      const publicResponse = await context.request.get(`http://127.0.0.1:3000${path}`, {
        timeout: 8000,
      });
      expect(publicResponse.status()).toBe(200);
      expect(
        publicArtifactFindings(await publicResponse.text(), [
          created,
          "Browser fixture",
          cookie.value,
        ]),
      ).toEqual([]);
      expect(publicResponse.headers()["set-cookie"]).toBeUndefined();
      await publicResponse.dispose();
    }
    console.log(
      JSON.stringify({
        event: "web_authenticated_ssr_isolation",
        routes: 5,
        privateValues: 3,
        findings: 0,
      }),
    );
    const choice = page.getByRole("button", { name: /Browser fixture/u });
    await expect(choice).toBeVisible();
    await expect(choice).toHaveCSS("justify-content", "space-between");
    await expect(choice).toHaveCSS("text-align", "left");
    await expect(choice).toContainText("pt-BR");
    await choice.focus();
    await page.keyboard.press("Enter");
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(launcher).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    const other = await context.newPage();
    await other.goto("/profiles");
    await other.getByRole("button", { name: "Choose a profile" }).click();
    await expect(other.getByRole("button", { name: /Browser fixture/u })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await other.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(other.getByRole("button", { name: "Start local session" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start local session" })).toBeVisible();
    await expect(choice).toHaveCount(0);
    expect(
      (await context.cookies(endpoint)).some((entry) => entry.name === "aster_local_session"),
    ).toBe(false);
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    expect(errors).toEqual([]);
    await other.close();
  } finally {
    if (!created && baseline) {
      const before = baseline;
      const added = (await profileSnapshot(context.request)).filter(
        (profile) => !before.has(profile.id) && profile.displayName === "Browser fixture",
      );
      if (added.length === 1) {
        created = added[0]?.id;
      }
    }
    if (created) {
      await cleanupProfile(context.request, created);
    }
  }
});

test("Router accepts exact Web preflight but rejects forged origin and fetch metadata", async ({
  request,
}) => {
  const preflight = await request.fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      origin: headers.origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-aster-csrf",
    },
  });
  expect(preflight.ok()).toBe(true);
  expect(preflight.headers()["access-control-allow-origin"]).toBe(headers.origin);
  expect(preflight.headers()["access-control-allow-credentials"]).toBe("true");
  for (const wrong of [
    { ...headers, origin: "http://127.0.0.1:3001" },
    { ...headers, origin: "https://untrusted.invalid" },
    { ...headers, "sec-fetch-site": "cross-site" },
    { ...headers, "sec-fetch-site": "same-origin" },
    { ...headers, "x-aster-csrf": "0" },
    { ...headers, "x-aster-account-id": "forged" },
  ]) {
    const result = await request.post(endpoint, {
      headers: wrong,
      data: { operationName: "DemoSignIn", query: "mutation DemoSignIn { demoSignIn { code } }" },
    });
    expect(result.status()).toBe(403);
    expect(result.headers()["set-cookie"]).toBeUndefined();
  }
});

test("profile outage exposes retry and keeps public browsing available", async ({ page }) => {
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ errors: [{ message: "private failure canary" }] }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Profiles", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Profiles are temporarily unavailable",
  );
  await expect(page.getByRole("dialog")).not.toContainText("private failure canary");
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Retry session" }).click();
  await expect(page.getByRole("button", { name: "Start local session" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
});

test("expiry removes private controls without a refetch loop and reduced-motion dialog traps focus", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/profiles");
  const launcher = page.getByRole("button", { name: "Choose a profile" });
  await launcher.click();
  await page.getByRole("button", { name: "Start local session" }).click();
  await expect(page.getByRole("button", { name: "Create profile", exact: true })).toBeVisible();
  let requests = 0;
  page.on("request", (request) => {
    if (request.url() === endpoint) {
      requests++;
    }
  });
  await page.clock.fastForward(1801000);
  await expect(page.getByRole("button", { name: "Recheck session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create profile", exact: true })).toHaveCount(0);
  expect(requests).toBe(0);
  const close = page.getByRole("button", { name: "Close profiles" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Recheck session" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  expect(await close.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0s",
  );
  await page.keyboard.press("Escape");
  await expect(launcher).toBeFocused();
  // Only the browser clock advanced; revoke the actual local session through its owner.
  await context.request.post(endpoint, {
    headers,
    data: { operationName: "SignOut", query: "mutation SignOut { signOut { code } }" },
  });
});
