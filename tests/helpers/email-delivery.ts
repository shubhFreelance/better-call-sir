import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "./contract";
import { chooseHindi, checkHindi } from "./hindi";
const id = "20000000-0000-4000-8000-000000000981",
  actor = "10000000-0000-4000-8000-000000000981",
  attemptId = "30000000-0000-4000-8000-000000000981";
async function fixture(
  page: Page,
  options: {
    staff?: boolean;
    lost?: boolean;
    readFailure?: boolean;
    status?: string;
    history?: boolean;
    otp?: boolean;
  } = {},
) {
  const now = new Date().toISOString(),
    writes: any[] = [],
    receipts = new Map();
  let denied = false,
    aborted = false;
  const row: any = {
    id,
    topic: "request.created",
    kind: options.otp ? "OTP" : "NOTIFICATION",
    locale: "en",
    actionPath: options.otp ? null : "/dashboard",
    provider: options.status === "SANDBOX" ? "SANDBOX" : "RESEND",
    status: options.status || "FAILED",
    failureCode: options.status ? null : "PROVIDER_REJECTED",
    attempts: 1,
    maxAttempts: 5,
    version: 1,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: now,
    updatedAt: now,
    retryAvailable: !options.otp && !options.status,
  };
  const attempt = {
    id: attemptId,
    deliveryId: id,
    number: 1,
    outcome: "REJECTED",
    failureCode: "PROVIDER_REJECTED",
    startedAt: now,
    completedAt: now,
  };
  const checked = (name: string, value: unknown) => {
    const validate = validator(name);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    return value;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      uri = new URL(req.url()),
      path = uri.pathname.replace("/api/v1", "");
    if (path === "/auth/session")
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic Recipient",
            role: options.staff ? "ADMIN" : "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path === "/auth/mfa")
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (req.method() === "GET") {
      if (path.endsWith("/history")) {
        if (denied)
          return route.fulfill({
            status: 403,
            json: { code: "FORBIDDEN", message: "Email delivery not found." },
          });
        return route.fulfill({
          json: checked("EmailDeliveryHistory", {
            delivery: row,
            providerReference: options.staff
              ? "40000000-0000-4000-8000-000000000981"
              : null,
            attempts: uri.searchParams.has("attemptsCursor") ? [] : [attempt],
            attemptsNextCursor:
              options.history && !uri.searchParams.has("attemptsCursor")
                ? attemptId
                : null,
            receipts:
              row.status === "DELIVERED"
                ? [
                    {
                      id: "evt_synthetic",
                      deliveryId: id,
                      providerId: "40000000-0000-4000-8000-000000000981",
                      kind: "DELIVERED",
                      occurredAt: now,
                      receivedAt: now,
                    },
                  ]
                : [],
            receiptsNextCursor: null,
          }),
        });
      }
      if (path === "/notifications" || path === "/admin/email-deliveries") {
        const status = uri.searchParams.get("status"),
          items =
            status && status !== row.status
              ? []
              : [
                  {
                    ...row,
                    ...(uri.searchParams.has("cursor")
                      ? { id: "20000000-0000-4000-8000-000000000982" }
                      : {}),
                  },
                ];
        return route.fulfill({
          json: checked("EmailDeliveryPage", {
            items,
            nextCursor:
              options.history && !uri.searchParams.has("cursor") ? id : null,
          }),
        });
      }
      return route.fulfill({
        json: {
          items: [],
          placements: [],
          children: [],
          teachers: [],
          metrics: {},
        },
      });
    }
    const key = req.headers()["idempotency-key"],
      body = req.postDataJSON();
    expect(key).toBeTruthy();
    expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    writes.push({ key, body, path });
    let result = receipts.get(key);
    if (!result) {
      expect(body.expectedVersion).toBe(row.version);
      expect(body.confirmed).toBe(true);
      row.status = "QUEUED";
      row.version++;
      row.retryAvailable = false;
      row.failureCode = null;
      result = checked("EmailDelivery", structuredClone(row));
      receipts.set(key, result);
      if (options.lost && !aborted) {
        aborted = true;
        return route.abort("failed");
      }
      if (options.readFailure) denied = true;
    }
    return route.fulfill({ status: 201, json: result });
  });
  return {
    writes,
    restore: () => {
      denied = false;
    },
    row,
  };
}
async function open(page: Page, staff = false) {
  await page.goto(
    staff ? "/dashboard/email-delivery" : "/dashboard/notifications",
  );
  await page
    .getByRole("button", { name: "View delivery record", exact: true })
    .first()
    .click();
}
async function review(page: Page) {
  await page
    .getByLabel("What did you check before retrying?", { exact: true })
    .fill("Synthetic provider configuration checked and repaired.");
  await page
    .getByRole("button", { name: "Review safe retry", exact: true })
    .click();
  await page
    .getByLabel(
      "I reviewed the failure and authorize retrying the same delivery.",
    )
    .check();
  await page
    .getByRole("button", { name: "Confirm safe retry", exact: true })
    .click();
}
export function emailDeliveryTests() {
  test("users see sanitized delivery states and signed receipt history without staff retry controls", async ({
    page,
  }) => {
    await fixture(page, { status: "DELIVERED" });
    await open(page);
    await expect(
      page.getByRole("heading", {
        name: "Signed provider receipts",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Delivered", { exact: true }).last(),
    ).toBeVisible();
    await expect(
      page.getByLabel("What did you check before retrying?", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Accepted is different from delivered", { exact: true }),
    ).toBeVisible();
  });
  test("development preview explicitly sends no email to an inbox", async ({
    page,
  }) => {
    await fixture(page, { status: "SANDBOX" });
    await open(page);
    await expect(
      page.getByText(
        "Development preview only. No email was sent to an inbox.",
        { exact: true },
      ),
    ).toBeVisible();
  });
  test("staff reviews one safe retry and keeps its receipt when the record leaves the failed queue", async ({
    page,
  }) => {
    const f = await fixture(page, { staff: true });
    await open(page, true);
    await review(page);
    await expect(
      page.getByText(
        "Email recovery recorded. This does not confirm delivery.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("No delivery records match this view.", { exact: true }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Teacher connection update",
        level: 2,
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Close delivery details", exact: true }),
    ).toBeEnabled();
  });
  test("uncertain staff retries preserve the exact key/body and lock movement until recovered", async ({
    page,
  }) => {
    const f = await fixture(page, { staff: true, lost: true });
    await open(page, true);
    await review(page);
    await expect(
      page.getByRole("button", { name: "Close delivery details", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Delivery status", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry same decision", exact: true })
      .click();
    await expect(
      page.getByText(
        "Email recovery recorded. This does not confirm delivery.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(f.writes[1]).toEqual(f.writes[0]);
  });
  test("a saved retry hides private details on denied refresh and reloads without a second write", async ({
    page,
  }) => {
    const f = await fixture(page, { staff: true, readFailure: true });
    await open(page, true);
    await review(page);
    await expect(
      page.getByText(
        "Delivery details are unavailable. Private records are hidden until access is restored.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Teacher connection update",
        level: 2,
        exact: true,
      }),
    ).toHaveCount(0);
    f.restore();
    await page
      .getByRole("button", { name: "Reload delivery details", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Teacher connection update",
        level: 2,
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
  });
  test("staff cannot resend sign-in codes through email recovery", async ({
    page,
  }) => {
    await fixture(page, { staff: true, otp: true });
    await open(page, true);
    await expect(
      page.getByText(
        "Sign-in codes must be requested by the account owner. Staff cannot resend them.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review safe retry", exact: true }),
    ).toHaveCount(0);
  });
  test("notification and attempt histories reach later pages with scoped controls", async ({
    page,
  }) => {
    await fixture(page, { history: true });
    await page.goto("/dashboard/notifications");
    await page
      .getByRole("button", { name: "Load more records", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "View delivery record", exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: "View delivery record", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Next attempts", exact: true })
      .click();
    await expect(
      page.getByText("No provider attempts are recorded.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Previous attempts", exact: true })
      .click();
    await expect(
      page.getByText("Attempt 1 · Rejected", { exact: true }),
    ).toBeVisible();
  });
  for (const width of [320, 390, 430])
    test(`Hindi staff delivery recovery fits ${width}px phones`, async ({
      page,
    }) => {
      await chooseHindi(page);
      await page.setViewportSize({ width, height: 850 });
      await fixture(page, { staff: true });
      await page.goto("/dashboard/email-delivery");
      await page
        .getByRole("button", { name: "ईमेल का रिकॉर्ड देखें", exact: true })
        .click();
      await checkHindi(page, "ईमेल की स्थिति और सुधार");
      await page
        .getByLabel("दोबारा प्रयास से पहले आपने क्या जाँचा?", { exact: true })
        .fill("सिंथेटिक प्रदाता सेटिंग की जाँच की गई।");
      await page
        .getByRole("button", {
          name: "सुरक्षित पुनः प्रयास की समीक्षा करें",
          exact: true,
        })
        .click();
      await checkHindi(page);
      const results = await new AxeBuilder({ page })
        .disableRules(["color-contrast"])
        .analyze();
      expect(
        results.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      if (width === 390)
        await page.screenshot({
          path: "test-results/email-recovery-hindi-mobile.png",
          fullPage: true,
          style: "nextjs-portal{display:none!important}",
        });
    });
  test("an uncertain code request locks identity and retries the same challenge key and language", async ({
    page,
  }) => {
    const writes: any[] = [];
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (path.endsWith("/auth/session") || path.endsWith("/auth/refresh"))
        return route.fulfill({
          status: 401,
          json: { code: "SESSION_REQUIRED", message: "Sign in again." },
        });
      if (path.endsWith("/auth/otp/request")) {
        writes.push({
          key: req.headers()["idempotency-key"],
          body: req.postDataJSON(),
        });
        if (writes.length === 1) return route.abort("failed");
        return route.fulfill({
          status: 201,
          json: {
            status: "SANDBOX",
            developmentCode: "123456",
            expiresIn: 300,
          },
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/login");
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Synthetic Email Learner");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("synthetic@example.test");
    await page
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Language / भाषा", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry the same code request", exact: true })
      .click();
    await expect(
      page.getByLabel("Six-digit code", { exact: true }),
    ).toBeVisible();
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0].key).toBeTruthy();
  });
  test("a pending sign-in delivery never claims confirmed inbox delivery", async ({
    page,
  }) => {
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/session") || path.endsWith("/auth/refresh"))
        return route.fulfill({
          status: 401,
          json: { code: "SESSION_REQUIRED", message: "Sign in again." },
        });
      if (path.endsWith("/auth/otp/request"))
        return route.fulfill({
          status: 201,
          json: { status: "PENDING", expiresIn: 300 },
        });
      return route.fulfill({ json: [] });
    });
    await page.goto("/login");
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Synthetic Pending Learner");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("synthetic@example.test");
    await page
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await expect(
      page.getByText(
        "Your email is queued for processing. Inbox delivery has not yet been confirmed.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Development preview — no email was sent.", {
        exact: true,
      }),
    ).toHaveCount(0);
  });
  test("English delivery record supports keyboard access and accessible status history", async ({
    page,
  }) => {
    await fixture(page, { staff: true });
    await open(page, true);
    await expect(
      page.getByRole("heading", {
        name: "Teacher connection update",
        level: 2,
        exact: true,
      }),
    ).toBeFocused();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/email-delivery-english-desktop.png",
      fullPage: true,
      style: "nextjs-portal{display:none!important}",
    });
  });
}
