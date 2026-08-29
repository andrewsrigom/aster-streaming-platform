import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { print } from "graphql";
import { PROFILES } from "../../features/identity/operations";

const endpoint = "http://127.0.0.1:4000/graphql";
const headers = {
  origin: "http://127.0.0.1:3000",
  "sec-fetch-site": "same-site",
  "x-aster-csrf": "1",
};
const docker = async (...args: string[]) =>
  promisify(execFile)("docker", args, {
    timeout: 8000,
    maxBuffer: 16384,
    windowsHide: true,
  });

async function createSelectedProfile(page: Page) {
  await page.getByRole("button", { name: "Choose a profile", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your profiles" });
  await dialog.getByRole("button", { name: "Start local session" }).click();
  await dialog.getByRole("button", { name: "Create profile", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Fictional display name" }).fill("Discovery fixture");
  await dialog.getByRole("button", { name: "Save profile", exact: true }).click();
  const profile = dialog.getByRole("button", { name: /^Discovery fixture/u });
  await profile.click();
  await expect(profile).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Close profiles" }).click();
}

async function cleanupProfile(request: APIRequestContext, profileId: string) {
  await request.post(endpoint, {
    headers,
    data: {
      operationName: "DeleteProfile",
      query:
        "mutation DeleteProfile($input: DeleteProfileInput!) { deleteProfile(input: $input) { code } }",
      variables: { input: { mutationId: randomUUID(), profileId, expectedVersion: 1 } },
    },
  });
  await request.post(endpoint, {
    headers,
    data: { operationName: "SignOut", query: "mutation SignOut { signOut { code } }" },
  });
}

test("public home and search are server-rendered with no automatic browser GraphQL", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const browserGraphql: string[] = [];
  page.on("request", (request) => {
    if (request.url() === endpoint) {
      browserGraphql.push(request.url());
    }
  });
  try {
    const home = await page.goto("http://127.0.0.1:3000/?locale=pt-BR");
    expect(home?.status()).toBe(200);
    await expect(
      page.getByLabel("Featured").getByRole("heading", { name: "Sinal / 01", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Fallback · recently added", { exact: true })).toHaveCount(2);
    const search = await page.goto("http://127.0.0.1:3000/search?q=Signal&locale=en");
    expect(search?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Signal / 01", exact: true })).toBeVisible();
    expect(browserGraphql).toEqual([]);
  } finally {
    await context.close();
  }
});

test("search distinguishes empty, stale, expired cursor and invalid URL input", async ({
  page,
}) => {
  await page.goto("/search?q=missing-result-fixture");
  await expect(
    page.getByText("No published titles match this search.", { exact: true }),
  ).toBeVisible();
  await page.route(endpoint, (route) => {
    const request = route.request().postDataJSON() as { operationName?: string };
    if (request.operationName !== "SearchTitles") {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          searchTitles: {
            code: "STALE",
            correlationId: "00000000-0000-4000-8000-000000090001",
            connection: null,
          },
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Refresh discovery", exact: true }).click();
  await expect(
    page.getByText("Search is stale and is not being presented as current.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Discovery is temporarily unavailable", { exact: false }),
  ).toHaveCount(0);
  await page.unroute(endpoint);
  expect(
    (
      await page.goto("/search?q=one%20two%20three%20four%20five%20six%20seven%20eight%20nine")
    )?.status(),
  ).toBe(404);
});

test("home personalization starts after profile selection and private failure leaves public rails", async ({
  page,
  context,
}) => {
  let profileId: string | undefined;
  try {
    await page.goto("/");
    await expect(
      page.getByText("Sign in and select a local profile to use continue watching."),
    ).toBeVisible();
    await createSelectedProfile(page);
    const profiles = await context.request.post(endpoint, {
      headers,
      data: { operationName: "Profiles", query: print(PROFILES) },
    });
    profileId = ((await profiles.json()) as { data: { profiles: { activeProfileId: string } } })
      .data.profiles.activeProfileId;
    await expect(page.getByText("Profile: Discovery fixture", { exact: true })).toBeVisible();
    await expect(page.getByText("No titles in progress.", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Featured").getByRole("heading", { name: "Signal / 01", exact: true }),
    ).toBeVisible();
    await page.route(endpoint, (route) => {
      const request = route.request().postDataJSON() as { operationName?: string };
      return request.operationName === "HomePersonalized"
        ? route.fulfill({ status: 503, body: "private failure canary" })
        : route.continue();
    });
    await page.reload();
    await expect(
      page.getByText("Continue watching is unavailable. Public discovery remains available.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText("private failure canary");
    await expect(
      page.getByLabel("Featured").getByRole("heading", { name: "Signal / 01", exact: true }),
    ).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    if (profileId) {
      await cleanupProfile(context.request, profileId);
    }
  }
});

test("Discovery outage degrades home while Catalog browse remains available", async ({ page }) => {
  test.setTimeout(30000);
  const discovery = process.env["ASTER_DISCOVERY_CONTAINER"] ?? "aster-discovery-1";
  expect(discovery).toMatch(/^aster(?:-[a-z0-9-]+)?-discovery-1$/u);
  const inspection = await docker("inspect", "--format", "{{json .Config.Labels}}", discovery);
  const labels = JSON.parse(inspection.stdout) as Record<string, string>;
  expect(labels["com.aster.environment"]).toBe("local");
  expect(labels["com.docker.compose.service"]).toBe("discovery");
  try {
    await docker("pause", discovery);
    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Discovery is temporarily unavailable",
    );
    await expect(page.getByRole("link", { name: "Browse the current Catalog" })).toBeVisible();
    await page.goto("/browse");
    await expect(page.getByRole("heading", { name: "Signal / 01", exact: true })).toBeVisible();
  } finally {
    await docker("unpause", discovery);
  }
  await page.goto("/search?q=Signal");
  await expect(page.getByRole("link", { name: "Signal / 01", exact: true })).toBeVisible();
});
