import { test, expect } from "@playwright/test";
test("production student signup hydrates and keeps readiness and age separate under strict CSP", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000989",
            name: "Synthetic production student",
            role: "GUARDIAN",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/independent-student/signup"))
      return route.fulfill({ json: { status: "READY", profile: null } });
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto("/onboarding/independent-student");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await page
    .getByRole("radio", { name: "I can manage my learning", exact: false })
    .check();
  await page.getByRole("radio", { name: "I am under 18", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Continue to education" }),
  ).toHaveCount(0);
  await page
    .getByRole("radio", {
      name: "I declare that I am 18 or older",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Continue to education" }).click();
  await expect(
    page.getByLabel("Education stage", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Language", { exact: true }).selectOption("hi");
  await expect(page.locator("main")).toHaveAttribute("lang", "hi");
  await expect(
    page.getByRole("heading", {
      name: "अपनी पढ़ाई के बारे में बताएँ",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
