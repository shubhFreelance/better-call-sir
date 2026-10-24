import { test, expect } from "@playwright/test";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
import { chooseHindi } from "../helpers/hindi";

for (const [width, hindi] of [[1280, false], [390, false], [320, false], [390, true]] as const) {
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
    await field.fill("");
    await expect(card.getByRole("heading", { name: "Aarav", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: `test-results/card-search-${width}-${hindi ? "hi" : "en"}.png` });
  });
}
