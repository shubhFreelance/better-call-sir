import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseHindi, checkHindi } from "./hindi";

export function landingMotionChecks() {
  for (const reduced of [false, true]) {
    test(`landing motion preserves navigation and reduced-motion preference (${reduced ? "Hindi phone" : "English desktop"})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await page.setViewportSize(reduced ? { width: 320, height: 900 } : { width: 1440, height: 1000 });
      if (reduced) await chooseHindi(page);
      await page.route("**/api/v1/**", route => route.fulfill(
        new URL(route.request().url()).pathname.endsWith("/auth/session")
          ? { status: 401, json: { code: "SESSION_REQUIRED", message: "Sign in" } }
          : { json: { items: [] } },
      ));
      await page.goto("/");
      await expect(page.locator(".hero h1")).toBeVisible();
      const versions = () => page.evaluate(() => (window as typeof window & { gsapVersions?: string[] }).gsapVersions || []);
      if (!reduced) await expect.poll(versions).toContain("3.15.0");
      await page.locator(".home-registration").scrollIntoViewIfNeeded();
      const teacherSignup = page.locator(".home-registration").getByRole("link", {
        name: reduced ? "शिक्षक के रूप में खाता बनाएँ" : "Register as a teacher", exact: true,
      });
      await expect(teacherSignup).toHaveAttribute("href", "/signup/teacher");
      await teacherSignup.focus();
      await expect(teacherSignup).toBeFocused();
      await page.locator(".how-section").scrollIntoViewIfNeeded();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => page.locator(".landing-page").evaluate(root =>
        Array.from(root.querySelectorAll<HTMLElement>(".hero-copy > *, .illustration, .home-registration, .section-heading, .teacher-grid, .how-section, .hiring-discovery-banner"))
          .map(node => node.style.transform).filter(Boolean),
      )).toEqual([]);
      if (reduced) {
        expect(await versions()).not.toContain("3.15.0");
        await checkHindi(page);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const a = await new AxeBuilder({ page }).analyze();
      expect(a.violations.filter(v => ["serious", "critical"].includes(v.impact || ""))).toEqual([]);
      await page.screenshot({ path: `test-results/landing-gsap-${reduced ? "hi-phone" : "en-desktop"}.png`, fullPage: true });
      await page.locator(".hero-buttons a").first().click();
      await expect(page).toHaveURL(/\/teachers$/);
      await expect(page.locator(".landing-page")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
