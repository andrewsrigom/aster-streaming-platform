import { defineConfig } from "@playwright/test";

const executablePath = process.env["ASTER_BROWSER_EXECUTABLE_PATH"];
export default defineConfig({
  testDir: "./test/browser",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15000,
  expect: { timeout: 5000 },
  reporter: [["list"], ["json", { outputFile: "test-results/browser-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    navigationTimeout: 10000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
