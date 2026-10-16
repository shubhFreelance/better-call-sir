import { test, expect } from "@playwright/test";
import { teachers } from "../../packages/test-fixtures/src";
for (const days of [null, 0, 15, 30]) {
  test(`discovery and profile display the recorded lock-in preference ${days}`, async ({
    page,
  }) => {
    const teacher = {
      ...teachers[0],
      slug: "synthetic-lock-in-teacher",
      id: "30000000-0000-4000-8000-000000000001",
      boards: ["CBSE"],
      grades: [8],
      capabilityLabel: "Reviewed subject coverage",
      consultationOptIn: false,
      lockInDays: days,
    };
    await page.route("**/api/v1/teachers**", async (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        json:
          url.pathname === "/api/v1/teachers"
            ? { items: [teacher], nextCursor: null }
            : teacher,
      });
    });
    const label =
      days === null
        ? "Lock-in preference not recorded"
        : days === 0
          ? "No lock-in period"
          : `${days}-day lock-in preference`;
    await page.goto("/teachers");
    await page.getByRole("textbox", { name: "Search teachers" }).fill("Ananya");
    await expect(page.getByText("1 teachers to get to know")).toBeVisible();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: teacher.name, exact: true }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Teacher-declared preference. Cancellation restrictions are not currently enforced.",
      ),
    ).toBeVisible();
  });
}
