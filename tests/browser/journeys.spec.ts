import { test, expect } from "@playwright/test";
import {
  beginGuardian,
  existingLearner,
  reviewGuardian,
  submitGuardian,
} from "./guardian-journey";
import AxeBuilder from "@axe-core/playwright";
import { ids } from "../../packages/test-fixtures/src";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.afterEach(async () => cleanupStaffFixtures());
async function login(page: import("@playwright/test").Page, name: string) {
  if (name === "Operator") {
    await verifiedStaffSession(page.request);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Hello, Operator/ }),
    ).toBeVisible();
    return;
  }
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Hello, ${name.split(" ")[0]}`),
    }),
  ).toBeVisible();
}
test("public discovery, filters and teacher profile work against the real API", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A little guidance. A world of possibilities.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Meet all teachers" }).click();
  await expect(page.getByText("4 teachers to get to know")).toBeVisible();
  await expect(page.getByText("Demo available", { exact: true })).toHaveCount(
    2,
  );
  await page.getByRole("textbox", { name: "Search teachers" }).fill("Arjun");
  await expect(page.getByText("1 teachers to get to know")).toBeVisible();
  await expect(page.getByText("Demo available", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("textbox", { name: "Search teachers" }).fill("Ananya");
  await expect(page.getByText("1 teachers to get to know")).toBeVisible();
  await page.getByRole("link", { name: "Ananya Sharma", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ananya Sharma", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Recurring tuition is paid directly"),
  ).toBeVisible();
  await expect(
    page.getByText("Demo available · optional before hiring", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/teacher-demo-profile-desktop.png",
    fullPage: true,
  });
});
test("parent intake persists and appears on the private dashboard", async ({
  page,
}) => {
  await login(page, "Kavita");
  await page.goto("/onboarding/parent");
  await beginGuardian(page);
  await existingLearner(page);
  await reviewGuardian(page);
  const id = await submitGuardian(page);
  const request = await page.request.get(`/api/v1/requests/${id}`);
  expect((await request.json()).discoveryMethod).toBe("ASSISTED");
  await page.goto("/dashboard/requests");
  await expect(
    page.getByText(/Tuesday and Thursday after 5pm/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Your shortlist is awaiting review/).first(),
  ).toBeVisible();
});
test("discovery tabs support keyboard navigation and preserve manual teacher choice", async ({
  page,
}) => {
  await page.goto("/teachers");
  const manual = page.getByRole("tab", { name: /^Search Browse/ });
  const assisted = page.getByRole("tab", { name: /^Let us search for you/ });
  await manual.focus();
  await page.keyboard.press("ArrowRight");
  await expect(assisted).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("link", { name: "Share your criteria" }),
  ).toHaveAttribute("href", "/onboarding/parent?discovery=ASSISTED");
  await page.keyboard.press("ArrowLeft");
  await expect(manual).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Board", { exact: true }).selectOption("CBSE");
  await page.getByLabel("Class", { exact: true }).selectOption("8");
  await page.getByLabel("Maximum monthly tuition").selectOption("3000");
  await expect(page.getByText("3 teachers to get to know")).toBeVisible();
  await page
    .getByLabel("Locality", { exact: true })
    .selectOption("Shankar Nagar");
  await expect(page.getByText("1 teachers to get to know")).toBeVisible();
  await page.getByRole("link", { name: "Ananya Sharma", exact: true }).click();
  await page.getByRole("link", { name: "Enquire about this teacher" }).click();
  await expect(page).toHaveURL(/\/onboarding\/parent\?teacher=/);
  const teacherId = new URL(page.url()).searchParams.get("teacher");
  expect(teacherId).toBeTruthy();
  await page.getByRole("link", { name: "Sign in with email" }).click();
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: /Kavita/ }).click();
  await expect(
    page.getByText("Your chosen teacher", { exact: true }),
  ).toBeVisible();
  await beginGuardian(page);
  await existingLearner(page);
  await reviewGuardian(page, "Monday and Wednesday after 5pm");
  const id = await submitGuardian(page);
  const request = await page.request.get(`/api/v1/requests/${id}`);
  expect(await request.json()).toMatchObject({
    discoveryMethod: "MANUAL",
    preferredTeacherId: teacherId,
    budgetPaise: 300000,
  });
});
test("chosen teacher capabilities prefill the guardian request", async ({
  page,
}) => {
  await login(page, "Kavita");
  await page.goto("/teachers/arjun-deshmukh");
  await page.getByRole("link", { name: "Enquire about this teacher" }).click();
  await beginGuardian(page);
  await existingLearner(page);
  await expect(
    page.getByRole("combobox", { name: "Subject", exact: true }),
  ).toHaveValue("Science");
  await expect(page.getByLabel("Lesson format")).toHaveValue("ONLINE");
  await expect(page.getByLabel("Monthly tuition budget (₹)")).toHaveValue(
    "2800",
  );
});
test("student principal has own classes and no parent finance navigation", async ({
  page,
}) => {
  await login(page, "Aarav");
  await expect(
    page.getByRole("link", { name: "Parent Pro", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard/lessons");
  await expect(
    page.getByRole("heading", { name: "Every class, accounted for." }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Attendance & records" }).click();
  await expect(
    page.getByRole("heading", { name: "Maths with Ananya Sharma" }).first(),
  ).toBeVisible();
});
test("role switch and logout clear private pages", async ({ page }) => {
  await login(page, "Kavita");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Sign in to continue." }),
  ).toBeVisible();
  await login(page, "Ananya");
  await expect(
    page.getByRole("heading", { name: "Your teaching application" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Private notes", exact: true }),
  ).toHaveCount(0);
});
test("admin console reads real queues and failed provider controls stay explicit", async ({
  page,
}) => {
  await login(page, "Operator");
  await page
    .getByRole("navigation", { name: "Dashboard" })
    .getByRole("link", { name: "Control console", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A thoughtful control room." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feature controls" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Current live adapters remain unqualified/),
  ).toBeVisible();
  await expect(page.getByText(/Live release: blocked/)).toBeVisible();
});
test("360px layout has no overflow and labelled keyboard-accessible forms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("link", { name: "Find a teacher", exact: true })
    .first()
    .click();
  await expect(page.getByText("4 teachers to get to know")).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await login(page, "Kavita");
  await page.goto("/onboarding/parent");
  await beginGuardian(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Learner alias")).toBeVisible();
  await page.screenshot({
    path: "test-results/parent-onboarding-mobile.png",
    fullPage: true,
  });
});
test("public discovery has no serious or critical axe accessibility findings", async ({
  page,
}) => {
  await page.goto("/teachers");
  await expect(page.getByText("4 teachers to get to know")).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});
test("homepage screenshot and server-rendered catalog contain real API profiles", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(await response.text()).toContain("Ananya Sharma");
  const catalog = await request.get("/teachers");
  expect(await catalog.text()).toContain("Ananya Sharma");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ananya Sharma" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
});

test("guardian arranges and reschedules a demo; no-show reaches operator review", async ({
  page,
  playwright,
}) => {
  const { randomUUID } = await import("node:crypto");
  const operator = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
  });
  const teacher = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
  });
  const post = async (
    client: import("@playwright/test").APIRequestContext,
    path: string,
    body: unknown,
    csrf = "",
  ) => {
    const response = await client.post("/api/v1" + path, {
      data: body,
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Token": csrf,
        "Idempotency-Key": randomUUID(),
      },
    });
    const data = await response.json();
    expect(response.status(), JSON.stringify(data)).toBe(201);
    return data;
  };
  try {
    const op = await verifiedStaffSession(operator);
    const t = await post(teacher, "/dev/session", {
      accountId: ids.teacherAccount,
    });
    await login(page, "Kavita");
    const session = await (
      await page.request.get("/api/v1/auth/session")
    ).json();
    const schedule = "Browser demo " + randomUUID();
    const preferenceStart = new Date();
    preferenceStart.setUTCDate(preferenceStart.getUTCDate() + 44);
    preferenceStart.setUTCHours(6, 0, 0, 0);
    const request = await post(
      page.request,
      "/requests",
      {
        childId: ids.child,
        alias: "Aarav",
        grade: 8,
        board: "CBSE",
        subject: "Maths",
        mode: "HOME",
        language: "English",
        locality: "Shankar Nagar",
        budgetPaise: 400000,
        schedule,
        preferences: {
          timezone: "Asia/Kolkata",
          slots: [
            {
              startsAt: preferenceStart.toISOString(),
              endsAt: new Date(
                preferenceStart.getTime() + 3600000,
              ).toISOString(),
            },
          ],
        },
      },
      session.csrfToken,
    );
    const recommendations = await post(
      operator,
      `/admin/requests/${request.id}/recommendations`,
      { expectedVersion: 1 },
      op.csrfToken,
    );
    const candidate = recommendations.items.find(
      (x: { teacherId: string }) => x.teacherId === ids.teacher,
    );
    await post(
      teacher,
      `/candidates/${candidate.id}/responses`,
      { response: "ACCEPTED", expectedVersion: candidate.version },
      t.csrfToken,
    );
    await post(
      operator,
      `/admin/requests/${request.id}/presentations`,
      {
        expectedVersion: recommendations.requestVersion,
        runId: recommendations.runId,
        candidateIds: [candidate.id],
        reason: "Synthetic operator shortlist review",
      },
      op.csrfToken,
    );
    await page.goto("/dashboard/requests");
    const panel = page.locator(".panel").filter({ hasText: schedule });
    await panel
      .getByRole("button", { name: "Select teacher", exact: true })
      .click();
    await panel
      .getByRole("checkbox", {
        name: /I understand this records my teacher choice/,
      })
      .check();
    await panel.getByRole("button", { name: "Confirm teacher choice" }).click();
    await expect(
      panel.getByText(
        "Teacher choice saved. This does not assign a teacher or start tuition.",
      ),
    ).toBeVisible();
    const selected = await (
      await page.request.get(`/api/v1/requests/${request.id}`)
    ).json();
    expect(selected.selectedCandidateId).toBe(candidate.id);
    expect(selected.status).toBe("OPEN");
    await panel
      .getByRole("button", { name: "Choose & arrange optional demo" })
      .click();
    const slot = new Date();
    slot.setUTCDate(slot.getUTCDate() + 40);
    slot.setUTCHours(11, Date.now() % 50, 0, 0);
    const ist = slot.toISOString().slice(0, 16);
    await panel.getByLabel("Demo start (IST)").fill(ist);
    await panel
      .getByRole("button", { name: "Propose demo", exact: true })
      .click();
    await expect(
      panel.getByRole("link", { name: /Review demo/ }),
    ).toBeVisible();
    await panel.getByRole("link", { name: /Review demo/ }).click();
    const demos = await (await page.request.get("/api/v1/demos")).json();
    let demo = demos.items.find(
      (d: { requestId: string }) => d.requestId === request.id,
    );
    const card = page.locator(`[data-demo-id="${demo.id}"]`);
    await card.getByRole("button", { name: "Accept demo time" }).click();
    await expect(
      card.getByText(/Guardian accepted · Teacher pending/),
    ).toBeVisible();
    demo = (await (await page.request.get("/api/v1/demos")).json()).items.find(
      (d: { id: string }) => d.id === demo.id,
    );
    await post(
      teacher,
      `/demos/${demo.id}/acceptances`,
      { expectedVersion: demo.version },
      t.csrfToken,
    );
    await page.reload();
    await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
    await card
      .getByRole("button", { name: "Reschedule demo", exact: true })
      .click();
    slot.setUTCDate(slot.getUTCDate() + 1);
    await card
      .getByLabel("Demo start (IST)")
      .fill(slot.toISOString().slice(0, 16));
    await card
      .getByLabel("Reason for rescheduling")
      .fill("Guardian schedule changed");
    await card.getByRole("button", { name: "Propose new demo time" }).click();
    await expect(
      card.getByText(/Guardian pending · Teacher pending/),
    ).toBeVisible();
    await card.getByRole("button", { name: "Accept demo time" }).click();
    await expect(
      card.getByText(/Guardian accepted · Teacher pending/),
    ).toBeVisible();
    demo = (await (await page.request.get("/api/v1/demos")).json()).items.find(
      (d: { id: string }) => d.id === demo.id,
    );
    await post(
      teacher,
      `/demos/${demo.id}/acceptances`,
      { expectedVersion: demo.version },
      t.csrfToken,
    );
    await page.reload();
    await expect(card.getByText("confirmed", { exact: true })).toBeVisible();
    await card.screenshot({ path: "test-results/demo-confirmed.png" });
    // Move only this synthetic test's confirmed slot into the past to exercise the outcome UI.
    const { Pool } = await import("pg");
    const { readFileSync } = await import("node:fs");
    const { parseEnv } = await import("node:util");
    const connectionString = parseEnv(
      readFileSync(".env", "utf8"),
    ).DATABASE_URL;
    expect(["localhost", "127.0.0.1"]).toContain(
      new URL(connectionString).hostname,
    );
    const db = new Pool({ connectionString });
    try {
      await db.query(
        'UPDATE "Reservation" SET "startsAt"=NOW()-INTERVAL \'2 hours\', "endsAt"=NOW()-INTERVAL \'1 hour\' WHERE id=$1 AND kind=\'DEMO\' AND "guardianId"=$2',
        [demo.reservationId, ids.guardian],
      );
    } finally {
      await db.end();
    }
    await page.reload();
    await card.getByLabel("Demo outcome").selectOption("NO_SHOW");
    await card
      .getByLabel("Outcome details")
      .fill("Teacher did not attend this synthetic demo");
    await card.getByRole("button", { name: "Record demo outcome" }).click();
    await expect(card.getByText(/awaiting operator review/)).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, "Operator");
    await page.goto("/dashboard/support");
    await page.getByRole("tab", { name: "Demo disputes", exact: true }).click();
    const queued = page.locator(`[data-dispute-id="${demo.id}"]`);
    await expect(queued).toBeVisible();
    await queued.click();
    await expect(
      page.getByRole("heading", { name: "Linked case evidence", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Reviewed outcome", { exact: true })
      .selectOption("NOT_COMPLETED");
    await page
      .getByLabel("Evidence and reason for resolution")
      .fill(
        "Reviewed guardian report and synthetic teacher evidence: no demo took place",
      );
    await page
      .getByRole("button", { name: "Review dispute outcome", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /I reviewed the participant evidence/ })
      .check();
    await page
      .getByRole("button", { name: "Confirm dispute resolution", exact: true })
      .click();
    await expect(
      page.getByText(/Dispute outcome recorded. Linked support progress/),
    ).toBeVisible();
    await expect(queued).toHaveCount(0);
  } finally {
    await operator.dispose();
    await teacher.dispose();
  }
});
