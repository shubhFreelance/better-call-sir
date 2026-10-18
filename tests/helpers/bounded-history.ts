import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator } from "./contract";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const owner = "10000000-0000-4000-8000-000000000701",
  child = "20000000-0000-4000-8000-000000000701";
const row = (n: number) => ({
  id: "90000000-0000-4000-8000-" + String(n).padStart(12, "0"),
  childId: child,
  text: "Synthetic private history note " + n,
  sharedTeacherId: null,
  acknowledgedAt: null,
  version: 1,
  createdAt: "2026-10-18T00:00:00.000Z",
  learner: { alias: "Synthetic learner", grade: 8, board: "CBSE" },
  sharedTeacher: null,
  sharingActive: false,
});
async function setup(page: Page) {
  let failure = 0,
    repeated = false;
  const reads: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: owner,
            name: "Synthetic guardian",
            role: "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (url.pathname.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role: "GUARDIAN",
          metrics: {},
          children: [
            { id: child, alias: "Synthetic learner", grade: 8, board: "CBSE" },
          ],
          placements: [],
          teachers: [],
          consent: { withdrawnAt: null },
          window: {
            start: "2026-10-18T00:00:00Z",
            end: "2026-10-19T00:00:00Z",
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
        },
      });
    if (url.pathname.endsWith("/notes")) {
      reads.push(url);
      if (failure)
        return route.fulfill({
          status: failure,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic private backend detail",
          },
        });
      const second = url.searchParams.has("cursor"),
        data = {
          items: Array.from({ length: second ? 3 : 50 }, (_, i) =>
            row((second ? 51 : 1) + i),
          ),
          nextCursor: second && !repeated ? null : row(50).id,
        };
      const v = operationValidator("/notes", "get", "200");
      expect(v(data), JSON.stringify(v.errors)).toBe(true);
      return route.fulfill({ json: data });
    }
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected read" },
    });
  });
  await page.goto("/dashboard/notes");
  await expect(page.locator(".notes-card")).toHaveCount(50);
  return {
    reads,
    fail(n: number) {
      failure = n;
    },
    repeat() {
      repeated = true;
    },
  };
}
export function boundedHistoryChecks() {
  test("private note history reaches records beyond fifty and restores keyboard focus after the last page", async ({
    page,
  }) => {
    const s = await setup(page),
      group = page.getByRole("group", {
        name: "Private learning notes",
        exact: true,
      });
    await group
      .getByRole("button", { name: "Load more records", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".notes-card")).toHaveCount(53);
    await expect(group).toBeFocused();
    expect(s.reads.at(-1)!.searchParams.get("cursor")).toBe(row(50).id);
    await expect(
      group.getByRole("button", { name: "Load more records", exact: true }),
    ).toHaveCount(0);
    await group
      .getByRole("button", { name: "Reload history", exact: true })
      .click();
    await expect(page.locator(".notes-card")).toHaveCount(50);
    expect(s.reads.at(-1)!.searchParams.has("cursor")).toBe(false);
  });
  test("failed history pages hide private cached notes and recover without exposing backend errors", async ({
    page,
  }) => {
    const s = await setup(page),
      group = page.getByRole("group", {
        name: "Private learning notes",
        exact: true,
      });
    s.fail(403);
    await group
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(
      group.getByRole("button", { name: "Retry history", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".notes-card")).toHaveCount(0);
    await expect(
      page.getByText("Synthetic private backend detail", { exact: true }),
    ).toHaveCount(0);
    s.fail(0);
    await group
      .getByRole("button", { name: "Reload history", exact: true })
      .click();
    await expect(page.locator(".notes-card")).toHaveCount(50);
  });
  test("repeated history boundaries offer explicit reload and editing locks history controls", async ({
    page,
  }) => {
    const s = await setup(page),
      group = page.getByRole("group", {
        name: "Private learning notes",
        exact: true,
      });
    s.repeat();
    await group
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(group).toContainText(
      "History changed. Reload from the beginning.",
    );
    await expect(page.locator(".notes-card")).toHaveCount(53);
    await page
      .locator(".notes-card")
      .first()
      .getByRole("button", { name: "Edit note", exact: true })
      .click();
    await expect(
      group.getByRole("button", { name: "Reload history", exact: true }),
    ).toBeDisabled();
  });
  test("Hindi history controls fit 320–430px and remain keyboard and screen-reader accessible", async ({
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
    await setup(page);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 850 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const group = page.getByRole("group", {
      name: hindiMessages["Private learning notes"],
      exact: true,
    });
    await group
      .getByRole("button", {
        name: hindiMessages["Load more records"],
        exact: true,
      })
      .focus();
    await page.keyboard.press("Enter");
    await expect(group).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page }).include(".notes-workspace").analyze()
      ).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/bounded-history-hindi-mobile.png",
      fullPage: false,
    });
  });
}
