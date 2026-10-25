import { test, expect } from "@playwright/test";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
import { chooseHindi } from "../helpers/hindi";

for (const [width, hindi] of [[1280, false], [390, false], [320, false], [390, true]] as const) {
  test.describe(`${width}px ${hindi ? "Hindi" : "English"}`, () => {
  test.use({ hasTouch: width <= 640 });
  test(`card search filters learners and preserves keyboard access at ${width}px ${hindi ? "Hindi" : "English"}`, async ({ page }) => {
    const text = (value: string) => hindi ? hindiMessages[value] : value;
    if (hindi) await chooseHindi(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/v1/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/session")) return route.fulfill({ json: {
        account: { id: "10000000-0000-4000-8000-000000000291", name: "Synthetic guardian", role: "GUARDIAN", verified: true }, csrfToken: "synthetic-csrf",
      } });
      if (path.endsWith("/learner-profiles")) return route.fulfill({ json: { items: [], creationStatus: "READY", nextCursor: null } });
      if (path.endsWith("/guardian-verifications")) return route.fulfill({ json: {
        items: ["Kishan", "Aarav"].map((learnerName, i) => ({ id: `20000000-0000-4000-8000-00000000029${i}`, learnerName, status: "APPROVED", learnerId: null })), nextCursor: null,
      } });
      return route.fulfill({ json: { items: [], counts: {}, nextCursor: null } });
    });
    await page.goto("/dashboard/learners");
    const card = page.getByRole("region", { name: text("Verified learners awaiting setup") });
    const field = card.getByRole("searchbox", { name: text("Find your learner") });
    const toggle = card.getByRole("button", { name: text("Find your learner"), exact: true });
    const info = card.getByRole("button", { name: text("About learner setup"), exact: true });
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toHaveCount(0);
    if (width > 640) await info.hover(); else await info.tap();
    await expect(tooltip).toBeVisible();
    await expect(tooltip.locator("li")).toHaveCount(1);
    if (width > 640) {
      await tooltip.hover();
      await expect(tooltip).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await page.mouse.move(0, 0);
    await info.blur();
    await info.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    if (width <= 640) {
      await expect(field).toBeHidden();
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(field).toBeFocused();
    } else {
      await expect(field).toBeVisible();
      await expect(toggle).toBeHidden();
    }
    await field.fill("Kishan");
    await expect(card.getByRole("heading", { name: "Kishan", exact: true })).toBeVisible();
    await expect(card.getByRole("heading", { name: "Aarav", exact: true })).toHaveCount(0);
    if (width <= 640) {
      await field.press("Escape");
      const active = card.getByRole("button", { name: `${text("Find your learner")}: Kishan`, exact: true });
      await expect(active).toBeFocused();
      await expect(active).toHaveAttribute("aria-expanded", "false");
      await expect(field).toBeHidden();
      await active.click();
      await expect(field).toHaveValue("Kishan");
    }
    await field.fill("No such learner");
    if (width > 640) await info.hover(); else await info.tap();
    await expect(tooltip.locator("li")).toHaveCount(2);
    expect(await tooltip.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    })).toBe(true);
    await tooltip.screenshot({ path: `test-results/learner-info-${width}-${hindi ? "hi" : "en"}.png` });
    await field.click();
    await expect(tooltip).toHaveCount(0);
    await field.fill("");
    await expect(card.getByRole("heading", { name: "Aarav", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: `test-results/card-search-${width}-${hindi ? "hi" : "en"}.png` });
  });
  });
}
