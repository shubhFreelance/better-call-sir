import { test, expect } from "@playwright/test";
import { translateText } from "../../apps/web/app/locale";
for (const hi of [false, true])
  test(`teacher signup and expired-save recovery hydrate under production CSP in ${hi ? "Hindi mobile" : "English desktop"}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      hi ? { width: 360, height: 800 } : { width: 1440, height: 1000 },
    );
    let signedIn = false,
      expired = false,
      csrf = "first-csrf",
      refreshes = 0;
    const account = {
      id: "10000000-0000-4000-8000-000000000661",
      name: "Synthetic teacher",
      role: "GUARDIAN",
      verified: false,
    };
    const writes: {
      key: string | undefined;
      body: string | null;
      csrf: string | undefined;
    }[] = [];
    let progress = {
      kind: "TEACHER",
      state: "DRAFT",
      draft: {} as any,
      version: 0,
      completedResourceId: null,
    };
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path.endsWith("/auth/session"))
        return route.fulfill({
          status: signedIn && !expired ? 200 : 401,
          json:
            signedIn && !expired
              ? { account, csrfToken: csrf }
              : { code: "SESSION_REQUIRED", message: "Sign in to continue." },
        });
      if (path.endsWith("/auth/otp/request"))
        return route.fulfill({
          status: 201,
          json: { status: "SENT", expiresIn: 300 },
        });
      if (path.endsWith("/auth/otp/verify")) {
        signedIn = true;
        return route.fulfill({
          status: 201,
          json: { account, csrfToken: csrf },
        });
      }
      if (path.endsWith("/auth/refresh")) {
        refreshes++;
        expired = false;
        csrf = "renewed-csrf";
        return route.fulfill({
          status: 201,
          json: { account, csrfToken: csrf },
        });
      }
      if (path.endsWith("/onboarding/teacher/drafts")) {
        writes.push({
          key: request.headers()["idempotency-key"],
          body: request.postData(),
          csrf: request.headers()["x-csrf-token"],
        });
        if (writes.length === 1) {
          expired = true;
          return route.fulfill({
            status: 401,
            json: { code: "SESSION_REQUIRED", message: "Sign in to continue." },
          });
        }
        progress = {
          ...progress,
          version: 1,
          draft: request.postDataJSON().draft,
        };
        return route.fulfill({ status: 201, json: progress });
      }
      if (path.endsWith("/onboarding/teacher"))
        return route.fulfill({ json: progress });
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Synthetic route not supplied" },
      });
    });
    const response = await page.goto("/signup/teacher");
    expect(response!.headers()["content-security-policy"]).not.toContain(
      "unsafe-eval",
    );
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
    await page
      .getByLabel(hi ? "आपका नाम" : "Your name", { exact: true })
      .fill(account.name);
    await page
      .getByLabel(hi ? "ईमेल पता" : "Email address", { exact: true })
      .fill("teacher@example.test");
    await page
      .getByRole("button", {
        name: hi ? "पुष्टि कोड भेजें" : "Send verification code",
        exact: true,
      })
      .click();
    await expect(page.locator(".auth-sandbox")).toHaveCount(0);
    await page
      .getByLabel(hi ? "छह अंकों का कोड" : "Six-digit code", { exact: true })
      .fill("123456");
    await page
      .getByRole("button", {
        name: hi
          ? "पुष्टि करके आवेदन पर जाएँ"
          : "Verify and continue to application",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/onboarding\/teacher/);
    const T = (en: string, _hn?: string) => translateText(hi, en) as string;
    await page
      .getByLabel(T("Teaching headline", "पढ़ाने का छोटा परिचय"), {
        exact: true,
      })
      .fill("Keep these teaching details");
    await page
      .getByLabel(T("About your teaching", "अपने पढ़ाने के बारे में"), {
        exact: true,
      })
      .fill("Synthetic worked examples and regular practice.");
    await page
      .getByLabel(T("Years of teaching experience", "पढ़ाने का अनुभव (वर्ष)"), {
        exact: true,
      })
      .fill("5");
    await page
      .getByRole("button", {
        name: hi ? "निजी पता पर आगे बढ़ें" : "Continue to private address",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: T("Private address", "निजी पता"),
        exact: true,
      }),
    ).toBeVisible();
    expect(refreshes).toBe(1);
    expect(writes).toHaveLength(2);
    expect(writes[1].key).toBe(writes[0].key);
    expect(writes[1].body).toBe(writes[0].body);
    expect(writes[1].csrf).toBe("renewed-csrf");
    expect(progress.draft.headline).toBe("Keep these teaching details");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
