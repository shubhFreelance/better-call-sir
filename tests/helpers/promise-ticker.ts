import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseHindi, checkHindi } from "./hindi";
import { translateText } from "../../apps/web/app/locale";
async function home(page: Page) {
  await page.route("**/api/v1/**", route => route.fulfill(
    new URL(route.request().url()).pathname.endsWith("/auth/session")
      ? { status: 401, json: { code: "SESSION_REQUIRED", message: "Sign in" } }
      : { json: { items: [] } },
  ));
  await page.goto("/");
}
export function promiseTickerChecks() {
  for (const hi of [false, true]) test(`highlight ticker moves left and pauses without duplicating accessible content (${hi ? "Hindi phone" : "English desktop"})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize(hi ? { width: 320, height: 850 } : { width: 1440, height: 1000 });
    if (hi) await chooseHindi(page);
    const t = (text: string) => translateText(hi, text);
    await home(page);
    const bar = page.getByRole("region", { name: t("Learning highlights"), exact: true });
    await expect(bar.locator(".promise-ticker")).toHaveClass(/is-animated/);
    await bar.scrollIntoViewIfNeeded();
    await expect(bar.getByRole("listitem")).toHaveCount(4);
    const groups = bar.locator(".promise-ticker-group");
    expect(await groups.nth(1).innerText()).toBe(await groups.first().innerText());
    await expect(groups.nth(1)).toHaveAttribute("aria-hidden", "true");
    const viewport = bar.locator(".promise-ticker-viewport");
    await expect.poll(async () => {
      const a = await groups.first().boundingBox(), b = await groups.nth(1).boundingBox(), view = await viewport.boundingBox();
      return !!a && !!b && !!view && a.width >= view.width && Math.abs(a.width - b.width) < 0.5;
    }).toBe(true);
    const position = () => bar.locator(".promise-ticker-track").evaluate(el => {
      const transform = getComputedStyle(el).transform;
      return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
    });
    const frames = () => page.evaluate(async () => { for (let i=0;i<12;i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
    const initial = await position();
    await expect.poll(position).toBeLessThan(initial - 3);
    await viewport.hover();
    const hovered = await position(); await frames();
    expect(Math.abs(await position() - hovered)).toBeLessThan(1);
    await page.mouse.move(0, 0);
    await viewport.focus();
    const focused = await position(); await frames();
    expect(Math.abs(await position() - focused)).toBeLessThan(1);
    const pause = bar.getByRole("button", { name: t("Pause highlights"), exact: true });
    await pause.focus(); await page.keyboard.press("Enter");
    const resume = bar.getByRole("button", { name: t("Resume highlights"), exact: true });
    await expect(resume).toBeVisible();
    const stopped = await position(); await frames();
    expect(Math.abs(await position() - stopped)).toBeLessThan(1);
    await page.keyboard.press("Enter");
    await expect.poll(position).toBeLessThan(stopped - 3);
    await page.setViewportSize({ width: hi ? 390 : 1024, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).include(".promise-bar").analyze();
    expect(audit.violations.filter(v => ["serious", "critical"].includes(v.impact || ""))).toEqual([]);
    await bar.screenshot({ path: `test-results/promise-ticker-${hi ? "hi-phone" : "en-desktop"}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(bar.locator(".promise-ticker")).not.toHaveClass(/is-animated/);
    await expect(bar.getByRole("button")).toHaveCount(0);
    await expect(groups.nth(1)).toBeHidden();
    await expect(bar.getByRole("listitem")).toHaveCount(4);
    if (hi) await checkHindi(page);
    await page.locator(".hero-buttons a").first().click();
    await expect(page).toHaveURL(/\/teachers$/);
    await expect(page.locator(".promise-bar")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test("highlight strip stays fully readable when reduced motion is enabled before loading", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 850 });
    await home(page);
    const bar = page.getByRole("region", { name: "Learning highlights", exact: true });
    await expect(bar.locator(".promise-ticker")).not.toHaveClass(/is-animated/);
    await expect(bar.getByRole("button")).toHaveCount(0);
    await expect(bar.getByRole("listitem")).toHaveCount(4);
    await expect(bar.locator(".promise-ticker-copy")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
