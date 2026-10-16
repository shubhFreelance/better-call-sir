import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { validator, operationValidator } from "../helpers/contract";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.use({ trace: "off" });
test.afterAll(cleanupStaffFixtures);
const accountId = "10000000-0000-4000-8000-000000000981",
  id = "90000000-0000-4000-8000-000000000981";
const ctx = {
  profileVersion: 1,
  educationScope: { stage: "SCHOOL", grade: 8, board: "CBSE" },
  subjects: ["Maths", "Science"],
  region: "Raipur",
  gate: "READY",
};
const row = {
  id,
  matchStatus: "PENDING",
  matchRunId: null,
  selectedCandidateId: null,
  rematchFromArrangementId: null,
  discoveryMethod: "ASSISTED",
  preferredTeacherId: null,
  educationScope: ctx.educationScope,
  profileVersion: 1,
  subject: "Maths",
  mode: "ONLINE",
  language: "English",
  locality: "Shankar Nagar",
  budgetPaise: 300000,
  preferences: {
    timezone: "Asia/Kolkata",
    weekly: [{ weekday: 1, startMinute: 960, endMinute: 1200 }],
  },
  region: "Raipur",
  status: "SUBMITTED",
  version: 1,
  createdAt: "2026-10-16T00:00:00.000Z",
};
async function fixture(page: Page) {
  const headers = { Origin: "http://localhost:3000" },
    email = "enquiry-ui-" + crypto.randomUUID() + "@example.test";
  const challenge = await page.request.post("/api/v1/auth/otp/request", {
    headers,
    data: { email },
  });
  expect(challenge.status()).toBe(201);
  const auth = await page.request.post("/api/v1/auth/otp/verify", {
    headers,
    data: {
      email,
      name: "Synthetic enquiry owner",
      code: (await challenge.json()).developmentCode,
    },
  });
  expect(auth.status()).toBe(201);
  const session = await auth.json();
  const signup = await page.request.post("/api/v1/independent-student/signup", {
    headers: {
      ...headers,
      "X-CSRF-Token": session.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      education: {
        stage: "SCHOOL",
        institutionName: "Private synthetic school",
        subjects: ["Maths", "Science"],
        grade: 8,
        board: "CBSE",
      },
      managementPreference: "SELF_DIRECTED",
      adultDeclaration: true,
      consentAccepted: true,
      policyVersion: "independent-student-development-v1",
    },
  });
  expect(signup.status()).toBe(201);
  return session;
}
async function mock(page: Page, mode = "normal") {
  let record: any = null,
    first = true,
    fail = mode === "read-error";
  const bodies: any[] = [],
    keys: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: accountId,
            name: "Synthetic student",
            role: "INDEPENDENT_STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/independent-student/enquiry-context")) {
      if (fail) {
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic read failure" },
        });
      }
      return route.fulfill({
        json: { ...ctx, gate: mode === "privacy" ? "PRIVACY_PAUSED" : "READY" },
      });
    }
    if (path.endsWith("/student-enquiries") && req.method() === "POST") {
      const body = req.postDataJSON();
      expect(validator("StudentEnquiryInput")(body)).toBe(true);
      bodies.push(body);
      keys.push(req.headers()["idempotency-key"]);
      record = { ...row, ...body };
      delete record.confirmed;
      delete record.expectedProfileVersion;
      if (mode === "retry" && first) {
        first = false;
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic lost result" },
        });
      }
      return route.fulfill({ status: 201, json: row });
    }
    if (path.endsWith("/student-enquiries"))
      return route.fulfill({
        json: { items: record ? [row] : [], nextCursor: null },
      });
    if (path.endsWith("/shortlist"))
      return route.fulfill({
        json: {
          id,
          version: 1,
          matchStatus: "PENDING",
          runId: null,
          selectedCandidateId: null,
          items: [],
        },
      });
    if (path.endsWith("/student-enquiries/" + id))
      return route.fulfill({ json: row });
    if (path.includes("/teachers/"))
      return route.fulfill({
        status: 404,
        json: { code: "NOT_FOUND", message: "Synthetic unavailable teacher" },
      });
    return route.fulfill({
      status: 403,
      json: { code: "FORBIDDEN", message: "Unexpected private request" },
    });
  });
  return {
    bodies,
    keys,
    recover: () => {
      fail = false;
    },
  };
}
async function fill(page: Page) {
  await page
    .getByLabel("Subject you need help with", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Teaching format", { exact: true })
    .selectOption("ONLINE");
  await page
    .getByLabel("Teaching language", { exact: true })
    .selectOption("English");
  await page.getByLabel("Your locality", { exact: true }).fill("Shankar Nagar");
  await page.getByLabel("Monthly budget (₹)", { exact: true }).fill("3000");
  await page.getByLabel("Preferred day 1", { exact: true }).selectOption("1");
}
test("real student enquiry can be reviewed, submitted, resumed and withdrawn without a guardian or class booking", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/dashboard/enquiries?new=1");
  await fill(page);
  await page
    .getByRole("button", { name: "Review enquiry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your enquiry", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Send my enquiry", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Private synthetic school", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/student-enquiry-review-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", {
      name: "I reviewed my education and enquiry criteria",
      exact: false,
    })
    .check();
  const posted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/student-enquiries") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send my enquiry", exact: true })
    .click();
  const result = await (await posted).json();
  expect(operationValidator("/student-enquiries", "post", "201")(result)).toBe(
    true,
  );
  await expect(page).toHaveURL(/\/dashboard\/enquiries\?enquiry=/);
  await expect(
    page.locator(".student-enquiry-detail .student-enquiry-status"),
  ).toHaveText("Received · awaiting staff review");
  await page.reload();
  await expect(page.locator(".student-enquiry-detail")).toContainText("Maths");
  await page
    .getByRole("button", { name: "Withdraw enquiry", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm withdrawal", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I want to withdraw this enquiry.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Confirm withdrawal", exact: true })
    .click();
  await expect(
    page.locator(".student-enquiry-detail .student-enquiry-status"),
  ).toHaveText("Withdrawn");
  const auth = await (await page.request.get("/api/v1/auth/session")).json();
  expect(auth.account.role).toBe("INDEPENDENT_STUDENT");
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k !== "bcs.interface-language"),
    ),
  ).toEqual([]);
});
test("mobile enquiry validation and uncertain saves preserve the exact reviewed criteria", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mock(page, "retry");
  await page.goto("/dashboard/enquiries?new=1");
  await page
    .getByRole("button", { name: "Review enquiry", exact: true })
    .click();
  await expect(
    page.getByLabel("Subject you need help with", { exact: true }),
  ).toBeFocused();
  await fill(page);
  await page.screenshot({
    path: "test-results/student-enquiry-criteria-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Review enquiry", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit criteria", exact: true })
    .click();
  await expect(
    page.getByLabel("Monthly budget (₹)", { exact: true }),
  ).toHaveValue("3000");
  await page
    .getByRole("button", { name: "Review enquiry", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed my education and enquiry criteria",
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "Send my enquiry", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same decision", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit criteria", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry same decision", exact: true })
    .click();
  await expect(page).toHaveURL(/\?enquiry=/);
  expect(state.bodies).toHaveLength(2);
  expect(state.bodies[1]).toEqual(state.bodies[0]);
  expect(state.keys[1]).toBe(state.keys[0]);
});
test("failed context, privacy pause and unavailable teacher links never submit an enquiry", async ({
  page,
}) => {
  const state = await mock(page, "read-error");
  await page.goto("/dashboard/enquiries?new=1");
  await expect(
    page.getByText("We couldn’t load your current education details.", {
      exact: false,
    }),
  ).toBeVisible();
  state.recover();
  await page
    .getByRole("button", { name: "Retry education details", exact: true })
    .click();
  await expect(
    page.getByLabel("Subject you need help with", { exact: true }),
  ).toBeEnabled();
  await page.goto(
    "/dashboard/enquiries?new=1&teacher=" + id + "&profile=missing-teacher",
  );
  await expect(
    page.getByText("The selected teacher could not be confirmed.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Subject you need help with", { exact: true }),
  ).toBeDisabled();
  expect(state.bodies).toEqual([]);
  await page.unrouteAll();
  const paused = await mock(page, "privacy");
  await page.goto("/dashboard/enquiries?new=1");
  await expect(
    page.getByText("New enquiries are paused", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Subject you need help with", { exact: true }),
  ).toBeDisabled();
  expect(paused.bodies).toEqual([]);
});
test("real MFA staff queue can read independent criteria without receiving institution or account identity", async ({
  page,
}) => {
  const owner = await fixture(page);
  const created = await page.request.post("/api/v1/student-enquiries", {
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": owner.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      expectedProfileVersion: 1,
      discoveryMethod: "ASSISTED",
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      locality: "Shankar Nagar",
      budgetPaise: 300000,
      preferences: row.preferences,
      confirmed: true,
    },
  });
  expect(created.status()).toBe(201);
  const result = await created.json();
  await verifiedStaffSession(page.request);
  await page.goto("/dashboard/student-enquiries?enquiry=" + result.id);
  await expect(
    page.getByRole("heading", {
      name: "Independent student enquiries",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".student-enquiry-detail")).toContainText("Maths");
  await expect(
    page.getByRole("button", { name: "Withdraw enquiry", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Private synthetic school", { exact: true }),
  ).toHaveCount(0);
  const detail = await (
    await page.request.get("/api/v1/student-enquiries/" + result.id)
  ).json();
  for (const key of [
    "studentAccountId",
    "email",
    "institutionName",
    "guardianId",
  ])
    expect(detail).not.toHaveProperty(key);
});
