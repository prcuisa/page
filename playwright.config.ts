import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  webServer: {
    command: "npm run start -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
  testDir: "./tests",
  testMatch: "*.spec.ts",
  use: {
    launchOptions: process.env.BROWSER_EXECUTABLE_PATH
      ? {
          executablePath: process.env.BROWSER_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : undefined,
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
