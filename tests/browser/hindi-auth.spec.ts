import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
const language = (page: Page) =>
  page.getByLabel("Language / भाषा", { exact: true });
async function hindi(page: Page) {
  await page.goto("/login");
  await language(page).selectOption("hi");
  await page
    .getByRole("button", { name: "नया खाता बनाएँ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "अपना खाता बनाएँ",
      exact: true,
    }),
  ).toBeVisible();
}
async function details(page: Page) {
  await page.getByLabel("आपका नाम", { exact: true }).fill("नमूना अभिभावक");
  await page
    .getByLabel("ईमेल पता", { exact: true })
    .fill("guardian@example.test");
}
test("Hindi real OTP keeps adult verification separate and accepts Devanagari code digits", async ({
  page,
}) => {
  await hindi(page);
  const email = `hi-${crypto.randomUUID()}@example.test`;
  await page.getByLabel("आपका नाम", { exact: true }).fill("नमूना अभिभावक");
  await page.getByLabel("ईमेल पता", { exact: true }).fill(email);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "साइन-इन कोड भेजें", exact: true })
    .click();
  const sent = await response,
    challenge = await sent.json();
  expect(sent.status()).toBe(201);
  expect(sent.request().postDataJSON()).toEqual({ email, locale: "hi" });
  expect(challenge.status).toBe("SANDBOX");
  await expect(
    page.getByText("डेवलपमेंट प्रीव्यू — कोई ईमेल नहीं भेजा गया।", {
      exact: true,
    }),
  ).toBeVisible();
  const input = page.getByLabel("छह अंकों का कोड", { exact: true });
  await input.fill(
    challenge.developmentCode.replace(/[0-9]/g, (d: string) =>
      String.fromCharCode(0x966 + Number(d)),
    ),
  );
  await expect(input).toHaveValue(challenge.developmentCode);
  await page
    .getByRole("button", { name: "पुष्टि करके आगे बढ़ें", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/guardian$/);
  const account = await (await page.request.get("/api/v1/auth/session")).json();
  expect(account.account.role).toBe("GUARDIAN");
  expect(account.account.verified).toBe(false);
  expect(account.account.name).toBe("नमूना अभिभावक");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
    "bcs.interface-language": "hi",
  });
});
test("language changes preserve entered details and translate existing validation", async ({
  page,
}) => {
  await hindi(page);
  await page
    .getByRole("button", { name: "साइन-इन कोड भेजें", exact: true })
    .click();
  await expect(
    page.getByText("अपना नाम डालें।", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("सही ईमेल पता डालें।", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("आपका नाम", { exact: true }).fill("नमूना अभिभावक");
  await page.getByLabel("ईमेल पता", { exact: true }).fill("invalid-email");
  await language(page).selectOption("en");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "नमूना अभिभावक",
  );
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "invalid-email",
  );
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  await language(page).selectOption("hi");
  await expect(
    page.getByText("सही ईमेल पता डालें।", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(language(page)).toHaveValue("hi");
  await page
    .getByRole("button", { name: "नया खाता बनाएँ", exact: true })
    .click();
  await expect(page.getByLabel("आपका नाम", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("ईमेल पता", { exact: true })).toHaveValue("");
});
test("provider failures stay translated and keep details when changing language", async ({
  page,
}) => {
  await page.route("**/auth/otp/request", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "EMAIL_UNAVAILABLE",
        message: "Email delivery is unavailable. Please retry later.",
      },
    }),
  );
  await hindi(page);
  await details(page);
  await page
    .getByRole("button", { name: "साइन-इन कोड भेजें", exact: true })
    .click();
  await expect(
    page.getByText("अभी ईमेल भेजा नहीं जा सका। कुछ देर बाद फिर कोशिश करें।", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("ईमेल पता", { exact: true })).toHaveValue(
    "guardian@example.test",
  );
  await language(page).selectOption("en");
  await expect(
    page.getByText("Email delivery is unavailable. Please retry later.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "नमूना अभिभावक",
  );
});
test("Hindi wrong-code, expiry and resend recovery retain the selected email locale", async ({
  page,
}) => {
  await page.clock.install();
  const bodies: any[] = [];
  await page.route("**/auth/otp/request", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({
      status: 201,
      json: { status: "SENT", expiresIn: 2, developmentCode: "000123" },
    });
  });
  await page.route("**/auth/otp/verify", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "INVALID_OTP", message: "The code is invalid or expired." },
    }),
  );
  await hindi(page);
  await details(page);
  await page
    .getByRole("button", { name: "साइन-इन कोड भेजें", exact: true })
    .click();
  await expect(page.getByText("000123", { exact: true })).toHaveCount(0);
  await page.getByLabel("छह अंकों का कोड", { exact: true }).fill("१२३४५६");
  await page
    .getByRole("button", { name: "पुष्टि करके आगे बढ़ें", exact: true })
    .click();
  await expect(
    page.getByText(
      "कोड गलत है या उसकी वैधता समाप्त हो गई है। जाँचें या नया कोड मँगाएँ।",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("छह अंकों का कोड", { exact: true }),
  ).toBeFocused();
  await language(page).selectOption("en");
  await expect(page.getByLabel("Six-digit code", { exact: true })).toHaveValue(
    "123456",
  );
  await expect(
    page.getByText(
      "That code is incorrect or expired. Check it or request a new code.",
      { exact: true },
    ),
  ).toBeVisible();
  await language(page).selectOption("hi");
  await page.clock.fastForward(61000);
  await expect(
    page.getByText("इस कोड की वैधता समाप्त हो गई है। नया कोड मँगाएँ।", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "पुष्टि करके आगे बढ़ें", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "कोड फिर भेजें", exact: true })
    .click();
  expect(bodies).toEqual([
    { email: "guardian@example.test", locale: "hi" },
    { email: "guardian@example.test", locale: "hi" },
  ]);
  await expect(page.getByLabel("छह अंकों का कोड", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "ईमेल बदलें", exact: true }).click();
  await expect(page.getByLabel("ईमेल पता", { exact: true })).toBeFocused();
  await expect(page.getByLabel("ईमेल पता", { exact: true })).toHaveValue(
    "guardian@example.test",
  );
});
test("Hindi sign-in uses a loaded Devanagari font and fits phone screens accessibly", async ({
  page,
}) => {
  await page.route("**/auth/otp/request", (route) => {
    expect(validator("OtpRequest")(route.request().postDataJSON())).toBe(true);
    return route.fulfill({
      status: 201,
      json: { status: "SENT", expiresIn: 300 },
    });
  });
  await hindi(page);
  for (const step of ["email", "code"]) {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const button of await page
        .locator(".auth-card button:visible")
        .all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 390, height: 850 });
    await expect(page.locator(".auth-section")).toHaveAttribute("lang", "hi");
    expect(
      await page.evaluate(() =>
        document.fonts.check('16px "Noto Sans Devanagari Variable"', "हिन्दी"),
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
    await page.screenshot({
      path: `test-results/signin-hindi-${step}-mobile.png`,
      fullPage: true,
    });
    if (step === "email") {
      await details(page);
      await page
        .getByRole("button", { name: "साइन-इन कोड भेजें", exact: true })
        .click();
    }
  }
});
test("blocked preference storage does not block language selection or sign-in validation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage disabled");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await hindi(page);
  await page
    .getByRole("button", { name: "साइन-इन कोड भेजें", exact: true })
    .click();
  await expect(
    page.getByText("अपना नाम डालें।", { exact: true }),
  ).toBeVisible();
});
