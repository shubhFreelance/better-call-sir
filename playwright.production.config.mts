import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mts";
export default defineConfig({
  ...base,
  testDir: "./tests/production",
  outputDir: "test-results/production-browser-artifacts",
  use: { ...base.use, baseURL: "http://localhost:3001" },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-production-report" }],
  ],
  webServer: {
    command: "npm run start -w @bcs/web -- --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
