import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ids } from "../../packages/test-fixtures/src";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const actor = "10000000-0000-4000-8000-000000000191";
async function mock(page: Page, mode = "normal", role = "ADMIN") {
  const reads: string[] = [];
  let fail = mode === "errors";
  const check = (name: string, v: any) => {
    const fn = validator(name);
    expect(fn(v), JSON.stringify(fn.errors)).toBe(true);
    return v;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    expect(req.method()).toBe("GET");
    const now = new Date().toISOString();
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Reports · synthetic staff",
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
    reads.push(path + url.search);
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
    if (path.endsWith("/reports/regions"))
      return route.fulfill({
        json: check("ReportRegions", {
          items:
            role === "OPERATOR"
              ? [{ region: "Raipur" }]
              : [{ region: "Raipur" }, { region: "Delhi" }],
          limited: false,
          scope: role === "OPERATOR" ? "REGION" : "GLOBAL",
        }),
      });
    if (fail && path.includes("/reports/"))
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "Recorded report unavailable" },
      });
    const window = {
      from: new Date(url.searchParams.get("from")!).toISOString(),
      to: new Date(url.searchParams.get("to")!).toISOString(),
      timezone: "Asia/Kolkata",
      metricVersion: "operations-v1",
    };
    if (path.endsWith("/reports/funnel")) {
      const zero = {
          mature: 0,
          observed: 0,
          continued: 0,
          stopped: 0,
          unknown: 0,
          missingObservation: 0,
          immature: 0,
          missingStartEvidence: 0,
          unobserved: 0,
          denominator: 0,
          rate: null,
        },
        manual = {
          mature: 4,
          observed: 2,
          continued: 1,
          stopped: 1,
          unknown: 1,
          missingObservation: 1,
          immature: 1,
          missingStartEvidence: 0,
          unobserved: 2,
          denominator: 2,
          rate: 0.5,
        },
        assisted = {
          mature: 4,
          observed: 2,
          continued: 2,
          stopped: 0,
          unknown: 1,
          missingObservation: 1,
          immature: 2,
          missingStartEvidence: 1,
          unobserved: 2,
          denominator: 2,
          rate: 1,
        };
      return route.fulfill({
        json: check("FunnelReport", {
          window,
          region:
            role === "OPERATOR" ? "Raipur" : url.searchParams.get("region"),
          items:
            mode === "empty"
              ? []
              : [
                  {
                    discoveryMethod: "MANUAL",
                    requests: 10,
                    published: 8,
                    shown: 6,
                    teacherAccepted: 5,
                    demoCompleted: 4,
                    started: 5,
                    conversion: { numerator: 5, denominator: 10 },
                  },
                  {
                    discoveryMethod: "ASSISTED",
                    requests: 8,
                    published: 7,
                    shown: 5,
                    teacherAccepted: 4,
                    demoCompleted: 3,
                    started: 6,
                    conversion: { numerator: 6, denominator: 8 },
                  },
                ],
          continuation:
            mode === "empty"
              ? zero
              : {
                  mature: 8,
                  observed: 4,
                  continued: 3,
                  stopped: 1,
                  unknown: 2,
                  missingObservation: 2,
                  immature: 3,
                  missingStartEvidence: 1,
                  unobserved: 4,
                  denominator: 4,
                  rate: 0.75,
                },
          continuationByMethod:
            mode === "empty"
              ? []
              : [
                  { discoveryMethod: "MANUAL", ...manual },
                  { discoveryMethod: "ASSISTED", ...assisted },
                ],
          definitionVersion: "funnel-v2",
          cohortBasis: "REQUEST_CREATED_AT",
          outcomeBasis: "CURRENT_RECORDED_EVIDENCE",
          asOf: now,
        }),
      });
    }
    if (path.endsWith("/reports/finance"))
      return route.fulfill({
        json: check("FinanceReport", {
          window,
          currency: "INR",
          captured: {
            count: mode === "empty" ? 0 : 6,
            amountPaise: mode === "empty" ? 0 : 19845,
          },
          pendingRefunds: { count: 1, amountPaise: 1000 },
          outstandingInvoices: {
            count: 3,
            amountPaise: 55000,
            basis: "CURRENT_ALL_TIME",
          },
          teacherPayables: [
            { status: "ELIGIBLE", count: 2, amountPaise: 10000 },
            { status: "HELD_DISPUTE", count: 1, amountPaise: 5000 },
          ],
          ...(mode === "legacy"
            ? {}
            : {
                captureModes:
                  mode === "empty"
                    ? []
                    : [
                        { providerMode: "LIVE", count: 2, amountPaise: 12345 },
                        {
                          providerMode: "SANDBOX",
                          count: 3,
                          amountPaise: 5000,
                        },
                        {
                          providerMode: "UNRECORDED",
                          count: 1,
                          amountPaise: 2500,
                        },
                      ],
              }),
          providerSettlementVerified: false,
          asOf: now,
        }),
      });
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Missing report fixture" },
    });
  });
  return {
    reads,
    release: () => {
      fail = false;
    },
  };
}
async function open(page: Page) {
  await page.goto("/dashboard/reports");
  await expect(
    page.getByRole("heading", {
      name: "Choose the reporting dates",
      exact: true,
    }),
  ).toBeVisible();
}
test("reporting requires a permitted staff role and fresh MFA before queries", async ({
  page,
}) => {
  const s = await mock(page, "normal", "STUDENT");
  await page.goto("/dashboard/reports");
  await expect(
    page.getByText("Staff reporting access is required to view these reports."),
  ).toBeVisible();
  expect(s.reads.some((p) => p.includes("/reports/"))).toBe(false);
  await page.unrouteAll();
  const m = await mock(page, "mfa");
  await page.goto("/dashboard/reports");
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeVisible();
  expect(m.reads.some((p) => p.includes("/reports/"))).toBe(false);
});
test("manual and assisted counts use request denominators without implying ordered stages", async ({
  page,
}) => {
  await mock(page);
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Day-30 continuation evidence" }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded start conversion: 5 / 10 (50%)."),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded start conversion: 6 / 8 (75%)."),
  ).toBeVisible();
  const manual = page.getByRole("table", {
    name: "Manual search recorded milestones",
  });
  await expect(
    manual.getByRole("row", { name: /Demo completion/ }),
  ).toContainText("4 / 10");
  await expect(
    manual.getByRole("row", { name: /Recorded starts/ }),
  ).toContainText("5 / 10");
});
test("mature known-outcome rates show coverage and preserve unknown, missing and immature counts", async ({
  page,
}) => {
  await mock(page);
  await open(page);
  const all = page
    .locator(".reports-continuation")
    .filter({
      has: page.getByRole("heading", { name: "All search paths", exact: true }),
    });
  await expect(all).toContainText("3 continued / 4 known mature outcomes");
  await expect(all).toContainText("4 / 8 mature starts (50%)");
  await expect(all.locator("dl")).toContainText("Unknown outcome2");
  await expect(all.locator("dl")).toContainText(
    "Missing qualified observation2",
  );
  await expect(all.locator("dl")).toContainText("Not yet mature3");
});
test("zero cohorts show unestimable rates rather than fabricated zero percentages", async ({
  page,
}) => {
  await mock(page, "empty");
  await open(page);
  await expect(
    page.getByText(
      "No requests were recorded in this cohort. Conversion is not estimable.",
    ),
  ).toBeVisible();
  await expect(page.locator(".reports-rate")).toHaveText("Not estimable");
  await expect(
    page.getByRole("table", { name: "Manual search recorded milestones" }),
  ).toHaveCount(0);
});
test("custom IST dates are applied explicitly with an exclusive next-day boundary", async ({
  page,
}) => {
  const s = await mock(page);
  await open(page);
  const before = s.reads.filter((p) => p.includes("/funnel")).length;
  await page.getByLabel("Report from (IST)").fill("2026-10-12");
  await page.getByLabel("Report through (IST)").fill("2026-10-11");
  await page.getByRole("button", { name: "Apply report dates" }).click();
  await expect(
    page.locator(".reports-workspace").getByRole("alert"),
  ).toContainText("ordered date range");
  expect(s.reads.filter((p) => p.includes("/funnel")).length).toBe(before);
  await page.getByLabel("Report through (IST)").fill("2026-10-14");
  await page.getByRole("button", { name: "Apply report dates" }).click();
  await expect
    .poll(() => s.reads.some((p) => p.includes("from=2026-10-12")))
    .toBe(true);
  const q = new URL(
    s.reads.filter((p) => p.includes("from=2026-10-12")).at(-1)!,
    "http://localhost",
  );
  expect(new Date(q.searchParams.get("to")!).toISOString()).toBe(
    "2026-10-14T18:30:00.000Z",
  );
});
test("previous calendar month is an IST calendar preset and does not fetch before apply", async ({
  page,
}) => {
  const s = await mock(page);
  await open(page);
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
    first = new Date(today.slice(0, 7) + "-01T00:00:00Z"),
    from = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1),
    )
      .toISOString()
      .slice(0, 10),
    to = new Date(first.getTime() - 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Date preset").selectOption("PREVIOUS");
  await expect(page.getByLabel("Report from (IST)")).toHaveValue(from);
  await expect(page.getByLabel("Report through (IST)")).toHaveValue(to);
  await page.getByRole("button", { name: "Apply report dates" }).click();
  await expect
    .poll(() => s.reads.some((p) => p.includes("from=" + from)))
    .toBe(true);
});
test("admin region choices persist across finance view changes", async ({
  page,
}) => {
  const s = await mock(page);
  await open(page);
  await page.getByLabel("Request region").selectOption("Delhi");
  await expect(page.getByText(/Shown scope: Delhi/)).toBeVisible();
  await page.getByRole("tab", { name: "Capture & obligations" }).click();
  await page.getByRole("tab", { name: "Search & continuation" }).click();
  await expect(page.getByLabel("Request region")).toHaveValue("Delhi");
  expect(s.reads.some((p) => p.includes("region=Delhi"))).toBe(true);
});
test("operators cannot query finance or choose a foreign region", async ({
  page,
}) => {
  const s = await mock(page, "normal", "OPERATOR");
  await open(page);
  await expect(
    page.getByText(/Assigned reporting region: Raipur/),
  ).toBeVisible();
  await expect(page.getByLabel("Request region")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Capture & obligations" }),
  ).toHaveCount(0);
  expect(s.reads.some((p) => p.includes("/finance"))).toBe(false);
});
test("finance staff see classified captures and separate obligations without learner reports", async ({
  page,
}) => {
  const s = await mock(page, "normal", "FINANCE");
  await open(page);
  await expect(
    page.getByText("6 recorded captures · settlement unverified."),
  ).toBeVisible();
  const modes = page.getByRole("table", {
    name: "Provider-mode capture records",
  });
  await expect(modes.getByRole("row", { name: /Live mode/ })).toContainText(
    "₹123.45",
  );
  await expect(modes.getByRole("row", { name: /Sandbox mode/ })).toContainText(
    "₹50.00",
  );
  await expect(
    modes.getByRole("row", { name: /Mode unrecorded/ }),
  ).toContainText("₹25.00");
  await expect(
    page.getByText("3 invoices · current across all dates"),
  ).toBeVisible();
  expect(
    s.reads.some((p) => p.includes("/funnel") || p.includes("/regions")),
  ).toBe(false);
});
test("legacy finance metadata is not silently classified as live or sandbox", async ({
  page,
}) => {
  await mock(page, "legacy", "FINANCE");
  await open(page);
  await expect(
    page.getByText(/Provider-mode classification is unavailable/),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Provider-mode capture records" }),
  ).toHaveCount(0);
});
test("report read failures retry without showing stale or invented totals", async ({
  page,
}) => {
  const s = await mock(page, "errors");
  await open(page);
  await expect(
    page.getByRole("button", { name: "Retry request cohorts" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Day-30 continuation evidence" }),
  ).toHaveCount(0);
  s.release();
  await page.getByRole("button", { name: "Retry request cohorts" }).click();
  await expect(
    page.getByText("Recorded start conversion: 5 / 10 (50%)."),
  ).toBeVisible();
});
test("charts expose keyboard tooltips and exact data tables", async ({
  page,
}) => {
  await mock(page);
  await open(page);
  await expect(
    page.getByRole("table", { name: "Manual search recorded milestones" }),
  ).toBeVisible();
  const chart = page
    .locator('[data-slot="chart"] [role="application"]')
    .first();
  await chart.focus();
  await chart.press("ArrowRight");
  await expect(page.locator(".reports-tooltip")).toBeVisible();
  await expect(page.locator(".reports-tooltip")).toContainText("Manual search");
});
test("mobile reports preserve padding, chart/table readability and accessible contrast", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page);
  const strip=page.getByRole("tablist");await expect(strip).toHaveCSS("background-color","rgb(238, 245, 243)");
  await expect(strip.getByRole("tab",{selected:true})).toHaveCSS("background-color","rgb(240, 215, 255)");
  expect(await strip.evaluate(el=>Math.abs(el.getBoundingClientRect().width-el.parentElement!.getBoundingClientRect().width))).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("heading", { name: "Day-30 continuation evidence" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".reports-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".reports-workspace")
    .screenshot({
      path: "test-results/reports-service-mobile.png",
      style: "nextjs-portal{display:none!important}",
    });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .locator(".reports-workspace")
    .screenshot({
      path: "test-results/reports-service-desktop.png",
      style: "nextjs-portal{display:none!important}",
    });
  await page.getByRole("tab", { name: "Capture & obligations" }).click();
  await expect(
    page.getByRole("table", { name: "Provider-mode capture records" }),
  ).toBeVisible();
  await page
    .locator(".reports-workspace")
    .screenshot({
      path: "test-results/reports-finance-desktop.png",
      style: "nextjs-portal{display:none!important}",
    });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    (await new AxeBuilder({ page }).include(".reports-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".reports-workspace")
    .screenshot({
      path: "test-results/reports-finance-mobile.png",
      style: "nextjs-portal{display:none!important}",
    });
});
test("real MFA staff reads isolated historical request cohorts and exact date boundaries", async ({
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
    await db.tuitionRequest.create({
      data: {
        guardianId: ids.guardian,
        childId: ids.child,
        subject: "Maths",
        mode: "HOME",
        language: "English",
        locality: "Shankar Nagar",
        budgetPaise: 400000,
        schedule: "Synthetic reporting browser cohort",
        createdAt: new Date("2001-01-01T12:00:00Z"),
      },
    });
    await open(page);
    await page.getByLabel("Report from (IST)").fill("2001-01-01");
    await page.getByLabel("Report through (IST)").fill("2001-01-01");
    await page.getByRole("button", { name: "Apply report dates" }).click();
    const query = await page.request.get(
      "/api/v1/admin/reports/funnel?from=2000-12-31T18%3A30%3A00.000Z&to=2001-01-01T18%3A30%3A00.000Z",
    );
    expect(query.status()).toBe(200);
    const data = await query.json();
    expect(validator("FunnelReport")(data)).toBe(true);
    const assisted = data.items.find(
      (r: any) => r.discoveryMethod === "ASSISTED",
    );
    await expect(
      page.getByText(
        `${assisted.requests} requests form this path's denominator.`,
      ),
    ).toBeVisible();
    expect(
      await db.audit.count({
        where: { actorId: session.account.id, action: "FUNNEL_REPORT_READ" },
      }),
    ).toBeGreaterThan(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Choose the reporting dates" }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

 test("Hindi complete interface — रिपोर्ट और चार्ट", async ({ page }) => {
 await chooseHindi(page);
 await mock(page);
 await page.goto("/dashboard/reports");
 await checkHindi(page);
 await page.setViewportSize({ width: 360, height: 800 });
 await checkHindi(page);
 });
