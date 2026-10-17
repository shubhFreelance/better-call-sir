import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
async function mock(page: Page, mode = "normal", role = "GUARDIAN") {
  const writes: { key: string; body: any }[] = [],
    paths: string[] = [],
    entries: any[] = [];
  const replay = new Map<string, any>();
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    paths.push(req.method() + " " + path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        status: role === "ANONYMOUS" ? 401 : 200,
        json:
          role === "ANONYMOUS"
            ? { code: "SESSION_REQUIRED", message: "Sign in" }
            : {
                account: {
                  id: "10000000-0000-4000-8000-000000000301",
                  name: "Synthetic Guardian",
                  role,
                  verified: mode !== "unverified",
                },
                csrfToken: "synthetic-csrf",
              },
      });
    if (path === "/api/v1/teachers")
      return route.fulfill({ json: { items: [] } });
    if (path === "/api/v1/waitlist") {
      if (req.method() === "GET")
        return mode === "read-error"
          ? route.fulfill({
              status: 503,
              json: { code: "UNAVAILABLE", message: "Unavailable" },
            })
          : route.fulfill({ json: { items: entries } });
      const body = req.postDataJSON(),
        key = req.headers()["idempotency-key"];
      writes.push({ key, body });
      expect(validator("WaitlistInput")(body)).toBe(true);
      if (mode === "supported")
        return route.fulfill({
          status: 409,
          json: {
            code: "SUPPORTED_SCOPE",
            message: "Use ordinary free tuition intake for supported scope.",
          },
        });
      if (mode === "consent")
        return route.fulfill({
          status: 403,
          json: {
            code: "CONSENT_REQUIRED",
            message:
              "Adult verification and active guardian consent are required.",
          },
        });
      if (!replay.has(key)) {
        const {
          stage = "SCHOOL",
          level,
          grade,
          board,
          courseName,
          studyYear,
          ...criteria
        } = body;
        const result = {
          ...criteria,
          educationStage: stage,
          grade: stage === "SCHOOL" ? grade : null,
          board: stage === "SCHOOL" ? board : null,
          earlyYearsLevel: stage === "EARLY_YEARS" ? level : null,
          courseName: stage === "COLLEGE" ? courseName : null,
          studyYear: stage === "COLLEGE" ? studyYear : null,
          id: "80000000-0000-4000-8000-000000000301",
          guardianId: "10000000-0000-4000-8000-000000000301",
          status: "PENDING",
          createdAt: new Date().toISOString(),
        };
        expect(validator("Waitlist")(result)).toBe(true);
        entries.push(result);
        replay.set(key, result);
      }
      if (mode === "uncertain" && writes.length === 1)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable waitlist response",
        });
      return route.fulfill({ status: 201, json: replay.get(key) });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Mock route unavailable" },
    });
  });
  return { writes, paths, entries };
}
async function fill(page: Page) {
  await page.getByLabel("Class", { exact: true }).selectOption("11");
  await page.getByLabel("School board", { exact: true }).fill("CBSE");
  await page.getByLabel("Subject", { exact: true }).fill("Maths");
  await page.getByLabel("Teaching language", { exact: true }).fill("English");
  await page.getByLabel("City / region", { exact: true }).fill("Raipur");
  await page.getByRole("checkbox", { name: /records interest only/ }).check();
}
test("waitlist validates criteria, saves once and restores private history after reload", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/waitlist");
  await page
    .getByRole("button", { name: "Record my interest", exact: true })
    .click();
  await expect(
    page.getByText(/Complete each learning criterion/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await expect(page.getByLabel("Class", { exact: true })).toBeFocused();
  await fill(page);
  await page
    .getByRole("button", { name: "Record my interest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your interest is recorded." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record another coverage request" }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(Object.keys(state.writes[0].body).sort()).toEqual([
    "board",
    "grade",
    "language",
    "mode",
    "region",
    "subject",
  ]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Class 11 · Maths", exact: true }),
  ).toBeVisible();
  expect(
    state.paths.some(
      (p) =>
        p.includes("/children") ||
        p.includes("/requests") ||
        p.includes("/placements"),
    ),
  ).toBe(false);
});
test("uncertain waitlist retries the same criteria and key without another entry", async ({
  page,
}) => {
  const state = await mock(page, "uncertain");
  await page.goto("/waitlist");
  await fill(page);
  await page
    .getByRole("button", { name: "Record my interest", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t confirm your request/),
  ).toBeVisible();
  await expect(page.getByLabel("School board", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh coverage requests" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same waitlist request" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your interest is recorded." }),
  ).toBeVisible();
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.entries).toHaveLength(1);
});
test("supported scope recovers to a free enquiry without losing form criteria", async ({
  page,
}) => {
  const state = await mock(page, "supported");
  await page.goto("/waitlist");
  await fill(page);
  await page
    .getByRole("button", { name: "Record my interest", exact: true })
    .click();
  await expect(
    page.getByText(/This region accepts ordinary teacher enquiries/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Send a free enquiry" }),
  ).toHaveAttribute("href", "/onboarding/parent");
  await expect(page.getByLabel("City / region", { exact: true })).toHaveValue(
    "Raipur",
  );
  expect(state.entries).toHaveLength(0);
});
for (const role of ["STUDENT", "TEACHER", "ANONYMOUS"])
  test(`${role.toLowerCase()} cannot collect or fetch guardian waitlist criteria`, async ({
    page,
  }) => {
    const state = await mock(page, "normal", role);
    await page.goto("/waitlist");
    await expect(
      page.getByRole("heading", { name: "Tell us where to grow next." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record my interest", exact: true }),
    ).toHaveCount(0);
    expect(state.paths.some((p) => p.endsWith("/waitlist"))).toBe(false);
  });
test("verification, consent and failed-history recovery preserve the boundary", async ({
  page,
}) => {
  await mock(page, "unverified");
  await page.goto("/waitlist");
  await expect(
    page.getByText(/Guardian verification is pending/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record my interest", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/v1/**");
  await mock(page, "read-error");
  await page.reload();
  await expect(
    page.getByText(/Saved requests could not be loaded/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record my interest", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/v1/**");
  await mock(page, "consent");
  await page.reload();
  await fill(page);
  await page
    .getByRole("button", { name: "Record my interest", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Review permission and verification" }),
  ).toBeVisible();
  await expect(page.getByLabel("School board", { exact: true })).toHaveValue(
    "CBSE",
  );
});
test("empty discovery offers assistance and future coverage without claiming supply", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/teachers");
  await page
    .getByRole("combobox", { name: "Subject", exact: true })
    .selectOption("Science");
  await expect(
    page.getByRole("heading", {
      name: "No teachers match these filters right now.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Need another class, subject or city?" }),
  ).toHaveAttribute("href", "/waitlist");
  await page
    .getByRole("button", { name: "Let us search for you", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Let us search for you" }),
  ).toHaveAttribute("aria-selected", "true");
});
test("waitlist desktop and mobile forms have accessible spacing and no overflow", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/waitlist");
  await expect(
    page.getByRole("button", { name: "Record my interest", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/waitlist-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/waitlist-mobile.png",
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
test("real verified guardian records unsupported coverage and reads it after reload", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: /Kavita/ }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, Kavita/ }),
  ).toBeVisible();
  await page.goto("/waitlist");
  await fill(page);
  const board = "Synthetic-" + crypto.randomUUID().slice(0, 8);
  await page.getByLabel("School board", { exact: true }).fill(board);
  const region = "Synthetic-" + crypto.randomUUID().slice(0, 8);
  await page.getByLabel("City / region", { exact: true }).fill(region);
  await page
    .getByRole("button", { name: "Record my interest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your interest is recorded." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(new RegExp(board + " · English · " + region, "i")),
  ).toBeVisible();
});
for (const stage of ["EARLY_YEARS", "COLLEGE"])
  test(`future-region waitlist records ${stage} criteria without school class or identity`, async ({
    page,
  }) => {
    const state = await mock(page);
    await page.goto("/waitlist");
    await page
      .getByLabel("Education stage", { exact: true })
      .selectOption(stage);
    if (stage === "COLLEGE") {
      await page
        .getByLabel("Course / degree", { exact: true })
        .fill("BSc Physics");
      await page.getByLabel("Study year", { exact: true }).fill("2");
    } else
      await page
        .getByLabel("Early years level", { exact: true })
        .selectOption("KG1");
    await page
      .getByLabel("Subject", { exact: true })
      .fill(stage === "COLLEGE" ? "Mechanics" : "Language");
    await page.getByLabel("Teaching language", { exact: true }).fill("English");
    await page
      .getByLabel("City / region", { exact: true })
      .fill("Synthetic future region");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Record my interest", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your interest is recorded." }),
    ).toBeVisible();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].body.stage).toBe(stage);
    expect(state.writes[0].body).not.toHaveProperty("grade");
    expect(state.writes[0].body).not.toHaveProperty("alias");
    await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
  });

 test("Hindi complete interface — प्रतीक्षा सूची", async ({ page }) => {
 await chooseHindi(page);
 await mock(page);
 await page.goto("/waitlist");
 await checkHindi(page);
 await page.setViewportSize({ width: 360, height: 800 });
 await checkHindi(page);
 });
