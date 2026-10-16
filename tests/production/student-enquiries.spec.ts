import { test, expect } from "@playwright/test";
test("production student enquiry review works under strict CSP without creating a booking", async ({
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
            id: "10000000-0000-4000-8000-000000000981",
            name: "Synthetic production student",
            role: "INDEPENDENT_STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/independent-student/enquiry-context"))
      return route.fulfill({
        json: {
          profileVersion: 1,
          educationScope: {
            stage: "COLLEGE",
            courseName: "BSc Physics",
            studyYear: 2,
          },
          subjects: ["Physics"],
          region: "Raipur",
          gate: "READY",
        },
      });
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto("/dashboard/enquiries?new=1");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await page
    .getByLabel("Subject you need help with", { exact: true })
    .fill("Physics");
  await page
    .getByLabel("Teaching format", { exact: true })
    .selectOption("ONLINE");
  await page
    .getByLabel("Teaching language", { exact: true })
    .selectOption("English");
  await page.getByLabel("Your locality", { exact: true }).fill("Shankar Nagar");
  await page.getByLabel("Monthly budget (₹)", { exact: true }).fill("3000");
  await page.getByLabel("Preferred day 1", { exact: true }).selectOption("2");
  expect(
    (await page
      .getByLabel("Monthly budget (₹)", { exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(48);
  await page.screenshot({
    path: "test-results/student-enquiry-criteria-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review enquiry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your enquiry", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Send my enquiry", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("BSc Physics · Year 2", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
