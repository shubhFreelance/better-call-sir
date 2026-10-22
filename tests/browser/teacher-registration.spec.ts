import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const hi of [false, true])
  test(`teacher registration verifies email before private onboarding in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize(
      hi ? { width: 360, height: 800 } : { width: 1440, height: 1000 },
    );
    await page.goto("/signup/teacher");
    if (hi)
      await page
        .getByLabel("Language / भाषा", { exact: true })
        .selectOption("hi");
    await expect(
      page.getByRole("heading", {
        name: hi ? "अपना शिक्षक खाता बनाएँ" : "Create your teacher account",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: hi
          ? "अपना आवेदन जारी रखने के लिए साइन इन करें"
          : "Sign in to continue your application",
        exact: true,
      }),
    ).toHaveAttribute(
      "href",
      "/login?next=%2Fonboarding%2Fteacher&intent=teacher",
    );
    await page.screenshot({
      path: `test-results/teacher-signup-${hi ? "hi-mobile" : "en-desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByLabel(hi ? "आपका नाम" : "Your name", { exact: true })
      .fill("Synthetic teacher registration");
    const address = "teacher-signup-" + crypto.randomUUID() + "@example.test";
    await page
      .getByLabel(hi ? "ईमेल पता" : "Email address", { exact: true })
      .fill(address);
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
        name: hi
          ? "पुष्टि करके आवेदन पर जाएँ"
          : "Verify and continue to application",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/onboarding\/teacher/);
    await expect(
      page.getByLabel(hi ? "पढ़ाने का छोटा परिचय" : "Teaching headline", {
        exact: true,
      }),
    ).toBeVisible();
    const session = await (
      await page.request.get("/api/v1/auth/session")
    ).json();
    expect(session.account.verified).toBe(false);
    const progress = await (
      await page.request.get("/api/v1/onboarding/teacher")
    ).json();
    expect(progress.completedResourceId).toBeNull();
    expect(progress.state).toBe("DRAFT");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .disableRules(["color-contrast"])
          .analyze()
      ).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/teacher-registration-${hi ? "hi-mobile" : "en-desktop"}.png`,
      fullPage: true,
    });
  });
