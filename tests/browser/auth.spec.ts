import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function enterDetails(
  page: import("@playwright/test").Page,
  email = "guardian@example.test",
) {
  await page.getByLabel("Your name").fill("Synthetic Email Parent");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
}

test("real email OTP preserves teacher onboarding and keeps new adults unverified", async ({
  page,
}) => {
  const email = `ui-${crypto.randomUUID()}@example.test`;
  const next =
    "/onboarding/parent?teacher=30000000-0000-4000-8000-000000000001&profile=ananya-sharma";
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/otp/request") &&
      response.request().method() === "POST",
  );
  await enterDetails(page, ` ${email.toUpperCase()} `);
  const challenge = await (await response).json();
  expect(challenge.status).toBe("SANDBOX");
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Development preview — no email was sent."),
  ).toBeVisible();
  const input = page.getByLabel("Six-digit code");
  await expect(input).toBeFocused();
  await input.fill(
    challenge.developmentCode === "000000" ? "111111" : "000000",
  );
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByText("That code is incorrect or expired.", { exact: false }),
  ).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill(challenge.developmentCode);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(new RegExp("/onboarding/parent\\?teacher="));
  expect(new URL(page.url()).searchParams.get("teacher")).toBe(
    "30000000-0000-4000-8000-000000000001",
  );
  await expect(
    page.getByText("You chose a teacher", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save my tuition request" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("Verification pending.", { exact: false }),
  ).toBeVisible();
});

test("validation and provider failure preserve details; sent responses never display preview codes", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/auth/otp/request", async (route) => {
    requests++;
    await route.fulfill({
      status: requests === 1 ? 503 : 201,
      json:
        requests === 1
          ? {
              code: "EMAIL_UNAVAILABLE",
              message: "Email delivery is unavailable. Please retry later.",
            }
          : { status: "SENT", expiresIn: 300, developmentCode: "000123" },
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(
    page.getByText("Enter your name.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await expect(page.getByLabel("Your name")).toBeFocused();
  await enterDetails(page);
  await expect(
    page.getByText("Email delivery is unavailable. Please retry later."),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(
    "guardian@example.test",
  );
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  await expect(page.getByText("000123", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await expect(page.getByLabel("Email address")).toHaveValue(
    "guardian@example.test",
  );
  await expect(page.getByLabel("Your name")).toHaveValue(
    "Synthetic Email Parent",
  );
});

test("expired code cannot submit and resend clears the old code", async ({
  page,
}) => {
  let requests = 0,
    verifies = 0;
  await page.clock.install();
  await page.route("**/auth/otp/request", async (route) => {
    requests++;
    await route.fulfill({
      status: 201,
      json: { status: "SENT", expiresIn: requests === 1 ? 2 : 300 },
    });
  });
  await page.route("**/auth/otp/verify", async (route) => {
    verifies++;
    await route.fulfill({
      status: 401,
      json: { code: "INVALID_OTP", message: "Invalid code" },
    });
  });
  await page.goto("/login");
  await enterDetails(page);
  await page.getByLabel("Six-digit code").fill("123456");
  await page.clock.fastForward(61000);
  await expect(
    page.getByText("This code has expired. Request a new one."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeDisabled();
  expect(verifies).toBe(0);
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByLabel("Six-digit code")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeEnabled();
  expect(requests).toBe(2);
});

test("mobile email and code forms fit and have no serious accessibility findings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 850 });
  await page.route("**/auth/otp/request", (route) =>
    route.fulfill({ status: 201, json: { status: "SENT", expiresIn: 300 } }),
  );
  await page.goto("/login");
  for (const step of ["email", "code"]) {
    await page.evaluate(() => document.fonts.ready.then(() => true));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/signin-${step}-mobile.png`,
      fullPage: true,
    });
    if (step === "email") await enterDetails(page);
  }
});
