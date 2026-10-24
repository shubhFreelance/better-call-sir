import { test, expect } from "@playwright/test";
import { dashboard } from "../helpers/dashboard-redesign";
import { translateText } from "../../apps/web/app/locale";
for (const hi of [false, true])
  test(`dashboard cards and individual registration hydrate under production CSP in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      hi ? { width: 360, height: 850 } : { width: 1440, height: 1000 },
    );
    if (hi)
      await page.addInitScript(() =>
        localStorage.setItem("bcs.interface-language", "hi"),
      );
    await dashboard(page, "TEACHER");
    const response = await page.goto("/dashboard");
    expect(response!.headers()["content-security-policy"]).not.toContain(
      "unsafe-eval",
    );
    const t = (s: string) => translateText(hi, s);
    await expect(
      page.getByRole("heading", {
        name: t("Your teaching dashboard"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".teacher-dashboard-details")).toContainText(
      "MSc Mathematics",
    );
    await expect(
      page
        .locator(".teacher-dashboard-details > .dashboard-facts")
        .getByText("MSc Mathematics", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".hiring-counts > div")).toHaveCount(4);
    await expect(page.locator(".overview-stat-card dd")).toHaveText(["0", "0", "0", "0"]);
    await expect(page.locator(".overview-stat-card").first()).toHaveCSS("background-color", "rgb(230, 230, 210)");
    await expect(page.locator(".tone-lavender .overview-stat-art")).toHaveCSS("background-color", "rgb(240, 215, 255)");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator(".dashboard-layout")
      .screenshot({
        path: `test-results/dashboard-preview-${hi ? "hi-mobile" : "en-desktop"}.png`,
      });
    await page.unroute("**/api/v1/**");
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({
        status: 401,
        json: { code: "SESSION_REQUIRED", message: "Sign in" },
      }),
    );
    await page.goto("/signup");
    for (const name of [
      "Register as a student",
      "Register as a parent or guardian",
      "Register as a teacher",
    ])
      await expect(
        page.getByRole("link", { name: t(name), exact: true }),
      ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator(".registration-section")
      .screenshot({
        path: `test-results/registration-preview-${hi ? "hi-mobile" : "en-desktop"}.png`,
      });
    await page
      .getByRole("link", {
        name: t("Register as a parent or guardian"),
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: hi
          ? "अपना अभिभावक खाता बनाएँ"
          : "Create your parent or guardian account",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
