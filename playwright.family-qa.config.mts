import base from "./playwright.teacher-qa.config.mts";
export default {
  ...base,
  use: { ...base.use, baseURL: "http://localhost:3002" },
  webServer: {
    ...base.webServer,
    command: "npm run start -w @bcs/web -- --port 3002",
    url: "http://localhost:3002",
  },
  testMatch: "family-journey.spec.ts",
  timeout: 180000,
  outputDir: "test-results/family-real-qa",
};
