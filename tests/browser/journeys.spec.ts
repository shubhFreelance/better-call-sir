import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function login(page: import("@playwright/test").Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Hello, ${name.split(" ")[0]}`),
    }),
  ).toBeVisible();
}
test("public discovery, filters and teacher profile work against the real API", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A little guidance. A world of possibilities.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Meet all teachers" }).click();
  await expect(page.getByText("4 teachers to get to know")).toBeVisible();
  await page.getByRole("textbox", { name: "Search teachers" }).fill("Ananya");
  await expect(page.getByText("1 teachers to get to know")).toBeVisible();
  await page.getByRole("link", { name: "Ananya Sharma", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ananya Sharma", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Recurring tuition is paid directly"),
  ).toBeVisible();
});
test("parent intake persists and appears on the private dashboard", async ({
  page,
}) => {
  await login(page, "Kavita");
  await page.goto("/onboarding/parent");
  await page
    .getByLabel("Link an existing learner")
    .selectOption({ label: "Aarav · Class 8" });
  await page
    .getByLabel("When do lessons work for your family?")
    .fill("Tuesday and Thursday after 5pm");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save my tuition request" }).click();
  await expect(page.getByText(/Request .* saved/)).toBeVisible();
  await page.goto("/dashboard/requests");
  await expect(
    page.getByText(/Tuesday and Thursday after 5pm/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Waiting for operator review/).first(),
  ).toBeVisible();
});
test("student principal has own classes and no parent finance navigation", async ({
  page,
}) => {
  await login(page, "Aarav");
  await expect(
    page.getByRole("link", { name: "Parent Pro", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Classes & attendance" }).click();
  await expect(
    page.getByRole("heading", { name: "Every class, accounted for." }),
  ).toBeVisible();
  await expect(page.getByText("Maths · recurring").first()).toBeVisible();
});
test("role switch and logout clear private pages", async ({ page }) => {
  await login(page, "Kavita");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue." }),
  ).toBeVisible();
  await login(page, "Ananya");
  await expect(
    page.getByRole("heading", { name: "Your teaching profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
});
test("admin console reads real queues and failed provider controls stay explicit", async ({
  page,
}) => {
  await login(page, "Operator");
  await page.getByRole("link", { name: "Control console" }).click();
  await expect(
    page.getByRole("heading", { name: "A thoughtful control room." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  await expect(page.getByText(/live adapters unconfigured/)).toBeVisible();
});
test("360px layout has no overflow and labelled keyboard-accessible forms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("link", { name: "Find a teacher", exact: true })
    .first()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await login(page, "Kavita");
  await page.goto("/onboarding/parent");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Learner alias")).toBeVisible();
  await page.screenshot({
    path: "test-results/parent-onboarding-mobile.png",
    fullPage: true,
  });
});
test("public discovery has no serious or critical axe accessibility findings", async ({
  page,
}) => {
  await page.goto("/teachers");
  await expect(page.getByText("4 teachers to get to know")).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});
test("homepage screenshot and server-rendered catalog contain real API profiles", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(await response.text()).toContain("Ananya Sharma");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ananya Sharma" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
});
