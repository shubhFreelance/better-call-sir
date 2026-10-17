import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { teachers } from "../../packages/test-fixtures/src";
import { chooseHindi, checkHindi } from "../helpers/hindi";
const cursor = "30000000-0000-4000-8000-000000000701";
const secondCursor = "30000000-0000-4000-8000-000000000702";
const teacher = (n: number) => ({
  ...teachers[0],
  id: `30000000-0000-4000-8000-00000000070${n}`,
  slug: `pagination-teacher-${n}`,
  name: `Pagination Teacher ${n}`,
  boards: ["CBSE"],
  grades: [8],
  demoAvailable: true,
  lockInDays: 0,
});
async function setup(page: Page, mode = "normal") {
  const requests: URL[] = [];
  let failures = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/teachers?**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get("q")?.startsWith("pagination"))
      return route.fallback();
    requests.push(url);
    if (url.searchParams.get("q") === "pagination replacement")
      return route.fulfill({ json: { items: [teacher(3)], nextCursor: null } });
    const after = url.searchParams.get("cursor");
    if (mode === "initial-error" && !after && failures++ === 0)
      return route.fulfill({
        status: 503,
        json: {
          code: "UNAVAILABLE",
          message: "Search is temporarily unavailable.",
        },
      });
    if (!after)
      return route.fulfill({
        json: { items: [teacher(1)], nextCursor: cursor },
      });
    if (mode === "slow") await gate;
    if (mode === "retry" && failures++ === 0)
      return route.fulfill({
        status: 503,
        json: {
          code: "UNAVAILABLE",
          message: "Page is temporarily unavailable.",
        },
      });
    return route.fulfill({
      json:
        after === cursor
          ? {
              items: [teacher(1), teacher(2)],
              nextCursor:
                mode === "repeat" &&
                requests.filter((r) => r.searchParams.has("cursor")).length ===
                  1
                  ? cursor
                  : secondCursor,
            }
          : { items: [teacher(3)], nextCursor: null },
    });
  });
  await page.goto("/teachers");
  await page
    .getByRole("textbox", { name: /Search teachers|शिक्षक खोजें/ })
    .fill("pagination");
  if (mode !== "initial-error")
    await expect(
      page.getByRole("heading", { name: "Pagination Teacher 1", exact: true }),
    ).toBeVisible();
  return { requests, release };
}

test("search appends cursor pages without duplicates, preserves criteria and moves focus after the last page", async ({
  page,
}) => {
  const s = await setup(page);
  await page.getByLabel("Subject", { exact: true }).selectOption("Maths");
  await page.getByLabel("Lesson mode", { exact: true }).selectOption("ONLINE");
  await page
    .getByRole("button", { name: "Load more teachers", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 1", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("2 teachers to get to know", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load more teachers", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 teachers to get to know", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("All matching teachers are shown.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more teachers", exact: true }),
  ).toHaveCount(0);
  const pages = s.requests.filter((r) => r.searchParams.has("cursor"));
  expect(pages.map((r) => r.searchParams.get("cursor"))).toEqual([
    cursor,
    secondCursor,
  ]);
  for (const p of pages) {
    expect(p.searchParams.get("q")).toBe("pagination");
    expect(p.searchParams.get("subject")).toBe("Maths");
    expect(p.searchParams.get("mode")).toBe("ONLINE");
  }
});

test("failed additional page keeps current teachers and retries the same cursor", async ({
  page,
}) => {
  const s = await setup(page, "retry");
  await page
    .getByRole("button", { name: "Load more teachers", exact: true })
    .click();
  await expect(
    page.locator(".search-pagination").getByRole("alert"),
  ).toContainText("Your current results and filters are kept.");
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Search unavailable", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Try loading more teachers again" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 2", exact: true }),
  ).toBeVisible();
  expect(
    s.requests
      .filter((r) => r.searchParams.has("cursor"))
      .map((r) => r.searchParams.get("cursor")),
  ).toEqual([cursor, cursor]);
});

test("changing criteria cancels a pending page and never appends its results to the new search", async ({
  page,
}) => {
  const s = await setup(page, "slow");
  await page
    .getByRole("button", { name: "Load more teachers", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Loading more teachers…" }),
  ).toBeDisabled();
  await expect(page.locator("#teacher-search-results")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page
    .getByRole("textbox", { name: "Search teachers", exact: true })
    .fill("pagination replacement");
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 3", exact: true }),
  ).toBeVisible();
  s.release();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 1", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 2", exact: true }),
  ).toHaveCount(0);
  expect(
    s.requests
      .filter((r) => r.searchParams.get("q") === "pagination replacement")
      .every((r) => !r.searchParams.has("cursor")),
  ).toBe(true);
});

test("repeated cursors terminate pagination without repeating teacher cards", async ({
  page,
}) => {
  await setup(page, "repeat");
  await page
    .getByRole("button", { name: "Load more teachers", exact: true })
    .click();
  await expect(
    page.getByText(
      "More results could not be verified. Refresh this search to try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".teacher-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Refresh search", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more teachers", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Refresh search", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Load more teachers", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".teacher-card")).toHaveCount(2);
});

test("a failed first page offers explicit retry without showing a false no-match state", async ({
  page,
}) => {
  await setup(page, "initial-error");
  await expect(
    page.getByText("Search unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".coverage-recovery")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pagination Teacher 1", exact: true }),
  ).toBeVisible();
});

test("Hindi teacher pagination keeps accessible mobile controls and localized progress", async ({
  page,
}) => {
  await chooseHindi(page);
  await setup(page);
  await page
    .locator(".search-pagination")
    .screenshot({ path: "test-results/search-pagination-desktop.png" });
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
  const load = page.getByRole("button", {
    name: "और शिक्षक देखें",
    exact: true,
  });
  await load.scrollIntoViewIfNeeded();
  const bounds = await load.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await page
    .locator(".search-pagination")
    .screenshot({ path: "test-results/search-pagination-hindi-mobile.png" });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await load.click();
  await expect(
    page.getByText("2 शिक्षक दिखाए गए हैं। आपकी खोज के और नतीजे उपलब्ध हैं।", {
      exact: true,
    }),
  ).toBeVisible();
});
