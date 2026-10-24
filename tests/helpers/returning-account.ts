import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi, checkHindi } from "./hindi";
const id = "10000000-0000-4000-8000-000000000661";
export function returningAccountChecks() {
  for (const [role, hi] of [
    ["GUARDIAN", false],
    ["STUDENT", false],
    ["TEACHER", false],
    ["INDEPENDENT_STUDENT", false],
    ["ADMIN", false],
    ["GUARDIAN", true],
  ] as const) {
    test(`email-only returning ${role} ${hi ? "Hindi mobile" : "English"} keeps its account and routes to saved work`, async ({
      page,
    }) => {
      if (hi) {
        await chooseHindi(page);
        await page.setViewportSize({ width: 360, height: 850 });
      }
      const f = await dashboard(page, role);
      let signed = false;
      const session = {
        account: {
          id,
          name: "Synthetic Priya",
          role,
          verified: role !== "GUARDIAN",
        },
        csrfToken: "synthetic-csrf",
      };
      await page.route("**/api/v1/auth/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/session"))
          return route.fulfill({
            status: signed ? 200 : 401,
            json: signed
              ? session
              : { code: "SESSION_REQUIRED", message: "Sign in" },
          });
        if (path.endsWith("/otp/request")) {
          expect(route.request().postDataJSON()).toEqual({
            email: "saved@example.test",
            locale: hi ? "hi" : "en",
          });
          return route.fulfill({
            status: 201,
            json: {
              status: "SANDBOX",
              expiresIn: 300,
              developmentCode: "123456",
            },
          });
        }
        if (path.endsWith("/otp/verify")) {
          expect(route.request().postDataJSON()).toEqual({
            email: "saved@example.test",
            code: "123456",
          });
          signed = true;
          return route.fulfill({
            status: 201,
            json: { ...session, accountCreated: false },
          });
        }
        if (path.endsWith("/mfa") && role === "ADMIN")
          return route.fulfill({
            json: {
              enabled: false,
              verifiedUntil: null,
              recoveryCodesRemaining: 0,
            },
          });
        return route.fallback();
      });
      await page.goto("/login");
      await expect(page.locator("#signin-name")).toHaveCount(0);
      await page
        .getByLabel(hi ? "ईमेल पता" : "Email address", { exact: true })
        .fill(" SAVED@EXAMPLE.TEST ");
      await page
        .getByRole("button", {
          name: hi ? "साइन-इन कोड भेजें" : "Send sign-in code",
          exact: true,
        })
        .click();
      await page
        .getByLabel(hi ? "छह अंकों का कोड" : "Six-digit code", { exact: true })
        .fill("123456");
      await page
        .getByRole("button", {
          name: hi ? "पुष्टि करके आगे बढ़ें" : "Verify and continue",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator(".returning-account-notice")).toContainText(
        hi ? "यह ईमेल पहले से पंजीकृत है" : "This email is already registered",
      );
      await expect(page.locator(".returning-account-card")).toHaveCSS("background-color", "rgb(228, 228, 208)");
      await expect(page.locator(".returning-account-card").getByRole("heading")).toHaveText(hi ? "आपकी सहेजी हुई जानकारी तैयार है" : "Your saved progress is ready");
      await expect(page.locator(".returning-account-notice").getByRole("link").first()).toHaveAttribute("href", "/teachers");
      if (role === "GUARDIAN") {
        const actions = page.locator(".returning-account-actions");
        expect(await actions.getByRole("link").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")))).toEqual(["/teachers", "/onboarding/guardian", "/guardian-verification", "/support", "/guardian-verification"]);
        await expect(actions.getByRole("link").last()).toHaveAttribute("data-variant", "outline");
        await expect(actions.locator('a[data-variant="default"]')).toHaveCount(4);
        for (const href of ["/onboarding/guardian", "/guardian-verification", "/support"]) await expect(page.locator(`.dashboard-sidebar a[href="${href}"]`)).toHaveCount(0);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(actions.locator(".find-teacher-highlight")).toHaveCSS("animation-name", "none");
      }
      if (role === "GUARDIAN")
        await expect(
          page.locator(".returning-account-notice").getByRole("link").last(),
        ).toHaveAttribute("href", "/guardian-verification");
      if (role === "ADMIN") {
        await expect(
          page.getByRole("heading", {
            name: "Protect your staff access.",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          f.reads.some(
            (path) =>
              path.includes("/dashboard/hiring") ||
              path.includes("/admin/console"),
          ),
        ).toBe(false);
      } else await expect(page.locator(".dashboard-layout")).toBeVisible();
      if (hi) await checkHindi(page);
      if (role === "GUARDIAN") {
        const a = await new AxeBuilder({ page }).include("#main").include(".returning-account-notice").analyze();
        expect(
          a.violations.filter((v) =>
            ["critical", "serious"].includes(v.impact || ""),
          ),
        ).toEqual([]);
        await page.screenshot({
          path: `test-results/returning-guardian-${hi ? "hi-mobile" : "en-desktop"}.png`,
          fullPage: true,
        });
      }
    });
  }
  test("existing guardian using signup reaches the existing dashboard without creating another profile", async ({
    page,
  }) => {
    await dashboard(page, "GUARDIAN");
    let signed = false;
    const session = {
      account: { id, name: "Saved parent", role: "GUARDIAN", verified: false },
      csrfToken: "synthetic-csrf",
    };
    await page.route("**/api/v1/auth/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/session"))
        return route.fulfill({
          status: signed ? 200 : 401,
          json: signed
            ? session
            : { code: "SESSION_REQUIRED", message: "Sign in" },
        });
      if (path.endsWith("/otp/request"))
        return route.fulfill({
          status: 201,
          json: {
            status: "SANDBOX",
            expiresIn: 300,
            developmentCode: "123456",
          },
        });
      if (path.endsWith("/otp/verify")) {
        signed = true;
        return route.fulfill({
          status: 201,
          json: { ...session, accountCreated: false },
        });
      }
      return route.fallback();
    });
    await page.goto("/signup/guardian");
    await page
      .getByLabel("Your name", { exact: true })
      .fill("A different entered name");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("saved@example.test");
    await page
      .getByRole("button", { name: "Send verification code", exact: true })
      .click();
    await page.getByLabel("Six-digit code", { exact: true }).fill("123456");
    await page
      .getByRole("button", {
        name: "Verify and continue to setup",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(".returning-account-notice")).toContainText(
      "This email is already registered",
    );
  });
  test("unknown verified sign-in offers registration with the same email and never claims a prior account", async ({
    page,
  }) => {
    await page.route("**/api/v1/auth/otp/request", (route) =>
      route.fulfill({
        status: 201,
        json: { status: "SANDBOX", expiresIn: 300, developmentCode: "123456" },
      }),
    );
    await page.route("**/api/v1/auth/otp/verify", (route) =>
      route.fulfill({
        status: 409,
        json: {
          code: "REGISTRATION_REQUIRED",
          message: "Registration required",
        },
      }),
    );
    await page.goto("/login");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("new@example.test");
    await page
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await page.getByLabel("Six-digit code", { exact: true }).fill("123456");
    await page
      .getByRole("button", { name: "Verify and continue", exact: true })
      .click();
    await expect(page.getByLabel("Your name", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
      "new@example.test",
    );
    await expect(
      page.getByText(
        "No account exists for this verified email. Add your name to create an account with the same email.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator(".returning-account-notice")).toHaveCount(0);
  });
}
