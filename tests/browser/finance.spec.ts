import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../../packages/test-fixtures/src";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const actor = "10000000-0000-4000-8000-000000000151",
  orderId = "20000000-0000-4000-8000-000000000151",
  otherId = "20000000-0000-4000-8000-000000000152",
  reference = "30000000-0000-4000-8000-000000000151";
async function mock(page: Page, mode = "normal", role = "FINANCE") {
  const now = new Date().toISOString(),
    writes: any[] = [],
    reads: string[] = [],
    replays = new Map<string, any>();
  let stale = mode === "stale",
    failed = false,
    reportFailed = mode === "readErrors",
    queueFailed = mode === "readErrors";
  const order: any = {
    id: orderId,
    accountId: actor,
    kind: "INVOICE",
    resourceId: reference,
    amountPaise: 12345,
    currency: "INR",
    provider: "RAZORPAY",
    providerMode: mode === "live" ? "LIVE" : "SANDBOX",
    providerOrderId: mode === "live" ? "order_synthetic" : null,
    status: "CREATED",
    version: 2,
    createdAt: now,
    updatedAt: now,
  };
  function check(name: string, value: any) {
    const v = validator(name);
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    return value;
  }
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic finance",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/auth/mfa"))
      return route.fulfill({
        json: {
          enabled: true,
          verifiedUntil:
            mode === "mfa" ? null : new Date(Date.now() + 600000).toISOString(),
          recoveryCodesRemaining: 8,
        },
      });
    if (req.method() === "GET") {
      reads.push(url.pathname + url.search);
      if (path.endsWith("/dashboard"))
        return route.fulfill({
          json: {
            role,
            window: {
              start: now,
              end: now,
              timezone: "Asia/Kolkata",
              metricVersion: "synthetic",
            },
            metrics: {},
          },
        });
      if (path.endsWith("/reports/finance") && reportFailed) {
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Totals unavailable" },
        });
      }
      if (path.endsWith("/reports/finance"))
        return route.fulfill({
          json: check("FinanceReport", {
            window: {
              from: new Date(url.searchParams.get("from")!).toISOString(),
              to: new Date(url.searchParams.get("to")!).toISOString(),
              timezone: "Asia/Kolkata",
              metricVersion: "operations-v1",
            },
            currency: "INR",
            captured: { count: 2, amountPaise: 12345 },
            pendingRefunds: { count: 1, amountPaise: 500 },
            outstandingInvoices: {
              count: 3,
              amountPaise: 20000,
              basis: "CURRENT_ALL_TIME",
            },
            teacherPayables: [
              { status: "ELIGIBLE", count: 1, amountPaise: 10000 },
            ],
            providerSettlementVerified: false,
            asOf: now,
          }),
        });
      if (path.endsWith("/finance/records")) {
        if (failed || queueFailed) {
          failed = false;
          if (mode !== "readErrors") queueFailed = false;
          return route.fulfill({
            status: 503,
            json: { code: "UNAVAILABLE", message: "Queue unavailable" },
          });
        }
        const kind = url.searchParams.get("kind")!,
          second = !!url.searchParams.get("cursor"),
          status =
            kind === "INVOICES"
              ? "DUE"
              : kind === "CHECKOUTS"
                ? order.status
                : kind === "PAYMENTS"
                  ? "CAPTURED"
                  : kind === "REFUNDS"
                    ? "PENDING"
                    : "ELIGIBLE";
        const row = {
          id: second ? otherId : orderId,
          kind,
          amountPaise: 12345,
          currency: "INR",
          status,
          version: ["INVOICES", "CHECKOUTS", "PAYABLES"].includes(kind)
            ? 2
            : null,
          createdAt: kind === "INVOICES" ? null : now,
          referenceId: reference,
          checkoutOrderId: kind === "INVOICES" ? null : orderId,
          providerMode: kind === "INVOICES" ? null : order.providerMode,
          reason: kind === "REFUNDS" ? "Synthetic refund reason" : null,
          policyVersion: kind === "PAYABLES" ? "synthetic-policy" : null,
          eligibleAt: kind === "PAYABLES" ? now : null,
        };
        return route.fulfill({
          json: check("FinanceRecordList", {
            items: mode === "empty" ? [] : [row],
            nextCursor: mode === "paging" && !second ? orderId : null,
            order: "ID_DESC",
            providerSettlementVerified: false,
          }),
        });
      }
      if (path.endsWith("/checkout-orders/" + orderId))
        return route.fulfill({ json: check("CheckoutOrder", order) });
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Missing synthetic record" },
      });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path, body, key });
    expect(check("ReconciliationInput", body)).toBeTruthy();
    expect(key).toBeTruthy();
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    if (stale) {
      stale = false;
      order.version = 3;
      return route.fulfill({
        status: 409,
        json: { code: "CONFLICT", message: "Checkout changed" },
      });
    }
    const result = check("Reconciliation", {
      order: { ...order },
      status: mode === "live" ? "paid" : "LOCAL_SANDBOX_ONLY",
    });
    replays.set(key, result);
    if (mode === "unknown" && writes.length === 1) return route.abort();
    if (mode === "refresh" && writes.length === 1) failed = true;
    return route.fulfill({ status: 201, json: result });
  });
  return {
    writes,
    reads,
    releaseReport: () => {
      reportFailed = false;
    },
    releaseQueue: () => {
      queueFailed = false;
    },
  };
}
async function inspect(page: Page, kind = "CHECKOUTS") {
  await page.goto("/dashboard/finance");
  await page.getByLabel("Record type", { exact: true }).selectOption(kind);
  await page.getByRole("button", { name: "Inspect record 20000000" }).click();
}
async function review(page: Page) {
  await page
    .getByLabel("Reason for provider query")
    .fill("Synthetic reviewed financial evidence");
  await page
    .getByRole("button", { name: "Review provider query", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this order/ }).check();
}
test("finance is role restricted and private queries wait for staff MFA", async ({
  page,
}) => {
  const s = await mock(page, "normal", "STUDENT");
  await page.goto("/dashboard/finance");
  await expect(page.getByText("Finance access is required")).toBeVisible();
  expect(
    s.reads.some(
      (p) => p.includes("/finance") || p.includes("/checkout-orders"),
    ),
  ).toBe(false);
  await page.unrouteAll();
  const m = await mock(page, "mfa");
  await page.goto("/dashboard/finance");
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeVisible();
  expect(m.reads.some((p) => p.includes("/finance"))).toBe(false);
});
test("actual finance totals show dates, exact paise and separate obligation bases", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/finance");
  await expect(
    page.getByText("₹123.45", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("3 invoices · current across all dates"),
  ).toBeVisible();
  await expect(page.getByText(/eligible: ₹100.00/)).toBeVisible();
  await page.getByLabel("Recorded from (IST)").fill("2026-10-12");
  await page.getByLabel("Recorded through (IST)").fill("2026-10-11");
  await page.getByRole("button", { name: "Apply report dates" }).click();
  await expect(
    page.locator(".finance-workspace").getByRole("alert"),
  ).toContainText("ordered date range");
  await page.getByLabel("Recorded through (IST)").fill("2026-10-14");
  await page.getByRole("button", { name: "Apply report dates" }).click();
  await expect
    .poll(() => s.reads.some((p) => p.includes("from=2026-10-12")))
    .toBe(true);
  const query = new URL(
    s.reads.filter((p) => p.includes("from=2026-10-12")).at(-1)!,
    "http://localhost",
  );
  expect(new Date(query.searchParams.get("from")!).toISOString()).toBe(
    "2026-10-11T18:30:00.000Z",
  );
  expect(new Date(query.searchParams.get("to")!).toISOString()).toBe(
    "2026-10-14T18:30:00.000Z",
  );
});
test("all financial kinds are inspectable without refund or payout execution controls", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/dashboard/finance");
  for (const kind of ["INVOICES", "PAYMENTS", "REFUNDS", "PAYABLES"]) {
    await page.getByLabel("Record type", { exact: true }).selectOption(kind);
    await page.getByRole("button", { name: "Inspect record 20000000" }).click();
    await expect(
      page.getByRole("heading", { name: "Inspect financial record" }),
    ).toBeVisible();
    if (kind === "REFUNDS")
      await expect(
        page.getByText("Recorded reason: Synthetic refund reason"),
      ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /execute refund|pay out/i }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Close record inspection" }).click();
  }
});
test("server filters, exact record IDs and pagination keep all loaded records", async ({
  page,
}) => {
  const s = await mock(page, "paging");
  await page.goto("/dashboard/finance");
  await page.getByLabel("Exact record ID (optional)").fill("wrong");
  await page.getByRole("button", { name: "Apply record ID" }).click();
  await expect(
    page.locator(".finance-workspace").getByRole("alert"),
  ).toContainText("complete record UUID");
  await page.getByLabel("Exact record ID (optional)").fill("");
  await page.getByRole("button", { name: "Apply record ID" }).click();
  await page.getByLabel("Recorded status").selectOption("DUE");
  await expect
    .poll(() => s.reads.some((p) => p.includes("status=DUE")))
    .toBe(true);
  await page
    .getByRole("button", { name: "Load more financial records" })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect record 20000000" }),
  ).toHaveCount(2);
});
test("provider status query requires review and sandbox evidence never claims settlement", async ({
  page,
}) => {
  const s = await mock(page);
  await inspect(page);
  await review(page);
  expect(s.writes).toHaveLength(0);
  await expect(page.getByLabel("Record type", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm provider query" }).click();
  await expect(
    page.getByText(/Recorded query result: Local sandbox only/),
  ).toBeVisible();
  expect(s.writes[0].body).toEqual({
    expectedVersion: 2,
    reason: "Synthetic reviewed financial evidence",
  });
  await page.reload();
  await expect(
    page
      .getByText("Provider settlement is unverified", { exact: false })
      .first(),
  ).toBeVisible();
});
test("uncertain provider query retries the identical request and locks other decisions", async ({
  page,
}) => {
  const s = await mock(page, "unknown");
  await inspect(page);
  await review(page);
  await page.getByRole("button", { name: "Confirm provider query" }).click();
  await expect(page.getByLabel("Record type", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry identical provider query" })
    .click();
  await expect(
    page.getByText(/Recorded query result: Local sandbox only/),
  ).toBeVisible();
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("stale provider query preserves its reason and requires review of the new version", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await inspect(page);
  await review(page);
  await page.getByRole("button", { name: "Confirm provider query" }).click();
  await page
    .getByRole("button", { name: "Refresh for renewed review" })
    .click();
  await expect(page.getByLabel("Reason for provider query")).toHaveValue(
    "Synthetic reviewed financial evidence",
  );
  await page
    .getByRole("button", { name: "Review provider query", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I reviewed this order/ }).check();
  await page.getByRole("button", { name: "Confirm provider query" }).click();
  expect(s.writes[1].body.expectedVersion).toBe(3);
  expect(s.writes[1].key).not.toBe(s.writes[0].key);
});
test("saved query refresh failure blocks more writes until recovery", async ({
  page,
}) => {
  const s = await mock(page, "refresh");
  await inspect(page);
  await review(page);
  await page.getByRole("button", { name: "Confirm provider query" }).click();
  await expect(page.getByText(/Your decision was saved/)).toBeVisible();
  await expect(page.getByLabel("Record type", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Refresh for renewed review" })
    .click();
  await expect(page.getByLabel("Record type", { exact: true })).toBeEnabled();
  expect(s.writes).toHaveLength(1);
});
test("live provider paid response retains the recorded local state and does not claim repair", async ({
  page,
}) => {
  await mock(page, "live");
  await inspect(page);
  await review(page);
  await page.getByRole("button", { name: "Confirm provider query" }).click();
  await expect(
    page.getByText(
      /Recorded query result: paid. Local checkout status returned: created/,
    ),
  ).toBeVisible();
});
test("mobile finance review fits the screen with accessible controls and preserved padding", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await inspect(page);
  await review(page);
  expect(
    (await new AxeBuilder({ page }).include(".finance-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".finance-workspace").screenshot({
    path: "test-results/finance-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".finance-workspace").screenshot({
    path: "test-results/finance-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("real MFA staff reloads an isolated sandbox order and records one audited query", async ({
  page,
}) => {
  const env = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(env.DATABASE_URL);
  expect(env.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
  try {
    const session = await verifiedStaffSession(page.request);
    const request = await db.tuitionRequest.create({
      data: {
        guardianId: ids.guardian,
        childId: ids.child,
        subject: "Maths",
        mode: "HOME",
        language: "English",
        locality: "Shankar Nagar",
        budgetPaise: 400000,
        schedule: "Synthetic finance browser fixture",
      },
    });
    const placement = await db.placement.create({
      data: {
        requestId: request.id,
        guardianId: ids.guardian,
        childId: ids.child,
        teacherId: ids.teacher,
        monthlyPaise: 300000,
      },
    });
    const invoice = await db.invoice.create({
      data: {
        placementId: placement.id,
        payerId: ids.teacherAccount,
        amountPaise: 54321,
        policyVersion: "synthetic-finance-v1",
      },
    });
    const order = await db.checkoutOrder.create({
      data: {
        accountId: ids.teacherAccount,
        kind: "INVOICE",
        resourceId: invoice.id,
        amountPaise: 54321,
        providerMode: "SANDBOX",
        status: "CREATED",
      },
    });
    await page.goto("/dashboard/finance");
    await page
      .getByLabel("Record type", { exact: true })
      .selectOption("CHECKOUTS");
    await page.getByLabel("Exact record ID (optional)").fill(order.id);
    await page.getByRole("button", { name: "Apply record ID" }).click();
    await page
      .getByRole("button", { name: "Inspect record " + order.id.slice(0, 8) })
      .click();
    await review(page);
    await page.getByRole("button", { name: "Confirm provider query" }).click();
    await expect(
      page.getByText(/Recorded query result: Local sandbox only/),
    ).toBeVisible();
    expect(
      await db.audit.count({
        where: {
          actorId: session.account.id,
          action: "CHECKOUT_RECONCILED",
          aggregateId: order.id,
        },
      }),
    ).toBe(1);
    await page.reload();
    await page
      .getByLabel("Record type", { exact: true })
      .selectOption("CHECKOUTS");
    await page.getByLabel("Exact record ID (optional)").fill(order.id);
    await page.getByRole("button", { name: "Apply record ID" }).click();
    await page
      .getByRole("button", { name: "Inspect record " + order.id.slice(0, 8) })
      .click();
    await expect(page.locator(".finance-detail")).toContainText("₹543.21");
    expect(
      (await db.checkoutOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe("CREATED");
  } finally {
    await db.$disconnect();
  }
});

test("query drafts block record changes and can be explicitly discarded without a write", async ({
  page,
}) => {
  const s = await mock(page);
  await inspect(page);
  await page
    .getByLabel("Reason for provider query")
    .fill("Preserve this draft");
  await expect(page.getByLabel("Record type", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Recorded from (IST)")).toBeDisabled();
  await page
    .getByRole("button", { name: "Review provider query", exact: true })
    .click();
  await page.getByRole("button", { name: "Back to query reason" }).click();
  await expect(page.getByLabel("Reason for provider query")).toHaveValue(
    "Preserve this draft",
  );
  await page.getByRole("button", { name: "Discard query draft" }).click();
  await expect(page.getByLabel("Record type", { exact: true })).toBeEnabled();
  expect(s.writes).toHaveLength(0);
});
test("empty financial queues show an honest empty state", async ({ page }) => {
  await mock(page, "empty");
  await page.goto("/dashboard/finance");
  await expect(page.getByText("No records match these filters.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Inspect record / }),
  ).toHaveCount(0);
});
test("finance report and record read failures recover independently", async ({
  page,
}) => {
  const s = await mock(page, "readErrors");
  await page.goto("/dashboard/finance");
  await expect(
    page.getByRole("button", { name: "Retry finance totals" }),
  ).toBeVisible();
  s.releaseReport();
  await page.getByRole("button", { name: "Retry finance totals" }).click();
  await expect(
    page.getByText("Recorded captures", { exact: true }),
  ).toBeVisible();
  s.releaseQueue();
  await page.getByRole("button", { name: "Retry financial records" }).click();
  await expect(
    page.getByRole("button", { name: "Inspect record 20000000" }),
  ).toBeVisible();
});

test("Hindi complete interface — वित्त और मिलान", async ({ page }) => {
  await chooseHindi(page);
  await mock(page);
  await page.goto("/dashboard/finance");
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
});

test("failed finance queue reads hide cached record inspection and recover without a provider write", async ({
  page,
}) => {
  const s = await mock(page);
  await inspect(page);
  await expect(page.locator(".finance-detail")).toBeVisible();
  await page.route("**/api/v1/admin/finance/records?**", (route) =>
    route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Synthetic private backend detail" },
    }),
  );
  await page
    .getByRole("button", { name: "Refresh financial records", exact: true })
    .click();
  await expect(page.locator(".finance-detail")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Inspect record 20000000" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Synthetic private backend detail", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/admin/finance/records?**");
  await page
    .getByRole("button", { name: "Refresh record inspection", exact: true })
    .click();
  await expect(page.locator(".finance-detail")).toBeVisible();
  expect(s.writes).toHaveLength(0);
});
