// Playwright config for fortune-mirror E2E.
//
// Target: live production sites (test / lab / oai). We run read-only
// smoke flows against real URLs — the test suite does NOT spin up a
// local dev server, so the same suite doubles as a production monitor.
//
// Run:
//   npx playwright install chromium   (one-time, ~100MB download)
//   npx playwright test               (runs all tests against BASE_URL)
//   BASE_URL=https://lab.destinytelling.life npx playwright test
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,          // keep order predictable vs real backend
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.BASE_URL || "https://test.destinytelling.life",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
