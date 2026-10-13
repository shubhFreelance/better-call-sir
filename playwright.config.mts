import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results/browser-artifacts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: chromium.args.filter(
        (arg) =>
          !arg.includes("disable-web-security") &&
          !arg.includes("single-process"),
      ),
      executablePath: await chromium.executablePath(),
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
