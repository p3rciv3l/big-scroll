import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./web-tests/browser",
  timeout: 120_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 1,
  reporter: "line",
  webServer: {
    command: "python3 -m http.server 4173 --directory site",
    port: 4173,
    reuseExistingServer: true,
  },
  use: {
    ...devices["iPhone 13"],
    baseURL: "http://127.0.0.1:4173",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
});
