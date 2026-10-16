import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator } from "../helpers/contract";
async function setup(
  page: Page,
  mode: "normal" | "uncertain" | "stale" | "load-error" = "normal",
) {
  let progress = {
    kind: "STUDENT",
    state: "ACTIVE",
    version: 0,
    completedResourceId: null,
    draft: {} as any,
  };
  const bodies: any[] = [],
    keys: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000099",
            name: "Synthetic Learner",
            role: "STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/onboarding/student")) {
      if (mode === "load-error")
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Unavailable" },
        });
      return route.fulfill({ json: progress });
    }
    if (path.endsWith("/onboarding/student/drafts")) {
      const body = req.postDataJSON();
      bodies.push(body);
      keys.push(req.headers()["idempotency-key"]);
      if (mode === "stale") {
        progress = {
          ...progress,
          version: 2,
          draft: {
            language: "Hindi",
            learningPreferences: "Saved in another tab",
          },
        };
        return route.fulfill({
          status: 409,
          json: {
            code: "CONFLICT",
            message: "The onboarding draft changed or was already submitted.",
          },
        });
      }
      if (bodies.length === 1 || mode !== "uncertain") {
        expect(body.expectedVersion).toBe(progress.version);
        progress = {
          ...progress,
          version: progress.version + 1,
          draft: body.draft,
        };
      }
      if (mode === "uncertain" && bodies.length === 1)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable saved response",
        });
      const check = operationValidator(
        "/onboarding/{kind}/drafts",
        "post",
        "201",
      );
      expect(check(progress), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ status: 201, json: progress });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Mock route unavailable" },
    });
  });
  return { bodies, keys, getProgress: () => progress };
}
test("student optional preferences save privately, resume and clear without creating an enquiry", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/onboarding/student");
  await expect(
    page.getByRole("heading", { name: "Your student space is ready." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Skip for now" }),
  ).toHaveAttribute("href", "/dashboard");
  expect(state.bodies).toHaveLength(0);
  await page.getByRole("checkbox", { name: "Maths", exact: true }).check();
  await page.getByLabel("Language you prefer (optional)").selectOption("Hindi");
  await page
    .getByLabel("How do you like to learn? (optional)")
    .fill("Please use pictures.");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByText("Your learning preferences are saved."),
  ).toBeVisible();
  expect(state.bodies[0].draft).toEqual({
    subjects: ["Maths"],
    language: "Hindi",
    learningPreferences: "Please use pictures.",
  });
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Maths", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("How do you like to learn? (optional)"),
  ).toHaveValue("Please use pictures.");
  await page.getByRole("checkbox", { name: "Maths", exact: true }).uncheck();
  await page.getByLabel("Language you prefer (optional)").selectOption("");
  await page.getByLabel("How do you like to learn? (optional)").fill("");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByText("Your learning preferences are saved."),
  ).toBeVisible();
  expect(state.getProgress().draft).toEqual({ subjects: [] });
});
test("uncertain student preference writes lock edits and retry the exact saved body and key", async ({
  page,
}) => {
  const state = await setup(page, "uncertain");
  await page.goto("/onboarding/student");
  await page
    .getByLabel("How do you like to learn? (optional)")
    .fill("Give me time to try.");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText(/We couldn’t confirm the save/)).toBeVisible();
  await expect(
    page.getByLabel("How do you like to learn? (optional)"),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Skip for now" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry saving preferences" }).click();
  await expect(
    page.getByText("Your learning preferences are saved."),
  ).toBeVisible();
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  expect(state.getProgress().version).toBe(1);
});
test("student stale preferences preserve input until explicit reload", async ({
  page,
}) => {
  await setup(page, "stale");
  await page.goto("/onboarding/student");
  await page
    .getByLabel("How do you like to learn? (optional)")
    .fill("My current edits");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByLabel("How do you like to learn? (optional)"),
  ).toHaveValue("My current edits");
  await expect(
    page.getByRole("button", { name: "Save preferences" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload saved preferences" }).click();
  await expect(
    page.getByLabel("How do you like to learn? (optional)"),
  ).toHaveValue("Saved in another tab");
});
test("failed student preference reads block edits while the student notice stays available", async ({
  page,
}) => {
  await setup(page, "load-error");
  await page.goto("/onboarding/student");
  await expect(
    page.getByText(/We couldn’t load your saved preferences/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save preferences" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Keep your details private." }),
  ).toBeVisible();
});
test("student welcome uses accessible desktop and mobile spacing", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/onboarding/student");
  await expect(
    page.getByRole("button", { name: "Save preferences" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/student-welcome-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/student-welcome-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});
