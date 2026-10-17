import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const cursor = "90000000-0000-4000-8000-000000000801";
const entry = (n: number) => ({
  id: `90000000-0000-4000-8000-00000000080${n}`,
  guardianId: "10000000-0000-4000-8000-000000000801",
  educationStage: "SCHOOL",
  grade: 8,
  board: "CBSE",
  subject: n === 1 ? "Maths" : "Physics",
  language: "English",
  mode: "ONLINE",
  region: `Synthetic future city ${n}`,
  status: "PENDING",
  createdAt: "2026-10-17T00:00:00.000Z",
});
async function setup(page: Page) {
  let failure = 0;
  let saved = false;
  const reads: URL[] = [],
    writes: unknown[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: entry(1).guardianId,
            role: "GUARDIAN",
            name: "Synthetic guardian",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (url.pathname.endsWith("/waitlist")) {
      if (route.request().method() === "POST") {
        writes.push(route.request().postDataJSON());
        saved = true;
        return route.fulfill({ status: 201, json: entry(3) });
      }
      reads.push(url);
      if (failure)
        return route.fulfill({
          status: failure,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic private backend detail",
          },
        });
      return route.fulfill({
        json: {
          items:
            saved && !url.searchParams.has("cursor")
              ? [entry(3), entry(1)]
              : [entry(url.searchParams.has("cursor") ? 2 : 1)],
          nextCursor: url.searchParams.has("cursor") ? null : cursor,
        },
      });
    }
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected read" },
    });
  });
  await page.goto("/waitlist");
  await expect(page.locator(".coverage-history li").first()).toBeVisible();
  return {
    reads,
    writes,
    fail(status: number) {
      failure = status;
    },
  };
}
export function waitlistHistoryChecks() {
  test("waitlist next and previous pages preserve entered criteria, page identity and keyboard focus", async ({
    page,
  }) => {
    const s = await setup(page);
    await page.getByLabel("Subject", { exact: true }).fill("Authored subject");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.locator(".coverage-history li")).toContainText(
      "Synthetic future city 2",
    );
    await expect(
      page.getByRole("heading", {
        name: "Your coverage requests",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByText("History page 2", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
      "Authored subject",
    );
    await page
      .getByRole("button", { name: "Previous page", exact: true })
      .click();
    await expect(page.locator(".coverage-history li")).toContainText(
      "Synthetic future city 1",
    );
    expect(
      s.reads.some(
        (u) =>
          u.searchParams.get("cursor") === cursor &&
          u.searchParams.get("limit") === "20",
      ),
    ).toBe(true);
    expect(s.writes).toEqual([]);
  });
  test("failed and missing waitlist pages hide old records and recover through retry or first page", async ({
    page,
  }) => {
    const s = await setup(page);
    s.fail(503);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(
      page.locator(".coverage-history").getByRole("alert"),
    ).toBeVisible();
    await expect(page.locator(".coverage-history li")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "Synthetic private backend detail",
    );
    s.fail(0);
    await page
      .getByRole("button", { name: "Refresh coverage requests", exact: true })
      .click();
    await expect(page.locator(".coverage-history li")).toContainText(
      "Synthetic future city 2",
    );
    s.fail(404);
    await page
      .getByRole("button", { name: "Refresh coverage requests", exact: true })
      .click();
    await expect(page.locator(".coverage-history li")).toHaveCount(0);
    s.fail(0);
    await page
      .getByRole("button", { name: "Return to first page", exact: true })
      .click();
    await expect(page.locator(".coverage-history li")).toContainText(
      "Synthetic future city 1",
    );
    await expect(
      page.getByText("History page 1", { exact: true }),
    ).toBeVisible();
    expect(s.writes).toEqual([]);
  });
  test("a confirmed waitlist save returns to the first page and history refresh failure cannot resubmit it", async ({
    page,
  }) => {
    const s = await setup(page);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.locator(".coverage-history li")).toContainText(
      "Synthetic future city 2",
    );
    await page.getByLabel("Class", { exact: true }).selectOption("8");
    for (const [name, value] of Object.entries({
      "School board": "CBSE",
      Subject: "Maths",
      "Teaching language": "English",
      "City / region": "Synthetic city",
    }))
      await page.getByLabel(name, { exact: true }).fill(value);
    await page.getByRole("checkbox").check();
    s.fail(503);
    await page
      .getByRole("button", {
        name: "Record my interest",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your interest is recorded.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".coverage-history").getByRole("alert"),
    ).toBeVisible();
    s.fail(0);
    await page
      .getByRole("button", { name: "Refresh coverage requests", exact: true })
      .click();
    await expect(page.locator(".coverage-history li").first()).toContainText(
      "Synthetic future city 3",
    );
    expect(s.reads.at(-1)!.searchParams.has("cursor")).toBe(false);
    expect(s.writes).toHaveLength(1);
  });
  test("Hindi waitlist history fits phones with accessible keyboard page controls", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "bcs.interface-language", value: "hi", url: baseURL! },
    ]);
    await page.addInitScript(() =>
      localStorage.setItem("bcs.interface-language", "hi"),
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await setup(page);
    const t = (v: string) => hindiMessages[v] || v;
    await page
      .getByRole("button", { name: t("Next page"), exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: t("Your coverage requests"),
        exact: true,
      }),
    ).toBeFocused();
    await expect(page.locator(".coverage-history li")).toContainText(
      "Synthetic future city 2",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/waitlist-history-hindi-mobile.png",
      fullPage: true,
    });
  });
}
