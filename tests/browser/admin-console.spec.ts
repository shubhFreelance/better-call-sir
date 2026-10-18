import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const actor = "10000000-0000-4000-8000-000000000171",
  person = "10000000-0000-4000-8000-000000000172",
  privacyId = "20000000-0000-4000-8000-000000000171",
  jobId = "30000000-0000-4000-8000-000000000171",
  auditId = "40000000-0000-4000-8000-000000000171",
  child = "50000000-0000-4000-8000-000000000171",
  ledgerId = "60000000-0000-4000-8000-000000000171";
async function mock(page: Page, mode = "normal", role = "ADMIN") {
  const now = new Date().toISOString(),
    reads: string[] = [],
    writes: any[] = [],
    replays = new Map<string, any>();
  let stale = mode === "stale",
    fail = false;
  const flags: any[] = [
    { name: "revision", enabled: true, version: 2 },
    { name: "checkout", enabled: false, version: 1 },
    { name: "proCalls", enabled: false, version: 1 },
    { name: "ai", enabled: false, version: 1 },
  ];
  const p: any = {
    id: privacyId,
    accountId: mode === "self" ? actor : person,
    kind: mode === "deletion" ? "DELETION" : "CORRECTION",
    scope: mode === "deletion" ? "CHILD" : "NOTE",
    resourceId: child,
    reason: "Synthetic owner privacy request",
    correction: mode === "deletion" ? null : "Corrected synthetic note",
    status: "PENDING",
    resolution: null,
    policyVersion: null,
    version: 2,
    createdAt: now,
    updatedAt: now,
  };
  const account = {
      id: person,
      name: "Synthetic guardian",
      role: "GUARDIAN",
      region: "Raipur",
      verified: true,
      disabled: false,
    },
    job = {
      id: jobId,
      type: mode.startsWith("guardian-job:")
        ? mode.slice("guardian-job:".length)
        : "evidence.scan_requested",
      aggregateId: child,
      attempts: 5,
      createdAt: now,
    },
    marker = {
      id: ledgerId,
      privacyRequestId: privacyId,
      accountId: person,
      scope: "CHILD",
      resourceId: child,
      policyVersion: "synthetic-retention-v1",
      retentionReason: "Synthetic reviewed financial and safety retention",
      createdAt: now,
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
            name: "Administrator · synthetic",
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
      if (path.endsWith("/admin/console")) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { code: "UNAVAILABLE", message: "Console unavailable" },
          });
        }
        return route.fulfill({
          json: check("AdminConsole", {
            asOf: now,
            mode: "SYNTHETIC_DEVELOPMENT",
            flags,
            accounts: 2,
            pendingPrivacy: 1,
            supply: [
              { region: "Raipur", status: "SUBMITTED", count: 2 },
              { region: "Raipur", status: "APPROVED", count: 4 },
            ],
            supplyLimit: 50,
            commercial: {
              placementExamples: [
                { monthlyPaise: 100000, feePaise: 25000 },
                { monthlyPaise: 600000, feePaise: 150000 },
              ],
              revisionPrices: [
                { minutes: 20, amountPaise: 30000 },
                { minutes: 40, amountPaise: 60000 },
              ],
              currency: "INR",
              editable: false,
            },
            integrations: [
              { name: "Payments", mode: "SANDBOX" },
              { name: "Private meetings", mode: "SANDBOX" },
              { name: "Email OTP", mode: "DEVELOPMENT_ONLY" },
              { name: "Masked calls", mode: "DISABLED" },
            ],
            release: {
              authorized: false,
              status: "BLOCKED",
              providerQualification: "PENDING",
            },
            staffAdministration: "PENDING_INDEPENDENT_APPROVAL_WORKFLOW",
          }),
        });
      }
      if (path.endsWith("/admin/accounts"))
        return route.fulfill({
          json: check("AdminAccountList", {
            items: mode === "empty" ? [] : [account],
            nextCursor: null,
          }),
        });
      if (path.endsWith("/linkage"))
        return route.fulfill({
          json: check("AdminLinkage", {
            account,
            children: [
              {
                id: child,
                guardianId: person,
                studentAccountId: null,
                studentAccessRevokedAt: null,
                alias: "Aarav · synthetic",
                grade: 8,
                board: "CBSE",
              },
            ],
            teacher: null,
            limit: 50,
            editable: false,
          }),
        });
      if (path.endsWith("/admin/privacy-requests"))
        return route.fulfill({
          json: check("AdminPrivacyQueue", {
            items:
              mode === "empty" ||
              (url.searchParams.get("status") &&
                url.searchParams.get("status") !== p.status)
                ? []
                : [p],
            nextCursor: null,
          }),
        });
      if (path.endsWith("/admin/jobs"))
        return route.fulfill({
          json: check("JobQueue", {
            items:
              mode === "empty"
                ? []
                : [
                    job,
                    {
                      ...job,
                      id: "30000000-0000-4000-8000-000000000172",
                      type: "payment.captured",
                    },
                  ],
          }),
        });
      if (path.endsWith("/deletion-ledger"))
        return route.fulfill({
          json: check("DeletionLedger", {
            items: mode === "empty" ? [] : [marker],
            nextCursor: null,
          }),
        });
      if (path.endsWith("/admin/audit")) {
        const second = !!url.searchParams.get("cursor");
        return route.fulfill({
          json: check("AdminAuditList", {
            items:
              mode === "empty"
                ? []
                : [
                    {
                      id: second
                        ? "40000000-0000-4000-8000-000000000172"
                        : auditId,
                      action: "FEATURE_FLAG_CHANGED",
                      aggregateId: "revision",
                      reason: second
                        ? "Synthetic earlier reason"
                        : "Synthetic reviewed reason",
                      createdAt: now,
                    },
                  ],
            nextCursor: mode === "paging" && !second ? auditId : null,
          }),
        });
      }
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Missing fixture" },
      });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path, body, key });
    expect(key).toBeTruthy();
    if (replays.has(key))
      return route.fulfill({ status: 201, json: replays.get(key) });
    let value: any;
    if (path.includes("/flags/")) {
      check("FlagChangeInput", body);
      if (stale) {
        stale = false;
        flags[0].version = 3;
        return route.fulfill({
          status: 409,
          json: { code: "CONFLICT", message: "Flag changed" },
        });
      }
      flags[0].enabled = body.enabled;
      flags[0].version++;
      value = check("ConsoleFlag", { ...flags[0] });
    } else if (path.includes("/privacy-requests/")) {
      check("PrivacyReviewInput", body);
      p.status = body.action === "FULFIL" ? "COMPLETED" : "REJECTED";
      p.resolution = body.reason;
      p.policyVersion = body.policyVersion;
      p.version++;
      value = check("PrivacyRequest", { ...p });
    } else if (path.includes("/jobs/")) {
      check("JobRetryInput", body);
      job.attempts = 0;
      value = check("JobRetryResult", {
        id: job.id,
        status: "PENDING",
        attempts: 0,
      });
    } else {
      check("DeletionReplayInput", body);
      value = check("DeletionReplayResult", {
        status: "REPLAYED",
        deletionRecordId: ledgerId,
      });
    }
    replays.set(key, value);
    if (mode === "unknown" && writes.length === 1) return route.abort();
    if (mode === "refresh" && writes.length === 1) fail = true;
    return route.fulfill({ status: 201, json: value });
  });
  return { reads, writes };
}
async function choose(page: Page, tab: string) {
  await page.goto("/dashboard/admin");
  await page.getByRole("tab", { name: tab, exact: true }).click();
}
async function effects(page: Page) {
  await page
    .getByLabel("Reason for this decision")
    .fill("Synthetic independently reviewed decision");
  await page.getByRole("button", { name: "Review effects and reason" }).click();
  await page
    .getByRole("checkbox", { name: /I reviewed this evidence/ })
    .check();
}
test("administrator role and fresh MFA precede all console queries", async ({
  page,
}) => {
  const s = await mock(page, "normal", "FINANCE");
  await page.goto("/dashboard/admin");
  await expect(
    page.getByText("Administrator access is required for this console."),
  ).toBeVisible();
  expect(s.reads.some((p) => p.includes("/admin/"))).toBe(false);
  await page.unrouteAll();
  const m = await mock(page, "mfa");
  await page.goto("/dashboard/admin");
  await expect(
    page.getByLabel("Authenticator code", { exact: true }),
  ).toBeVisible();
  expect(m.reads.some((p) => p.includes("/admin/"))).toBe(false);
});
test("runtime status shows actual code prices, regional profile counts and blocked activation", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/dashboard/admin");
  await expect(page.getByText("20 minutes · ₹300.00")).toBeVisible();
  await expect(page.getByText(/Live release: blocked/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review enable checkout" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review enable ai" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Teacher screening & private evidence" }),
  ).toHaveAttribute("href", "/dashboard/review");
});
test("people role and exact ID filters inspect minimal supervised linkage", async ({
  page,
}) => {
  const s = await mock(page);
  await choose(page, "People & linkage");
  await page.getByLabel("Exact account ID (optional)").fill("bad");
  await page.getByRole("button", { name: "Apply account ID" }).click();
  await expect(
    page.locator(".admin-workspace").getByRole("alert"),
  ).toContainText("complete account UUID");
  await page.getByLabel("Exact account ID (optional)").fill(person);
  await page.getByRole("button", { name: "Apply account ID" }).click();
  await page.getByLabel("Account role").selectOption("GUARDIAN");
  await page.getByRole("button", { name: "Inspect linkage 10000000" }).click();
  await expect(
    page.getByText("Aarav · synthetic · Class 8, CBSE"),
  ).toBeVisible();
  expect(s.reads.some((p) => p.includes("role=GUARDIAN"))).toBe(true);
  await expect(
    page.getByRole("button", { name: /impersonate|grant role/i }),
  ).toHaveCount(0);
});
test("flag changes require effects review and an exact current version", async ({
  page,
}) => {
  const s = await mock(page);
  await page.goto("/dashboard/admin");
  await page.getByRole("button", { name: "Review pause revision" }).click();
  await effects(page);
  expect(s.writes).toHaveLength(0);
  await expect(
    page.getByRole("tab", { name: "People & linkage" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await expect(
    page.getByText("Reviewed decision recorded.", { exact: true }),
  ).toBeVisible();
  expect(s.writes[0].body).toEqual({
    enabled: false,
    expectedVersion: 2,
    reason: "Synthetic independently reviewed decision",
    confirmed: true,
  });
  await page.getByRole("button", { name: "Close recorded decision" }).click();
  await expect(
    page.getByRole("button", { name: "Review enable revision" }),
  ).toBeEnabled();
});
test("uncertain administrator decisions reuse their payload and key", async ({
  page,
}) => {
  const s = await mock(page, "unknown");
  await page.goto("/dashboard/admin");
  await page.getByRole("button", { name: "Review pause revision" }).click();
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await page
    .getByRole("button", { name: "Retry identical administrator decision" })
    .click();
  await expect(
    page.getByText("Reviewed decision recorded.", { exact: true }),
  ).toBeVisible();
  expect(s.writes[1]).toEqual(s.writes[0]);
});
test("stale administrator decisions preserve reasons for renewed review", async ({
  page,
}) => {
  const s = await mock(page, "stale");
  await page.goto("/dashboard/admin");
  await page.getByRole("button", { name: "Review pause revision" }).click();
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await page
    .getByRole("button", { name: "Refresh administrator review" })
    .click();
  await expect(page.getByLabel("Reason for this decision")).toHaveValue(
    "Synthetic independently reviewed decision",
  );
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  expect(s.writes[1].body.expectedVersion).toBe(3);
  expect(s.writes[1].key).not.toBe(s.writes[0].key);
});
test("saved flag refresh failures block another decision until recovery", async ({
  page,
}) => {
  const s = await mock(page, "refresh");
  await page.goto("/dashboard/admin");
  await page.getByRole("button", { name: "Review pause revision" }).click();
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await expect(page.getByText(/Your decision was saved/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close recorded decision" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Refresh administrator review" })
    .click();
  await page.getByRole("button", { name: "Close recorded decision" }).click();
  expect(s.writes).toHaveLength(1);
});
test("privacy correction review includes evidence, reviewed policy and completed status", async ({
  page,
}) => {
  const s = await mock(page);
  await choose(page, "Privacy review");
  await page
    .getByRole("button", { name: "Review privacy request 20000000" })
    .click();
  await expect(
    page.getByText("Proposed correction: Corrected synthetic note"),
  ).toBeVisible();
  await page.getByLabel("Privacy decision").selectOption("FULFIL");
  await page
    .getByLabel("Reviewed policy version")
    .fill("synthetic-reviewed-v1");
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await page.getByRole("button", { name: "Close recorded decision" }).click();
  await page.getByLabel("Privacy request status").selectOption("COMPLETED");
  await expect(
    page.getByText(
      /Recorded outcome: Synthetic independently reviewed decision/,
    ),
  ).toBeVisible();
  expect(s.writes[0].body.policyVersion).toBe("synthetic-reviewed-v1");
});
test("privacy deletion requires its retention exception before effects review", async ({
  page,
}) => {
  const s = await mock(page, "deletion");
  await choose(page, "Privacy review");
  await page
    .getByRole("button", { name: "Review privacy request 20000000" })
    .click();
  await page.getByLabel("Privacy decision").selectOption("FULFIL");
  await page
    .getByLabel("Reviewed policy version")
    .fill("synthetic-retention-v1");
  await page
    .getByLabel("Reason for this decision")
    .fill("Synthetic deletion assessment");
  await page.getByRole("button", { name: "Review effects and reason" }).click();
  await expect(
    page.locator(".admin-workspace").getByRole("alert"),
  ).toContainText("retention exception");
  await page
    .getByLabel("Approved retention exception")
    .fill("Synthetic financial and safety evidence retention");
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  expect(s.writes[0].body.retentionReason).toBe(
    "Synthetic financial and safety evidence retention",
  );
});
test("self privacy review is unavailable and rejection never promises consent restoration", async ({
  page,
}) => {
  await mock(page, "self");
  await choose(page, "Privacy review");
  await expect(
    page.getByRole("button", { name: "Review privacy request 20000000" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Another administrator must review your request."),
  ).toBeVisible();
});
test("private media retry excludes money jobs and records a queued outcome", async ({
  page,
}) => {
  const s = await mock(page);
  await choose(page, "Recovery & backups");
  await expect(
    page.getByRole("button", { name: "Review retry 30000000" }).last(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Review retry 30000000" })
    .first()
    .click();
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await expect(
    page.getByText("Retry queued; worker processing is not confirmed."),
  ).toBeVisible();
  expect(s.writes[0].body.expectedAttempts).toBe(5);
});
for (const type of [
  "guardian-evidence.scan_requested",
  "privacy.guardian_evidence_delete_requested",
]) {
  test(`guardian private media recovery reviews and queues ${type}`, async ({
    page,
  }) => {
    const s = await mock(page, `guardian-job:${type}`);
    await choose(page, "Recovery & backups");
    await expect(
      page.getByRole("button", { name: "Review retry 30000000" }).last(),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Review retry 30000000" })
      .first()
      .click();
    await effects(page);
    await page
      .getByRole("button", { name: "Confirm reviewed decision" })
      .click();
    await expect(
      page.getByText("Retry queued; worker processing is not confirmed."),
    ).toBeVisible();
    expect(s.writes).toHaveLength(1);
    expect(s.writes[0].body.expectedAttempts).toBe(5);
  });
}
test("deletion replay requires a verified restore reference and records only application handling", async ({
  page,
}) => {
  const s = await mock(page);
  await choose(page, "Recovery & backups");
  await page.getByRole("button", { name: "Review replay 60000000" }).click();
  await page
    .getByLabel("Verified restore reference")
    .fill("synthetic-restore-drill-1");
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await expect(
    page.getByText(/Application deletion replay recorded/),
  ).toBeVisible();
  expect(s.writes[0].body.restoreReference).toBe("synthetic-restore-drill-1");
});
test("audit action filters and earlier pages preserve immutable evidence", async ({
  page,
}) => {
  const s = await mock(page, "paging");
  await choose(page, "Audit history");
  await page
    .getByLabel("Exact audit action (optional)")
    .fill("FEATURE_FLAG_CHANGED");
  await page.getByRole("button", { name: "Apply audit action" }).click();
  await page
    .getByRole("button", { name: "Load earlier audit records" })
    .click();
  await expect(page.getByText("Synthetic earlier reason")).toBeVisible();
  expect(s.reads.some((p) => p.includes("action=FEATURE_FLAG_CHANGED"))).toBe(
    true,
  );
});
test("empty private queues give useful empty states", async ({ page }) => {
  await mock(page, "empty");
  await choose(page, "Privacy review");
  await expect(
    page.getByText("No privacy requests in this status."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Recovery & backups" }).click();
  await expect(
    page.getByText("No recovery jobs in this filter."),
  ).toBeVisible();
  await expect(page.getByText("No deletion markers recorded.")).toBeVisible();
});
test("console and privacy review fit mobile with accessible controls and screenshots", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dashboard/admin");
  await expect(
    page.getByRole("heading", { name: "Feature controls", exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".admin-workspace").analyze())
      .violations,
  ).toEqual([]);
  const tabs = await page.getByRole("tablist").boundingBox(),
    last = await page.getByRole("tab", { name: "Audit history" }).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(tabs!.y + tabs!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".admin-workspace").screenshot({
    path: "test-results/admin-console-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".admin-workspace").screenshot({
    path: "test-results/admin-console-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.getByRole("tab", { name: "Privacy review" }).click();
  await page
    .getByRole("button", { name: "Review privacy request 20000000" })
    .click();
  await page.getByLabel("Privacy decision").selectOption("FULFIL");
  await page
    .getByLabel("Reviewed policy version")
    .fill("synthetic-reviewed-v1");
  await effects(page);
  await page.locator(".care-editor").screenshot({
    path: "test-results/admin-privacy-review-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    (await new AxeBuilder({ page }).include(".admin-workspace").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".care-editor").screenshot({
    path: "test-results/admin-privacy-review-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
});
test("real MFA administrator fulfils an isolated correction and reads its persisted audit", async ({
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
    const session = await verifiedStaffSession(page.request),
      owner = await db.account.create({
        data: {
          name: "Synthetic privacy owner " + randomUUID().slice(0, 8),
          verified: true,
        },
      }),
      request = await db.privacyRequest.create({
        data: {
          accountId: owner.id,
          kind: "CORRECTION",
          scope: "ACCOUNT",
          resourceId: owner.id,
          reason: "Synthetic admin browser correction",
          correction: "Corrected synthetic owner",
        },
      });
    await choose(page, "Privacy review");
    await page
      .getByRole("button", {
        name: "Review privacy request " + request.id.slice(0, 8),
      })
      .click();
    await page.getByLabel("Privacy decision").selectOption("FULFIL");
    await page
      .getByLabel("Reviewed policy version")
      .fill("synthetic-reviewed-v1");
    await effects(page);
    await page
      .getByRole("button", { name: "Confirm reviewed decision" })
      .click();
    await expect(
      page.getByText("Reviewed decision recorded.", { exact: true }),
    ).toBeVisible();
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: owner.id } })).name,
    ).toBe("Corrected synthetic owner");
    expect(
      (await db.privacyRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .status,
    ).toBe("COMPLETED");
    expect(
      await db.audit.count({
        where: {
          actorId: session.account.id,
          action: "PRIVACY_REQUEST_REVIEWED",
          aggregateId: request.id,
        },
      }),
    ).toBe(1);
    await page.getByRole("button", { name: "Close recorded decision" }).click();
    await page.getByRole("tab", { name: "Audit history" }).click();
    await page
      .getByLabel("Exact audit action (optional)")
      .fill("PRIVACY_REQUEST_REVIEWED");
    await page.getByRole("button", { name: "Apply audit action" }).click();
    await expect(page.locator(".admin-audit")).toContainText(request.id);
  } finally {
    await db.$disconnect();
  }
});

test("privacy rejection records a reason without promising restored consent", async ({
  page,
}) => {
  const s = await mock(page);
  await choose(page, "Privacy review");
  await page
    .getByRole("button", { name: "Review privacy request 20000000" })
    .click();
  await page.getByLabel("Privacy decision").selectOption("REJECT");
  await page
    .getByLabel("Reviewed policy version")
    .fill("synthetic-reviewed-v1");
  await effects(page);
  await page.getByRole("button", { name: "Confirm reviewed decision" }).click();
  await page.getByRole("button", { name: "Close recorded decision" }).click();
  await page.getByLabel("Privacy request status").selectOption("REJECTED");
  await expect(
    page.getByText(
      /Recorded outcome: Synthetic independently reviewed decision/,
    ),
  ).toBeVisible();
  expect(s.writes[0].body.action).toBe("REJECT");
  await expect(
    page.getByRole("button", { name: /restore consent|restore approval/i }),
  ).toHaveCount(0);
});

test("Hindi complete interface — प्रशासक नियंत्रण और ऑडिट", async ({
  page,
}) => {
  await chooseHindi(page);
  await mock(page);
  await page.goto("/dashboard/admin");
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
});
