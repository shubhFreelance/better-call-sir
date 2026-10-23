import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { translateText } from "../../apps/web/app/locale";
import { dashboard } from "../helpers/dashboard-redesign";
for (const hi of [false, true]) {
  test(`registration choices are explicit and keyboard accessible in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize(
      hi ? { width: 360, height: 850 } : { width: 1440, height: 1050 },
    );
    await page.route("**/api/v1/**", (route) =>
      route.fulfill(
        new URL(route.request().url()).pathname.endsWith("/teachers")
          ? { json: { items: [] } }
          : {
              status: 401,
              json: { code: "SESSION_REQUIRED", message: "Sign in" },
            },
      ),
    );
    if (hi)
      await page.addInitScript(() =>
        localStorage.setItem("bcs.interface-language", "hi"),
      );
    await page.goto("/");
    const t = (s: string) => translateText(hi, s);
    const choices = page.getByRole("region", {
      name: t("Your profile. Your next step."),
    });
    for (const [name, href] of [
      ["Register as a student", "/signup/student"],
      ["Register as a parent or guardian", "/signup/guardian"],
      ["Register as a teacher", "/signup/teacher"],
    ])
      await expect(
        choices.getByRole("link", { name: t(name), exact: true }),
      ).toHaveAttribute("href", href);
    await expect(choices).not.toContainText(
      hi ? "परिवार बनाएँ" : "Create a family",
    );
    const homeAudit = await new AxeBuilder({ page }).analyze();
    expect(
      homeAudit.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/registration-home-${hi ? "hi-mobile" : "en-desktop"}.png`,
      fullPage: true,
    });
    await choices
      .getByRole("link", { name: t("Register as a student"), exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: t("Start with your student profile"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: t("Create my student profile (18+)"),
        exact: true,
      }),
    ).toHaveAttribute("href", "/onboarding/independent-student");
    await page
      .getByRole("link", {
        name: t("My parent or guardian needs an account"),
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
    const a = await new AxeBuilder({ page }).analyze();
    expect(
      a.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  });
  test(`dashboard cards and role navigation remain usable for every role in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize(
      hi ? { width: 360, height: 850 } : { width: 1440, height: 1050 },
    );
    if (hi)
      await page.addInitScript(() =>
        localStorage.setItem("bcs.interface-language", "hi"),
      );
    const t = (s: string) => translateText(hi, s);
    for (const role of [
      "TEACHER",
      "GUARDIAN",
      "STUDENT",
      "ADMIN",
      "INDEPENDENT_STUDENT",
    ]) {
      await page.unroute("**/api/v1/**");
      const state = await dashboard(page, role);
      await page.goto("/dashboard");
      await expect(page.locator(".sidebar-person")).toContainText(
        "Synthetic Priya",
      );
      if (role === "INDEPENDENT_STUDENT") {
        await expect(
          page.getByRole("heading", {
            name: hi ? "मेरी पढ़ाई" : "My education",
            exact: true,
          }),
        ).toBeVisible();
        expect(state.reads).not.toContain("/api/v1/dashboard");
      } else
        await expect(
          page.getByRole("button", {
            name: t("Refresh overview"),
            exact: true,
          }),
        ).toBeVisible();
      if (role === "TEACHER") {
        await expect(page.locator(".teacher-dashboard-details")).toContainText(
          "MSc Mathematics",
        );
        await expect(
          page
            .locator(".teacher-dashboard-details > .dashboard-facts")
            .getByText("MSc Mathematics", { exact: true }),
        ).toBeVisible();
        await page
          .getByText(t("Education and work experience"), { exact: true })
          .click();
        await expect(page.locator(".dashboard-credentials")).toContainText(
          "Mathematics teacher",
        );
        const weights = await page
          .locator(".dashboard-qualification .dashboard-facts")
          .first()
          .evaluate((el) => ({
            label: getComputedStyle(el.querySelector("dt")!).fontWeight,
            value: getComputedStyle(el.querySelector("dd")!).fontWeight,
          }));
        expect(Number(weights.label)).toBeGreaterThan(Number(weights.value));
        await page
          .getByText(t("Education and work experience"), { exact: true })
          .click();
      }
      if (hi) {
        const trigger = page.getByRole("button", {
          name: t("Dashboard menu: {0}").replace("{0}", t("Overview")),
          exact: true,
        });
        await trigger.click();
        const nav = page.getByRole("navigation", {
          name: t("Dashboard sections"),
          exact: true,
        });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("link").first()).not.toHaveAttribute("aria-describedby");
        await nav.getByRole("button", { name: t("Details for {0}").replace("{0}", t("Overview")), exact: true }).click();
        await expect(nav.getByRole("link").first()).toHaveAccessibleDescription(
          t("Your priorities and latest progress"),
        );
        await nav.getByRole("link").first().focus();
        await page.keyboard.press("Escape");
        await expect(nav).not.toBeVisible();
        await expect(trigger).toBeFocused();
      } else
        await expect(
          page
            .getByRole("navigation", { name: t("Dashboard"), exact: true })
            .getByRole("link")
            .first(),
        ).not.toHaveAttribute("aria-describedby");
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const a = await new AxeBuilder({ page }).analyze();
      expect(
        a.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact || ""),
        ),
        role,
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/dashboard-redesign-${role.toLowerCase()}-${hi ? "hi-mobile" : "en-desktop"}.png`,
        fullPage: true,
      });
    }
  });
}
test("teacher profile refresh hides denied credentials and can recover without changing other account data", async ({
  page,
}) => {
  const state = await dashboard(page, "TEACHER");
  await page.goto("/dashboard");
  await expect(page.locator(".teacher-dashboard-details")).toContainText(
    "MSc Mathematics",
  );
  state.denyProfile();
  await page.reload();
  await expect(
    page.getByText(
      "Teaching details could not be loaded. Private information is hidden until you retry.",
    ),
  ).toBeVisible();
  await expect(page.getByText("MSc Mathematics", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Retry teaching details", exact: true }),
  ).toBeVisible();
});
for (const hi of [false, true])
  test(`real parent registration verifies an individual account without creating student links in ${hi ? "Hindi" : "English"}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/v1/"))
        posts.push(new URL(req.url()).pathname);
    });
    if (hi)
      await page.addInitScript(() =>
        localStorage.setItem("bcs.interface-language", "hi"),
      );
    await page.goto("/signup/guardian");
    await page
      .getByLabel(hi ? "आपका नाम" : "Your name", { exact: true })
      .fill("Synthetic parent registration");
    await page
      .getByLabel(hi ? "ईमेल पता" : "Email address", { exact: true })
      .fill(`parent-registration-${crypto.randomUUID()}@example.test`);
    const requested = page.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/otp/request") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: hi ? "पुष्टि कोड भेजें" : "Send verification code",
        exact: true,
      })
      .click();
    const challenge = await (await requested).json();
    expect(challenge.status).toBe("SANDBOX");
    await page
      .getByLabel(hi ? "छह अंकों का कोड" : "Six-digit code", { exact: true })
      .fill(challenge.developmentCode);
    await page
      .getByRole("button", {
        name: hi ? "पुष्टि करके सेटअप पर जाएँ" : "Verify and continue to setup",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/onboarding\/guardian/);
    const session = await (
      await page.request.get("/api/v1/auth/session")
    ).json();
    expect(session.account.role).toBe("GUARDIAN");
    expect(session.account.verified).toBe(false);
    expect(posts).toEqual([
      "/api/v1/auth/otp/request",
      "/api/v1/auth/otp/verify",
    ]);
    await expect(
      page.getByRole("heading", {
        name: translateText(hi, "Your account, your next step."),
        exact: true,
      }),
    ).toBeVisible();
  });

for (const hi of [false, true]) test(`sidebar descriptions expand only on click with ivory and lavender rows (${hi ? "Hindi phone" : "English desktop"})`, async ({ page }) => {
  if (hi) await page.addInitScript(() => localStorage.setItem("bcs.interface-language", "hi"));
  await page.setViewportSize(hi ? { width: 320, height: 900 } : { width: 1440, height: 1000 });
  await dashboard(page, "INDEPENDENT_STUDENT");
  await page.goto("/dashboard");
  const t = (s: string) => translateText(hi, s);
  if (hi) await page.getByRole("button", { name: t("Dashboard menu: {0}").replace("{0}", t("Overview")), exact: true }).click();
  const nav = page.getByRole("navigation", { name: t(hi ? "Dashboard sections" : "Dashboard"), exact: true });
  const rows = nav.locator(".dashboard-nav-item");
  await expect(rows.first().locator(".dashboard-nav-description")).toBeHidden();
  await expect(rows.nth(1).locator(".dashboard-nav-description")).toBeHidden();
  await expect(rows.first()).toHaveCSS("background-color", "rgb(240, 215, 255)");
  await expect(rows.nth(1)).toHaveCSS("background-color", "rgb(244, 244, 236)");
  const toggle = rows.first().getByRole("button");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(rows.first().locator(".dashboard-nav-description")).toHaveText(t("Your priorities and latest progress"));
  await expect(rows.first().locator(".dashboard-nav-description")).toBeVisible();
  await expect(page).toHaveURL(/dashboard$/);
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(rows.first().locator(".dashboard-nav-description")).toBeHidden();
  await expect(nav.getByRole("link", { name: t("Notifications"), exact: true })).toHaveAttribute("href", "/dashboard/notifications");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const a = await new AxeBuilder({ page }).include(".dashboard-sidebar").analyze();
  expect(a.violations.filter(v => ["serious", "critical"].includes(v.impact || ""))).toEqual([]);
  await page.locator(".dashboard-sidebar").screenshot({ path: `test-results/sidebar-compact-${hi ? "hi-phone" : "en-desktop"}.png` });
});
