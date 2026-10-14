import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator } from "../helpers/contract";
import { ids } from "../../packages/test-fixtures/src";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.use({ trace: "off" });
test.afterEach(async () => cleanupStaffFixtures());
const requestId = "40000000-0000-4000-8000-000000000231",
  otherRequest = "40000000-0000-4000-8000-000000000232",
  candidateId = "50000000-0000-4000-8000-000000000231";
async function mock(page: Page, role = "GUARDIAN", mode = "normal") {
  const reads: string[] = [],
    writes: { key: string | null; body: any }[] = [];
  let fail = mode === "error",
    response = "PENDING",
    unknown = mode === "unknown",
    stale = mode === "stale",
    version = 1;
  let termVersion = 1,
    guardianAccepted =
      !mode.startsWith("terms-") &&
      !["withdrawn", "paused", "unverified"].includes(mode),
    teacherAccepted = false;
  const acceptedKeys = new Map<string, unknown>();
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname,
      now = new Date().toISOString();
    reads.push(path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id:
              role === "TEACHER"
                ? ids.teacherAccount
                : role === "STUDENT"
                  ? ids.student
                  : ids.guardian,
            name: "Synthetic " + role.toLowerCase(),
            role,
            verified: mode !== "unverified",
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
    if (path.endsWith("/dashboard/hiring")) {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic unavailable" },
        });
      if (mode === "expired-page" && u.searchParams.has("cursor"))
        return route.fulfill({
          status: 404,
          json: { code: "NOT_FOUND", message: "Synthetic removed page cursor" },
        });
      const section = u.searchParams.get("section") || "ENQUIRIES";
      const enquiry = {
        id: u.searchParams.has("cursor") ? otherRequest : requestId,
        subject: u.searchParams.has("cursor") ? "Science" : "Maths",
        mode: "HOME",
        language: "English",
        locality: "Shankar Nagar",
        discoveryMethod: "ASSISTED",
        status: "OPEN",
        matchStatus: "MATCHED",
        scheduleStatus: "CONFIRMED",
        createdAt: now,
        learner: {
          alias: role === "TEACHER" ? null : "Mira",
          grade: 8,
          board: "CBSE",
        },
        hasSelection: false,
        ...(role === "GUARDIAN" ? { budgetPaise: 300000 } : {}),
        ...(role === "TEACHER"
          ? {
              candidate: {
                id: candidateId,
                version,
                response,
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                selected: false,
                eligible: true,
              },
            }
          : {}),
      };
      const result = {
        role,
        asOf: now,
        definitionVersion: "hiring-v1",
        section,
        counts: {
          enquiries:
            mode === "pages" || role === "ADMIN" ? 2 : mode === "empty" ? 0 : 1,
          openEnquiries:
            mode === "pages" || role === "ADMIN" ? 2 : mode === "empty" ? 0 : 1,
          pendingResponses: response === "PENDING" ? 1 : 0,
          termsPending: 1,
          activeArrangements: 0,
        },
        enquiries:
          role !== "ADMIN" && section === "ENQUIRIES" && mode !== "empty"
            ? [enquiry]
            : [],
        arrangements:
          role !== "ADMIN" && section === "ARRANGEMENTS" && mode !== "empty"
            ? [
                {
                  id: ids.placement,
                  subject: "Maths",
                  mode: "HOME",
                  status: mode === "terms-closed" ? "CLOSED" : "TERMS_PENDING",
                  guardianAccepted,
                  teacherAccepted,
                  guardianStarted: false,
                  teacherReceiptConfirmed: false,
                  learner: { alias: "Mira", grade: 8, board: "CBSE" },
                  teacher: {
                    id: ids.teacher,
                    name: "Synthetic reviewed teacher",
                    status: "APPROVED",
                  },
                  ...(role !== "STUDENT"
                    ? {
                        monthlyPaise: 300029,
                        ...(mode !== "terms-missing"
                          ? {
                              version: termVersion,
                              policyVersion: "development-v1",
                              placementFeePaise: 75007,
                            }
                          : {}),
                      }
                    : {}),
                },
              ]
            : [],
        learners: ["GUARDIAN", "STUDENT"].includes(role)
          ? [{ id: ids.child, alias: "Mira", grade: 8, board: "CBSE" }]
          : [],
        learnersLimited: false,
        nextCursor:
          ["pages", "expired-page"].includes(mode) &&
          !u.searchParams.has("cursor")
            ? requestId
            : null,
        ...(role === "GUARDIAN"
          ? {
              gate: {
                verified: mode !== "unverified",
                consent: mode !== "withdrawn",
                privacyPaused: mode === "paused",
              },
            }
          : {}),
        ...(role === "TEACHER"
          ? {
              profile:
                mode === "empty"
                  ? null
                  : {
                      id: ids.teacher,
                      name: "Synthetic reviewed teacher",
                      status: "APPROVED",
                      subjects: ["Maths"],
                      screeningComplete: true,
                      screeningValidUntil: new Date(
                        Date.now() + 86400000,
                      ).toISOString(),
                      feeTermsAccepted: true,
                    },
            }
          : {}),
        ...(role === "ADMIN"
          ? {
              operations: {
                requests: [
                  { status: "OPEN", matchStatus: "PENDING", count: 2 },
                ],
                teachers: [
                  { status: "SUBMITTED", count: 3 },
                  { status: "APPROVED", count: 4 },
                ],
                arrangements: [{ status: "TERMS_PENDING", count: 1 }],
                openSupport: 2,
                pendingPrivacy: 1,
                failedJobs: 0,
              },
            }
          : {}),
      };
      const check = validator("HiringDashboard");
      expect(check(result), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ json: result });
    }
    if (path === `/api/v1/placements/${ids.placement}/acceptances`) {
      expect(req.method()).toBe("POST");
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      const key = req.headers()["idempotency-key"],
        body = req.postDataJSON();
      writes.push({ key, body });
      if (acceptedKeys.has(key))
        return route.fulfill({ status: 201, json: acceptedKeys.get(key) });
      if (mode === "terms-stale" && termVersion === 1) {
        termVersion = 2;
        return route.fulfill({
          status: 409,
          json: { code: "CONFLICT", message: "Synthetic stale hiring terms" },
        });
      }
      expect(body).toEqual({
        expectedVersion: termVersion,
        action: "ACCEPT_TERMS",
      });
      if (role === "GUARDIAN") guardianAccepted = true;
      else teacherAccepted = true;
      termVersion++;
      const result = {
        id: ids.placement,
        version: termVersion,
        guardianAccepted,
        teacherAccepted,
      };
      acceptedKeys.set(key, result);
      if (mode === "terms-saved-refresh") fail = true;
      if (
        mode === "terms-unknown" &&
        acceptedKeys.size === 1 &&
        writes.length === 1
      )
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable hiring result",
        });
      return route.fulfill({ status: 201, json: result });
    }
    if (path.endsWith("/responses")) {
      expect(req.method()).toBe("POST");
      expect(req.headers()["x-csrf-token"]).toBe("synthetic-csrf");
      writes.push({
        key: req.headers()["idempotency-key"],
        body: req.postDataJSON(),
      });
      if (stale) {
        stale = false;
        version = 2;
        return route.fulfill({
          status: 409,
          json: { code: "CONFLICT", message: "Synthetic stale opportunity" },
        });
      }
      response = req.postDataJSON().response;
      version = mode === "stale" ? 3 : 2;
      if (mode === "saved-refresh") fail = true;
      if (unknown) {
        unknown = false;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"broken":',
        });
      }
      return route.fulfill({ json: { id: candidateId, response, version } });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "No synthetic route" },
    });
  });
  return {
    reads,
    writes,
    fail: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
  };
}
const ready = (page: Page) =>
  expect(page.getByRole("button", { name: "Refresh overview" })).toBeVisible();
test("guardian gets enquiry details, next actions and learner controls without primary class tools", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard");
  await ready(page);
  await expect(
    page.getByRole("article", { name: "Maths enquiry for Mira" }),
  ).toContainText("Monthly budget");
  await expect(
    page.getByRole("link", { name: "Open enquiry & teacher options" }),
  ).toHaveAttribute("href", `/dashboard/requests?request=${requestId}`);
  await expect(
    page.getByRole("link", { name: "Manage Mira’s access" }),
  ).toHaveAttribute("href", `/dashboard/family?learner=${ids.child}`);
  await expect(
    page.getByRole("navigation", { name: "Dashboard" }),
  ).not.toContainText("Revision bookings");
  await expect(
    page.getByRole("navigation", { name: "Dashboard" }),
  ).not.toContainText("Classes & attendance");
  expect(state.reads).not.toContain("/api/v1/dashboard");
  expect(state.reads).not.toContain("/api/v1/dashboard/learning");
});
test("student can explore and see their own enquiry and teacher while purchases and family writes remain absent", async ({
  page,
}) => {
  const state = await mock(page, "STUDENT");
  await page.goto("/dashboard");
  await ready(page);
  await expect(
    page.getByRole("link", { name: "New tuition enquiry" }),
  ).toHaveCount(0);
  await expect(page.getByText("Monthly budget", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "Your teacher", exact: true }).click();
  await expect(
    page.getByRole("article", {
      name: "Maths arrangement with Synthetic reviewed teacher",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded monthly terms", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Review arrangement terms" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Manage Mira|Review your privacy/ }),
  ).toHaveCount(0);
  expect(
    state.reads.some((p) => /finance|notes|dashboard\/learning/.test(p)),
  ).toBe(false);
});
test("guardian verification, consent and privacy pause each give a precise recovery action", async ({
  page,
}) => {
  for (const mode of ["unverified", "withdrawn", "paused"]) {
    await page.unroute("**/api/v1/**");
    await mock(page, "GUARDIAN", mode);
    await page.goto("/dashboard");
    await ready(page);
    await expect(
      page.getByRole("link", { name: "New tuition enquiry" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name:
          mode === "paused"
            ? "Review privacy request"
            : "Review guardian onboarding",
      }),
    ).toBeVisible();
  }
});
test("teacher application evidence and reviewed opportunity response require acknowledgement and preserve exact body", async ({
  page,
}) => {
  const state = await mock(page, "TEACHER");
  await page.goto("/dashboard");
  await ready(page);
  await expect(
    page.getByText("Recorded and current", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review opportunity response" })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm opportunity response" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Teaching arrangements" }),
  ).toBeDisabled();
  await page.getByLabel("I understand and confirm this response.").check();
  await page
    .getByRole("button", { name: "Confirm opportunity response" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "opportunity response was recorded" }),
  ).toBeVisible();
  expect(state.writes[0].body).toEqual({
    response: "ACCEPTED",
    expectedVersion: 1,
  });
  await expect(
    page.getByRole("button", { name: "Review opportunity response" }),
  ).toBeDisabled();
});
test("uncertain teacher response freezes editing and retries the identical key and body", async ({
  page,
}) => {
  const state = await mock(page, "TEACHER", "unknown");
  await page.goto("/dashboard");
  await ready(page);
  await page
    .getByRole("button", { name: "Review opportunity response" })
    .click();
  await page
    .getByLabel("Your response", { exact: true })
    .selectOption("DECLINED");
  await page.getByLabel("I understand and confirm this response.").check();
  await page
    .getByRole("button", { name: "Confirm opportunity response" })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Your response", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel review" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same decision" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "opportunity response was recorded" }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
});
test("superadmin has aggregate screening, matching, arrangements and governance drill-downs", async ({
  page,
}) => {
  const state = await mock(page, "ADMIN");
  await page.goto("/dashboard");
  await ready(page);
  for (const name of [
    "Review matching",
    "Review teacher evidence",
    "Privacy, people, controls & audit",
    "Inspect financial records",
  ])
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    page.getByText("Pending privacy requests", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Mira", { exact: true })).toHaveCount(0);
  expect(state.reads.filter((p) => p.includes("admin/accounts"))).toEqual([]);
});
test("pagination keeps full totals and resets when switching to arrangements", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "pages");
  await page.goto("/dashboard");
  await ready(page);
  await page.getByRole("button", { name: "Next records" }).click();
  await expect(
    page.getByRole("article", { name: "Science enquiry for Mira" }),
  ).toBeVisible();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Teaching arrangements" }).click();
  await expect(
    page.getByRole("article", {
      name: "Maths arrangement with Synthetic reviewed teacher",
    }),
  ).toBeVisible();
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  expect(state.reads.some((p) => p.endsWith("/dashboard/hiring"))).toBe(true);
});
test("unavailable and failed refresh states remain distinct from empty enquiries", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "error");
  await page.goto("/dashboard");
  await expect(
    page.locator(".hiring-overview").getByRole("alert"),
  ).toContainText("not an empty enquiry list");
  state.recover();
  await page.getByRole("button", { name: "Retry hiring overview" }).click();
  await ready(page);
  state.fail();
  await page.getByRole("button", { name: "Refresh overview" }).click();
  await expect(
    page.locator(".hiring-overview").getByRole("alert"),
  ).toContainText("last successful read");
  await expect(
    page.getByRole("article", { name: "Maths enquiry for Mira" }),
  ).toBeVisible();
});
test("profileless teacher has an actionable application empty state", async ({
  page,
}) => {
  await mock(page, "TEACHER", "empty");
  await page.goto("/dashboard");
  await ready(page);
  await expect(
    page.getByText("No teaching application yet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No current assigned enquiries" }),
  ).toBeVisible();
});
test("all four hiring dashboards have accessible mobile layouts and inspected screenshot artifacts", async ({
  page,
}) => {
  for (const role of ["GUARDIAN", "STUDENT", "TEACHER", "ADMIN"]) {
    await page.unroute("**/api/v1/**");
    await mock(page, role);
    await page.setViewportSize({ width: 1365, height: 950 });
    await page.goto("/dashboard");
    await ready(page);
    await expect(
      page.getByRole("heading", {
        name:
          role === "TEACHER"
            ? "Your teaching application"
            : role === "ADMIN"
              ? "Teacher screening"
              : role === "STUDENT"
                ? "Your learner profile"
                : "Your learners",
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/hiring-${role.toLowerCase()}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 360, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const r = await new AxeBuilder({ page }).analyze();
    expect(
      r.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/hiring-${role.toLowerCase()}-mobile.png`,
      fullPage: true,
    });
  }
});
test("real guardian, student, teacher and MFA admin read scoped hiring data", async ({
  page,
}) => {
  for (const id of [ids.guardian, ids.student, ids.teacherAccount]) {
    const r = await page.request.post("/api/v1/dev/session", {
      data: { accountId: id },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(r.status()).toBe(201);
    await page.goto("/dashboard");
    await ready(page);
    const body = await (
        await page.request.get("/api/v1/dashboard/hiring")
      ).json(),
      check = validator("HiringDashboard");
    expect(check(body), JSON.stringify(check.errors)).toBe(true);
  }
  await verifiedStaffSession(page.request);
  await page.goto("/dashboard");
  await ready(page);
  await expect(
    page.getByRole("link", { name: "Review matching", exact: true }),
  ).toBeVisible();
});
test("assisted discovery is a primary route and navigation selects its tab on the existing catalog page", async ({
  page,
}) => {
  await page.goto("/teachers");
  await page
    .getByRole("link", { name: "Let us search for you", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: /Let us search for you/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Explore revision sessions/ }),
  ).toHaveCount(0);
});

test("stale teacher response requires a refreshed version and a renewed acknowledgement", async ({
  page,
}) => {
  const state = await mock(page, "TEACHER", "stale");
  await page.goto("/dashboard");
  await ready(page);
  await page
    .getByRole("button", { name: "Review opportunity response" })
    .click();
  await page.getByLabel("I understand and confirm this response.").check();
  await page
    .getByRole("button", { name: "Confirm opportunity response" })
    .click();
  await expect(
    page.getByRole("button", { name: "Reload current enquiries" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload current enquiries" }).click();
  await expect(
    page.getByLabel("I understand and confirm this response."),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Confirm opportunity response" }),
  ).toBeDisabled();
  await page.getByLabel("I understand and confirm this response.").check();
  await page
    .getByRole("button", { name: "Confirm opportunity response" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "opportunity response was recorded" }),
  ).toBeVisible();
  expect(state.writes.map((w) => w.body.expectedVersion)).toEqual([1, 2]);
  expect(state.writes[0].key).not.toBe(state.writes[1].key);
});
test("saved teacher response followed by failed refresh blocks another write until recovery", async ({
  page,
}) => {
  const state = await mock(page, "TEACHER", "saved-refresh");
  await page.goto("/dashboard");
  await ready(page);
  await page
    .getByRole("button", { name: "Review opportunity response" })
    .click();
  await page.getByLabel("I understand and confirm this response.").check();
  await page
    .getByRole("button", { name: "Confirm opportunity response" })
    .click();
  await expect(
    page
      .locator(".hiring-overview")
      .getByRole("alert")
      .filter({ hasText: "decision was saved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review opportunity response" }),
  ).toBeDisabled();
  state.recover();
  await page.getByRole("button", { name: "Reload current enquiries" }).click();
  await expect(
    page.getByRole("button", { name: "Reload current enquiries" }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Review opportunity response" }),
  ).toBeDisabled();
});

test("an expired scoped page can return to the first page without retrying a foreign cursor", async ({
  page,
}) => {
  await mock(page, "TEACHER", "expired-page");
  await page.goto("/dashboard");
  await ready(page);
  await page.getByRole("button", { name: "Next records" }).click();
  await expect(
    page.locator(".hiring-overview").getByRole("alert"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to first page" }).click();
  await ready(page);
  await expect(
    page.getByRole("article", { name: "Maths enquiry" }),
  ).toBeVisible();
});

async function openTerms(page: Page) {
  await page.goto("/dashboard");
  await page
    .getByRole("tab", { name: "Teaching arrangements", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review hiring terms", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review hiring terms", exact: true }),
  ).toBeFocused();
}
const termsAck = (page: Page) =>
  page.getByRole("checkbox", {
    name: /reviewed the monthly tuition and policy/,
  });

test("teacher confirms hiring terms from the primary dashboard without classes or financial execution", async ({
  page,
}) => {
  const state = await mock(page, "TEACHER");
  await openTerms(page);
  const review = page.getByRole("region", { name: "Hiring terms review" });
  await expect(review.getByText("₹3,000.29", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept hiring terms", exact: true }),
  ).toBeDisabled();
  await termsAck(page).check();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await review.screenshot({
    path: "test-results/hiring-terms-desktop.png",
    style: "nextjs-portal{display:none!important}",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await review.screenshot({
    path: "test-results/hiring-terms-mobile.png",
    style: "nextjs-portal{display:none!important}",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const findings = await new AxeBuilder({ page }).analyze();
  expect(
    findings.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Accept hiring terms", exact: true })
    .click();
  await expect(
    page.getByText("Hiring terms confirmed", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({
    expectedVersion: 1,
    action: "ACCEPT_TERMS",
  });
  expect(
    state.reads.some(
      (p) =>
        p.includes("/schedules") ||
        p.includes("/demos") ||
        p.includes("/invoices") ||
        p === "/api/v1/dashboard",
    ),
  ).toBe(false);
});

test("guardian accepts hiring terms and waits for the teacher; student never gets financial or acceptance controls", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "terms-first");
  await openTerms(page);
  await termsAck(page).check();
  await page
    .getByRole("button", { name: "Accept hiring terms", exact: true })
    .click();
  await expect(
    page.getByText(/Your acceptance is recorded\. Waiting for the other party/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  await page.unrouteAll();
  await mock(page, "STUDENT");
  await page.reload();
  await page.getByRole("tab", { name: "Your teacher", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review hiring terms", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Recorded monthly terms", { exact: true }),
  ).toHaveCount(0);
});

for (const mode of ["terms-missing", "terms-closed", "withdrawn", "paused"])
  test(`hiring acceptance stays unavailable for ${mode}`, async ({ page }) => {
    await mock(page, "GUARDIAN", mode);
    await openTerms(page);
    if (mode === "terms-closed")
      await expect(
        page.getByRole("button", { name: "Accept hiring terms", exact: true }),
      ).toHaveCount(0);
    else if (await termsAck(page).isVisible()) {
      await termsAck(page).check();
      await expect(
        page.getByRole("button", { name: "Accept hiring terms", exact: true }),
      ).toBeDisabled();
    } else
      await expect(
        page.getByText(/Your acceptance is already recorded/),
      ).toBeVisible();
  });

test("uncertain hiring acceptance freezes controls and retries the identical body and key", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "terms-unknown");
  await openTerms(page);
  await termsAck(page).check();
  await page
    .getByRole("button", { name: "Accept hiring terms", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Close terms review", exact: true }),
  ).toBeDisabled();
  await expect(termsAck(page)).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same decision", exact: true })
    .click();
  await expect(
    page.getByText(/Your hiring-term acceptance was recorded/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
});

test("stale hiring terms refresh current version and require renewed acknowledgement", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "terms-stale");
  await openTerms(page);
  await termsAck(page).check();
  await page
    .getByRole("button", { name: "Accept hiring terms", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reload current hiring terms", exact: true })
    .click();
  await expect(termsAck(page)).not.toBeChecked();
  await termsAck(page).check();
  await page
    .getByRole("button", { name: "Accept hiring terms", exact: true })
    .click();
  expect(state.writes.map((w) => w.body.expectedVersion)).toEqual([1, 2]);
});

test("saved hiring acceptance with a failed refresh prevents a duplicate write", async ({
  page,
}) => {
  const state = await mock(page, "GUARDIAN", "terms-saved-refresh");
  await openTerms(page);
  await termsAck(page).check();
  await page
    .getByRole("button", { name: "Accept hiring terms", exact: true })
    .click();
  await expect(
    page.getByText(/saved, but current details could not be loaded/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review hiring terms", exact: true }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});
