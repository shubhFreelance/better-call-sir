import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
import AxeBuilder from "@axe-core/playwright";
import { teacherDetails } from "../../packages/test-fixtures/src";
import { beginGuardian, submitGuardian } from "./guardian-journey";
import { operationValidator } from "../helpers/contract";

test.afterEach(async () => cleanupStaffFixtures());
test("real college discovery and guardian enquiry preserve exact course/year scope through operator matching", async ({
  page,
  playwright,
}) => {
  test.setTimeout(90000);
  const config = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(config.DATABASE_URL);
  expect(config.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const pool = new Pool({ connectionString: url.href }),
    guardianId = randomUUID(),
    teacherAccount = randomUUID(),
    childId = randomUUID(),
    teacherApi = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
    });
  const accountIds = [guardianId, teacherAccount];
  try {
    for (const [id, name, role] of [
      [guardianId, "Synthetic college coverage guardian", "GUARDIAN"],
      [teacherAccount, "Synthetic college scope teacher", "TEACHER"],
    ])
      await pool.query(
        'INSERT INTO "Account" (id,name,role,verified,phone) VALUES ($1,$2,$3,true,$4)',
        [id, name, role, "+91000000" + id.replaceAll("-", "")],
      );
    await pool.query('INSERT INTO "Consent" (id,"guardianId") VALUES ($1,$2)', [
      randomUUID(),
      guardianId,
    ]);
    await pool.query(
      'INSERT INTO "Child" (id,"guardianId",alias,"educationStage",grade,board,"schoolName","schoolSubjects","courseName",university,"studyYear") VALUES ($1,$2,$3,$4,NULL,NULL,$5,$6,$7,$8,2)',
      [
        childId,
        guardianId,
        "Synthetic college learner",
        "COLLEGE",
        "Synthetic College",
        ["Mechanics", "Calculus"],
        "BSc Physics",
        "Synthetic University",
      ],
    );
    const ts = await teacherApi.post("/api/v1/dev/session", {
      data: { accountId: teacherAccount },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(ts.status()).toBe(201);
    const teacherSession = await ts.json();
    const application = await teacherApi.post("/api/v1/teacher-applications", {
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Token": teacherSession.csrfToken,
        "Idempotency-Key": randomUUID(),
      },
      data: {
        ...teacherDetails,
        name: "Synthetic college scope teacher",
        headline: "Mechanics for physics learners",
        bio: "Synthetic course and year teaching declaration.",
        teachingCoverage: [
          {
            stage: "COLLEGE",
            subject: "Mechanics",
            courseName: "BSc Physics",
            studyYear: 2,
          },
        ],
        subjects: ["Mechanics"],
        boards: [],
        grades: [],
        languages: ["English"],
        modes: ["ONLINE"],
        localities: [],
        monthlyPaise: 300000,
        experience: 5,
        consultationOptIn: false,
        feeTermsAccepted: true,
        demoOptIn: false,
      },
    });
    expect(application.status()).toBe(201);
    const t = await application.json();
    // Only this synthetic fixture is qualified for the browser journey; independent screening is exercised in API acceptance.
    await pool.query(
      'UPDATE "Teacher" SET status=$2,"screeningComplete"=true,"screeningValidUntil"=now()+interval \'30 days\' WHERE id=$1',
      [t.id, "APPROVED"],
    );
    const date = new Date(Date.now() + 3 * 86400000 + 330 * 60000),
      day = date.toISOString().slice(0, 10),
      weekday = date.getUTCDay();
    await pool.query(
      'INSERT INTO "AvailabilityPattern" (id,"teacherId",kind,weekday,"startMinute","endMinute",timezone,"validFrom","validUntil") VALUES ($1,$2,$3,$4,960,1200,$5,$6,$6)',
      [randomUUID(), t.id, "RECURRING", weekday, "Asia/Kolkata", day],
    );
    const gs = await page.request.post("/api/v1/dev/session", {
      data: { accountId: guardianId },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(gs.status()).toBe(201);
    await page.goto("/teachers");
    await page
      .getByLabel("Education stage", { exact: true })
      .selectOption("COLLEGE");
    await page
      .getByLabel("Course / degree", { exact: true })
      .fill("BSc Physics");
    await page.getByLabel("Study year", { exact: true }).selectOption("2");
    await page
      .getByLabel("Subject", { exact: true })
      .selectOption("__CUSTOM__");
    await page.getByLabel("Subject name", { exact: true }).fill("Mechanics");
    await expect(
      page.getByRole("link", { name: t.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1 teachers to get to know")).toBeVisible();
    await page.screenshot({
      path: "test-results/coverage-search-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/coverage-search-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.getByRole("link", { name: t.name, exact: true }).click();
    await expect(page.locator(".teaching-coverage-summary")).toContainText(
      "BSc Physics",
    );
    await page
      .getByRole("link", { name: /Enquire about this teacher/ })
      .click();
    await beginGuardian(page);
    await page.getByLabel("Link an existing learner").selectOption(childId);
    await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("BSc Physics · Year 2", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Continue to tuition needs", exact: true })
      .click();
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
      "Mechanics",
    );
    await page
      .getByLabel("Monthly tuition budget (₹)", { exact: true })
      .fill("4000");
    await page
      .getByRole("button", { name: "Continue to schedule", exact: true })
      .click();
    await page
      .getByLabel("Preferred day 1", { exact: true })
      .selectOption(String(weekday));
    await page
      .getByLabel("Available from 1 (IST)", { exact: true })
      .fill("16:00");
    await page
      .getByLabel("Available until 1 (IST)", { exact: true })
      .fill("20:00");
    await page
      .getByRole("button", { name: "Review request", exact: true })
      .click();
    await expect(page.locator(".wizard-review")).toContainText(
      "BSc Physics · Year 2",
    );
    await expect(page.locator(".wizard-review")).not.toContainText(
      "Class null",
    );
    await page.screenshot({
      path: "test-results/college-enquiry-review-mobile.png",
      fullPage: true,
    });
    const requestId = await submitGuardian(page);
    const req = await page.request.get("/api/v1/requests/" + requestId);
    expect(req.status()).toBe(200);
    expect((await req.json()).subject).toBe("Mechanics");
    const row = await pool.query(
      'SELECT "childId", "preferredTeacherId" FROM "TuitionRequest" WHERE id=$1',
      [requestId],
    );
    expect(row.rows[0]).toEqual({ childId, preferredTeacherId: t.id });
    const operator = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
    });
    try {
      const staff = await verifiedStaffSession(operator);
      const run = await operator.post(
        "/api/v1/admin/requests/" + requestId + "/recommendations",
        {
          headers: {
            Origin: "http://localhost:3000",
            "X-CSRF-Token": staff.csrfToken,
            "Idempotency-Key": randomUUID(),
          },
          data: { expectedVersion: 1 },
        },
      );
      expect(run.status()).toBe(201);
      const ranked = await run.json();
      expect(ranked.matchStatus).toBe("MATCHED");
      expect(
        ranked.items.some((c: { teacherId: string }) => c.teacherId === t.id),
      ).toBe(true);
      expect(
        operationValidator(
          "/admin/requests/{id}/recommendations",
          "post",
          "201",
        )(ranked),
      ).toBe(true);
    } finally {
      await operator.dispose();
    }
  } finally {
    await pool.query(
      'UPDATE "Account" SET disabled=true,phone=NULL WHERE id=ANY($1::uuid[])',
      [accountIds],
    );
    await pool.query(
      'UPDATE "Session" SET revoked=true WHERE "accountId"=ANY($1::uuid[])',
      [accountIds],
    );
    await pool.query(
      'UPDATE "Teacher" SET status=$2,"screeningComplete"=false WHERE "accountId"=$1',
      [teacherAccount, "SUSPENDED"],
    );
    await teacherApi.dispose();
    await pool.end();
  }
});
