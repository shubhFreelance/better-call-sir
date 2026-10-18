import { test, expect } from "@playwright/test";
export function searchReadinessChecks() {
  test.describe("search readiness without scripts", () => {
    test.use({ javaScriptEnabled: false });
    test("initial loading screen cannot accept search criteria before handlers are ready", async ({
      page,
    }) => {
      await page.goto("/teachers");
      await expect(
        page.getByRole("heading", { name: "Getting things ready…" }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toHaveText("Loading…");
      await expect(
        page.getByLabel("Education stage", { exact: true }),
      ).not.toBeVisible();
      await expect(
        page.getByLabel("Search teachers", { exact: true }),
      ).not.toBeVisible();
    });
  });
}
