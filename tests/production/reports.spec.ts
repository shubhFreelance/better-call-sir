import { test, expect } from "@playwright/test";
test("production reporting chart renders and accepts keyboard interaction under the strict CSP", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /content security|unsafe-eval|Refused to execute/i.test(m.text())
    )
      errors.push(m.text());
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      now = new Date().toISOString();
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000201",
            name: "Synthetic production finance",
            role: "FINANCE",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil: new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role: "FINANCE",
          window: {
            start: now,
            end: now,
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
          metrics: {},
        },
      });
    if (path.endsWith("/reports/finance"))
      return route.fulfill({
        json: {
          window: {
            from: new Date(url.searchParams.get("from")!).toISOString(),
            to: new Date(url.searchParams.get("to")!).toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "operations-v1",
          },
          currency: "INR",
          captured: { count: 1, amountPaise: 12345 },
          captureModes: [
            { providerMode: "SANDBOX", count: 1, amountPaise: 12345 },
          ],
          pendingRefunds: { count: 0, amountPaise: 0 },
          outstandingInvoices: {
            count: 0,
            amountPaise: 0,
            basis: "CURRENT_ALL_TIME",
          },
          teacherPayables: [],
          providerSettlementVerified: false,
          asOf: now,
        },
      });
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Missing synthetic report" },
    });
  });
  const response = await page.goto("/dashboard/reports");
  expect(response!.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  await expect(
    page.getByRole("table", { name: "Provider-mode capture records" }),
  ).toContainText("₹123.45");
  const chart = page.locator('[data-slot="chart"] [role="application"]');
  await expect(chart).toBeVisible();
  await chart.focus();
  await chart.press("ArrowRight");
  await expect(page.locator(".reports-tooltip")).toContainText("₹123.45");
  expect(errors).toEqual([]);
});
