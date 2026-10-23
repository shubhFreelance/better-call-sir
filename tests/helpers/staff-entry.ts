import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chooseHindi, checkHindi } from "./hindi";
import { translateText } from "../../apps/web/app/locale";
export function staffEntryChecks() {
  for (const hindi of [false, true])
    test(`staff entry remains visible without development accounts ${hindi ? "Hindi phone" : "English desktop"}`, async ({
      page,
    }) => {
      if (hindi) {
        await chooseHindi(page);
        await page.setViewportSize({ width: 360, height: 850 });
      }
      const t = (s: string) => translateText(hindi, s);
      await page.route("**/api/v1/**", (route) =>
        route.fulfill({
          status: 404,
          json: { code: "NOT_FOUND", message: "Unavailable" },
        }),
      );
      await page.goto("/login");
      await page.getByRole("link", {name:t("Admin & staff sign-in"),exact:true}).waitFor();
      await page.screenshot({path:`test-results/admin-entry-${hindi ? "hi-phone" : "en-desktop"}.png`,fullPage:true});
      await page
        .getByRole("button", {
          name: t("Create an account instead"),
          exact: true,
        })
        .click();
      await expect(page.locator("#signin-name")).toBeVisible();
      await page
        .getByRole("link", { name: t("Admin & staff sign-in"), exact: true })
        .click();
      await expect(page).toHaveURL(/intent=staff/);
      await expect(
        page.getByRole("heading", {
          name: t("Admin & staff sign-in"),
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator("#signin-name")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: t("Create an account instead"),
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          t(
            "Development accounts are unavailable on this server. Use your assigned staff email.",
          ),
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.locator(".account-choice")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (hindi) await checkHindi(page);
      const axe = await new AxeBuilder({ page }).include("#main").analyze();
      expect(
        axe.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/staff-sign-in-${hindi ? "hi-phone" : "en-desktop"}.png`,
        fullPage: true,
      });
    });
  test("development admin selection creates only its existing session and still requires staff MFA", async ({
    page,
  }) => {
    const id = "10000000-0000-4000-8000-000000000005";
    let signed = false;
    const privateReads: string[] = [],
      account = {
        id,
        name: "Operator · demo admin",
        role: "ADMIN",
        verified: true,
      };
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/session"))
        return route.fulfill(
          signed
            ? { json: { account, csrfToken: "synthetic-csrf" } }
            : {
                status: 401,
                json: { code: "SESSION_REQUIRED", message: "Sign in" },
              },
        );
      if (path.endsWith("/auth/refresh"))
        return route.fulfill({
          status: 401,
          json: { code: "SESSION_REQUIRED", message: "Sign in" },
        });
      if (path.endsWith("/dev/accounts"))
        return route.fulfill({
          json: [
            account,
            {
              id: "guardian-id",
              name: "Demo parent",
              role: "GUARDIAN",
              verified: true,
            },
          ],
        });
      if (path.endsWith("/dev/session")) {
        expect(route.request().postDataJSON()).toEqual({ accountId: id });
        signed = true;
        return route.fulfill({
          status: 201,
          json: { account, csrfToken: "synthetic-csrf" },
        });
      }
      if (path.endsWith("/auth/mfa"))
        return route.fulfill({
          json: {
            enabled: false,
            verifiedUntil: null,
            recoveryCodesRemaining: 0,
          },
        });
      privateReads.push(path);
      return route.fulfill({
        status: 403,
        json: { code: "MFA_REQUIRED", message: "Verify staff MFA" },
      });
    });
    await page.goto("/login?intent=staff");
    await expect(page.getByRole("button", { name: /Demo parent/ })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: /Operator · demo admin/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: "Protect your staff access.",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      privateReads.some(
        (p) => p.includes("/dashboard/hiring") || p.includes("/admin/"),
      ),
    ).toBe(false);
  });
  test("failed and empty development lists explain recovery; verified unknown staff email never opens registration", async ({
    page,
  }) => {
    let failed = true;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/dev/accounts"))
        return route.fulfill(
          failed
            ? {
                status: 503,
                json: { code: "UNAVAILABLE", message: "Unavailable" },
              }
            : { json: [] },
        );
      if (path.endsWith("/auth/otp/request"))
        return route.fulfill({
          status: 201,
          json: {
            status: "SANDBOX",
            expiresIn: 300,
            developmentCode: "123456",
          },
        });
      if (path.endsWith("/auth/otp/verify")) {
        expect(route.request().postDataJSON()).toEqual({
          email: "unassigned@example.test",
          code: "123456",
        });
        return route.fulfill({
          status: 409,
          json: {
            code: "REGISTRATION_REQUIRED",
            message: "Registration needed",
          },
        });
      }
      return route.fulfill({
        status: 401,
        json: { code: "SESSION_REQUIRED", message: "Sign in" },
      });
    });
    await page.goto("/login?intent=staff");
    await expect(
      page.getByText(
        "Development accounts could not be loaded. Retry or use your assigned staff email.",
        { exact: true },
      ),
    ).toBeVisible();
    failed = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByText(/No development accounts are available here/),
    ).toBeVisible();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("unassigned@example.test");
    await page
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await page.getByLabel("Six-digit code", { exact: true }).fill("123456");
    await page
      .getByRole("button", { name: "Verify and continue", exact: true })
      .click();
    await expect(
      page.getByText(
        "Use an existing staff account email. Ask an administrator if staff access has not been assigned.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator("#signin-name")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Create an account instead",
        exact: true,
      }),
    ).toHaveCount(0);
  });
}
