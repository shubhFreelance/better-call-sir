import { test, expect } from "@playwright/test";
import { teachers } from "../../packages/test-fixtures/src";

test("production Hindi profile recovery hides stale enquiry actions and retries under strict CSP", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addCookies([
    {
      name: "bcs.interface-language",
      value: "hi",
      url: "http://localhost:3001",
    },
  ]);
  let ready = false;
  const profile = {
    ...teachers[0],
    id: "30000000-0000-4000-8000-000000000751",
    slug: "production-recovery-teacher",
    name: "Production Recovery Teacher",
    boards: ["CBSE"],
    grades: [8],
    lockInDays: 15,
  };
  await page.route(
    "**/api/v1/teachers/production-recovery-teacher",
    async (route) => {
      expect(route.request().method()).toBe("GET");
      return ready
        ? route.fulfill({ json: profile })
        : route.fulfill({
            status: 404,
            json: { code: "NOT_FOUND", message: "Private synthetic context" },
          });
    },
  );
  const response = await page.goto("/teachers/production-recovery-teacher");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  const missing = page.getByRole("heading", {
    name: "इस शिक्षक की प्रोफ़ाइल उपलब्ध नहीं है।",
    exact: true,
  });
  await expect(missing).toBeFocused();
  await expect(page.locator("body")).not.toContainText(
    "Private synthetic context",
  );
  ready = true;
  await page.getByRole("button", { name: "यह प्रोफ़ाइल फिर लोड करें" }).click();
  await expect(
    page.getByRole("heading", { name: profile.name, exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "इस शिक्षक के बारे में पूछें" }),
  ).toBeVisible();
  ready = false;
  await page.getByRole("button", { name: "प्रोफ़ाइल रीफ़्रेश करें" }).click();
  await expect(missing).toBeFocused();
  await expect(page.locator(".booking-panel")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: profile.name, exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
