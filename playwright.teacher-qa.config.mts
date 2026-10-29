import base from "./playwright.production.config.mts";
export default {
  ...base,
  use: { ...base.use, actionTimeout: 10000, navigationTimeout: 20000 },
  testDir: "./tests/qa",
  testMatch: "teacher-journey.spec.ts",
  timeout: 120000,
  outputDir: "test-results/teacher-real-qa",
  reporter: [["list"] as const],
};
