import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { teachers } from "../../packages/test-fixtures/src";
import { chooseHindi, checkHindi } from "../helpers/hindi";
const id = "30000000-0000-4000-8000-000000000751";
const profile = {
  ...teachers[0],
  id,
  slug: "recovery-teacher",
  name: "Recovery Teacher",
  boards: ["CBSE"],
  grades: [8],
  demoAvailable: true,
  lockInDays: 15,
};
async function setup(
  page: Page,
  initial: "missing" | "failed" | "ready",
  role = "ANONYMOUS",
) {
  let mode: string = initial;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reads: string[] = [];
  const writes: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() !== "GET") {
      writes.push(path);
      return route.fulfill({
        status: 400,
        json: { code: "UNEXPECTED_WRITE", message: "Unexpected write" },
      });
    }
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        status: role === "ANONYMOUS" ? 401 : 200,
        json:
          role === "ANONYMOUS"
            ? { code: "SESSION_REQUIRED", message: "Sign in" }
            : {
                account: {
                  id: "10000000-0000-4000-8000-000000000751",
                  role,
                  name: "Synthetic Learner",
                  verified: true,
                },
                csrfToken: "synthetic-csrf",
              },
      });
    if (path === "/api/v1/teachers/recovery-teacher") {
      reads.push(path);
      const status = mode;
      if (status === "slow") await gate;
      if (status === "missing" || status === "failed")
        return route.fulfill({
          status: status === "missing" ? 404 : 503,
          json: {
            code: "PRIVATE_BACKEND_DETAIL",
            message: "Internal synthetic credential context",
          },
        });
      return route.fulfill({ json: profile });
    }
    return route.fallback();
  });
  await page.goto("/teachers/recovery-teacher");
  await page.waitForLoadState("networkidle");
  return {
    reads,
    writes,
    release,
    setMode(value: string) {
      mode = value;
    },
  };
}

test("an unavailable profile has precise recovery links without exposing raw errors or enquiry actions", async ({
  page,
}) => {
  const s = await setup(page, "missing");
  const heading = page.getByRole("heading", {
    name: "This teacher profile is unavailable.",
    exact: true,
  });
  await expect(heading).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Browse other teachers" }),
  ).toHaveAttribute("href", "/teachers");
  await expect(
    page
      .locator(".profile-recovery")
      .getByRole("link", { name: "Let us search for you" }),
  ).toHaveAttribute("href", "/teachers?tab=assisted");
  await expect(
    page.getByRole("link", { name: "Enquire about this teacher" }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Internal synthetic credential context",
  );
  expect(s.reads.length).toBeGreaterThan(0);
  expect(
    s.reads.every((path) => path === "/api/v1/teachers/recovery-teacher"),
  ).toBe(true);
  expect(s.writes).toEqual([]);
});

test("retry checks the same profile once, locks the pending action and restores focus after recovery", async ({
  page,
}) => {
  const s = await setup(page, "failed");
  await expect(
    page.getByRole("heading", {
      name: "We couldn’t load this teacher profile.",
      exact: true,
    }),
  ).toBeVisible();
  const beforeRetry = s.reads.length;
  s.setMode("slow");
  await page.getByRole("button", { name: "Retry this profile" }).click();
  await expect(
    page.getByRole("button", { name: "Checking profile…" }),
  ).toBeDisabled();
  await expect(page.locator(".profile-recovery")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".booking-panel")).toHaveCount(0);
  s.release();
  await expect(
    page.getByRole("heading", { name: profile.name, exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Enquire about this teacher" }),
  ).toHaveAttribute(
    "href",
    `/onboarding/parent?teacher=${id}&profile=recovery-teacher`,
  );
  expect(s.reads.length).toBe(beforeRetry + 1);
  expect(
    s.reads.every((path) => path === "/api/v1/teachers/recovery-teacher"),
  ).toBe(true);
  expect(s.writes).toEqual([]);
});

for (const role of ["ANONYMOUS", "INDEPENDENT_STUDENT"])
  test(`failed refresh hides cached details and hiring actions for ${role}`, async ({
    page,
  }) => {
    const s = await setup(page, "ready", role);
    await expect(
      page.getByRole("heading", { name: profile.name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Enquire about this teacher" }),
    ).toHaveAttribute(
      "href",
      role === "INDEPENDENT_STUDENT"
        ? `/dashboard/enquiries?new=1&teacher=${id}&profile=recovery-teacher`
        : `/onboarding/parent?teacher=${id}&profile=recovery-teacher`,
    );
    s.setMode("missing");
    await page
      .getByRole("button", { name: "Refresh profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "This teacher profile is unavailable.",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: profile.name, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".booking-panel")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Enquire about this teacher" }),
    ).toHaveCount(0);
    s.setMode("ready");
    await page.getByRole("button", { name: "Retry this profile" }).click();
    await expect(
      page.getByRole("heading", { name: profile.name, exact: true }),
    ).toBeFocused();
    expect(s.writes).toEqual([]);
  });

test("Hindi profile recovery fits phones and keeps keyboard targets, language and accessibility", async ({
  page,
}) => {
  await chooseHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  const s = await setup(page, "missing");
  await expect(
    page.getByRole("heading", {
      name: "इस शिक्षक की प्रोफ़ाइल उपलब्ध नहीं है।",
      exact: true,
    }),
  ).toBeFocused();
  await checkHindi(page);
  const button = page.getByRole("button", {
    name: "यह प्रोफ़ाइल फिर लोड करें",
  });
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/profile-recovery-hindi-mobile.png",
    fullPage: true,
  });
  s.setMode("ready");
  await button.click();
  await expect(
    page.getByRole("heading", { name: profile.name, exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "प्रोफ़ाइल रीफ़्रेश करें" }),
  ).toBeVisible();
});
