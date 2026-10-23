import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { teachers } from "../../packages/test-fixtures/src";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
import { chooseHindi, checkHindi } from "./hindi";
export function searchDesignChecks() {
  for (const hi of [false, true]) {
    test(`search worksheet and single no-match recovery work in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
      page,
    }) => {
      const queries: URL[] = [];
      if (hi) await chooseHindi(page);
      const t = (s: string) => (hi ? hindiMessages[s] : s);
      await page.setViewportSize(
        hi ? { width: 360, height: 850 } : { width: 1440, height: 1100 },
      );
      await page.route("**/api/v1/**", async (route) => {
        const url = new URL(route.request().url());
        expect(route.request().method()).toBe("GET");
        if (url.pathname.endsWith("/auth/session"))
          return route.fulfill({
            status: 401,
            json: { code: "SESSION_REQUIRED", message: "Sign in" },
          });
        if (url.pathname.endsWith("/teachers")) queries.push(url);
        return route.fulfill({ json: { items: [], nextCursor: null } });
      });
      await page.goto("/teachers");
      const form = page.getByRole("group", {
        name: t("Teacher search criteria"),
        exact: true,
      });
      await expect(form).toBeEnabled();
      await expect(page.locator(".catalog-filters")).toHaveCSS("border-top-color", "rgb(25, 25, 25)");
      await expect(page.locator(".search-query-control")).toHaveCSS("border-top-color", "rgb(185, 189, 180)");
      const search = page.getByLabel(t("Search teachers"), { exact: true });
      await search.fill("design criteria");
      await expect(page.locator(".coverage-recovery")).toHaveCount(1);
      await expect(page.locator(".coverage-recovery")).toHaveCSS("border-top-color", "rgb(243, 243, 224)");
      await expect(page.locator(".help-card")).toHaveCount(0);
      await expect(page.locator(".coverage-recovery")).toHaveCount(1);
      const subject = page.getByRole("combobox", {
        name: t("Subject"),
        exact: true,
      });
      await subject.selectOption("Science");
      await page
        .getByRole("combobox", {
          name: t("Maximum monthly tuition"),
          exact: true,
        })
        .selectOption("3000");
      await expect(page.locator(".search-filter-count")).toHaveText(
        hi ? "चुने हुए फ़िल्टर: 3" : "Active filters: 3",
      );
      await expect
        .poll(() =>
          queries.some(
            (q) =>
              q.searchParams.get("subject") === "Science" &&
              q.searchParams.get("maxMonthlyPaise") === "300000",
          ),
        )
        .toBe(true);
      const clear = page.getByRole("button", {
        name: t("Clear all filters"),
        exact: true,
      });
      await clear.click();
      await expect(subject).toHaveValue("");
      await expect(
        page.getByRole("combobox", {
          name: t("Maximum monthly tuition"),
          exact: true,
        }),
      ).toHaveValue("");
      await expect(clear).toHaveCount(0);
      await expect(page.locator(".search-filter-count")).toHaveText(
        hi ? "चुने हुए फ़िल्टर: 0" : "Active filters: 0",
      );
      await expect(search).toHaveValue("");
      await search.fill("design criteria");
      await expect(page.locator(".coverage-recovery")).toHaveCount(1);
      await search.focus();
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("combobox", { name: t("Education stage"), exact: true }),
      ).toBeFocused();
      if (hi) await checkHindi(page);
      for (const width of hi ? [320, 360, 390, 430] : [1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const box = await page
          .getByLabel(t("Search teachers"), { exact: true })
          .boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(48);
      }
      const axe = await new AxeBuilder({ page })
        .include(".teacher-discovery-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        axe.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      await page.evaluate(() => document.fonts.ready);
      await page.locator("main").screenshot({
        path: `test-results/search-redesign-${hi ? "hi-mobile" : "en-desktop"}.png`,
      });
      await page
        .getByRole("button", { name: t("Let us search for you"), exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name: t("Let us search for you") }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("tabpanel").getByRole("link", { name: t("Share your criteria"), exact: true }),
      ).toHaveAttribute("href", "/onboarding/parent?discovery=ASSISTED");
    });
  }
  test("search results keep one help action that opens assisted search", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.route("**/api/v1/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/auth/session"))
        return route.fulfill({
          status: 401,
          json: { code: "SESSION_REQUIRED", message: "Sign in" },
        });
      return route.fulfill({
        json: {
          items: [
            {
              ...teachers[0],
              boards: ["CBSE"],
              grades: [8],
              demoAvailable: true,
              lockInDays: 15,
            },
          ],
          nextCursor: null,
        },
      });
    });
    await page.goto("/teachers");
    await page
      .getByLabel("Search teachers", { exact: true })
      .fill("teacher design");
    await expect(page.locator(".teacher-card")).toHaveCount(1);
    await expect(page.locator(".teacher-card")).toHaveCSS("border-top-color", "rgb(243, 243, 224)");
    await page.locator(".teacher-card").hover();
    await expect(page.locator(".teacher-card")).toHaveCSS("border-top-color", "rgb(25, 25, 25)");
    await page.mouse.move(0, 0);
    await expect(page.locator(".coverage-recovery")).toHaveCount(0);
    await expect(page.locator(".help-card")).toHaveCount(1);
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator("main")
      .screenshot({ path: "test-results/search-redesign-results-desktop.png" });
    await page
      .getByRole("button", { name: "Help me choose", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Let us search for you" }),
    ).toHaveAttribute("aria-selected", "true");
  });
}
