import { test, expect } from "@playwright/test";
import { assertParserCsp } from "../helpers/csp";
test("production CSP forbids untrusted scripts, has per-request nonces and serves no secret files or source maps", async ({
  page,
  request,
}) => {
  const response = await page.goto("/"),
    headers = response!.headers(),
    csp = headers["content-security-policy"];
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp.match(/script-src[^;]+/)![0]).not.toContain("'unsafe-inline'");
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await expect(
    page.getByRole("heading", {
      name: "A little guidance. A world of possibilities.",
    }),
  ).toBeVisible();
  const nonce = csp.match(/'nonce-([^']+)'/)![1],
    second = await request.get("/login", { headers: { "x-nonce": "forged" } });
  expect(second.headers()["content-security-policy"]).not.toContain("forged");
  expect(
    second.headers()["content-security-policy"].match(/'nonce-([^']+)'/)![1],
  ).not.toBe(nonce);
  const source = await page
    .locator('script[src*="/_next/static/"]')
    .first()
    .getAttribute("src");
  await assertParserCsp(page);
  for (const path of [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.cache/private-evidence",
    "/node_modules/package.json",
  ])
    expect((await request.get(path)).status()).toBe(404);
  expect(source).toBeTruthy();
  expect((await request.get(source + ".map")).status()).toBe(404);
  expect(headers["cache-control"]).toContain("no-store");
});
test("production Razorpay handoff uses the document nonce and a current owned order under the strict policy", async ({
  page,
}) => {
  const guardian = "10000000-0000-4000-8000-000000000096",
    child = "20000000-0000-4000-8000-000000000096",
    teacher = "30000000-0000-4000-8000-000000000096",
    resourceId = "40000000-0000-4000-8000-000000000096",
    now = Date.now(),
    reservation = {
      id: resourceId,
      teacherId: teacher,
      guardianId: guardian,
      childId: child,
      kind: "REVISION",
      startsAt: new Date(now + 86400000).toISOString(),
      endsAt: new Date(now + 87600000).toISOString(),
      status: "HOLD",
      version: 2,
      topic: "Synthetic production CSP check",
      subject: "Maths",
      language: "English",
      scopeAccepted: true,
      amountPaise: 50105,
      payablePaise: 50105,
      pricePolicyVersion: "synthetic-v1",
      expiresAt: new Date(now + 600000).toISOString(),
    },
    order = {
      id: "50000000-0000-4000-8000-000000000096",
      accountId: guardian,
      kind: "REVISION",
      resourceId,
      amountPaise: 50105,
      currency: "INR",
      provider: "RAZORPAY",
      providerMode: "LIVE",
      providerOrderId: "order_synthetic_csp",
      status: "CREATED",
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: guardian,
            name: "Synthetic guardian",
            role: "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic",
        },
      });
    if (path.endsWith("/dashboard"))
      return route.fulfill({
        json: {
          role: "GUARDIAN",
          window: {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            timezone: "Asia/Kolkata",
            metricVersion: "synthetic",
          },
          metrics: {},
          children: [
            { id: child, alias: "Synthetic learner", grade: 8, board: "CBSE" },
          ],
          teachers: [],
          placements: [],
          reservations: [reservation],
          consent: { withdrawnAt: null },
        },
      });
    if (path.endsWith("/checkout-orders"))
      return route.fulfill({
        json: { order, publicKeyId: "rzp_test_synthetic_public" },
      });
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.Razorpay=class {constructor(options){window.__ownedGatewayOptions=options;} on(){} close(){} open(){window.__ownedGatewayOpened=true;}};",
    }),
  );
  const response = await page.goto("/dashboard/bookings"),
    nonce = response!
      .headers()
      ["content-security-policy"].match(/'nonce-([^']+)'/)![1];
  await page.getByRole("button", { name: "Review payment terms" }).click();
  await page
    .getByRole("checkbox", { name: /I reviewed the exact amount/ })
    .check();
  await page.getByRole("button", { name: "Save payment review" }).click();
  await page.getByRole("button", { name: "Continue to Razorpay" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__ownedGatewayOpened))
    .toBe(true);
  expect(
    await page
      .locator('script[src="https://checkout.razorpay.com/v1/checkout.js"]')
      .evaluate((script) => (script as HTMLScriptElement).nonce),
  ).toBe(nonce);
  expect(
    await page.evaluate(() => {
      const value = (window as any).__ownedGatewayOptions;
      return { amount: value.amount, order: value.order_id };
    }),
  ).toEqual({ amount: 50105, order: "order_synthetic_csp" });
  await expect(
    page.getByRole("heading", { name: "Payment captured by the server" }),
  ).toHaveCount(0);
});
