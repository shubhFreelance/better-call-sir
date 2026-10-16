import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { teacherDetails } from "../../packages/test-fixtures/src";

test.use({ trace: "off" });
const scopes = [
  { stage: "SCHOOL", subject: "Physics", grade: 12, board: "CBSE" },
  { stage: "SCHOOL", subject: "Chemistry", grade: 11, board: "ICSE" },
  { stage: "EARLY_YEARS", subject: "Language", level: "KG1" },
  {
    stage: "COLLEGE",
    subject: "Mechanics",
    courseName: "BSc Physics",
    studyYear: 2,
  },
];
async function fixture(page: Page) {
  const config = parseEnv(readFileSync(".env", "utf8"));
  expect(config.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(
    new URL(config.DATABASE_URL).hostname,
  );
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const teacherAccount = randomUUID(),
    guardian = randomUUID();
  const name = "Synthetic coverage " + teacherAccount.slice(0, 8);
  for (const [id, role] of [
    [teacherAccount, "TEACHER"],
    [guardian, "GUARDIAN"],
  ])
    await pool.query(
      'INSERT INTO "Account" (id,name,role,verified,phone) VALUES ($1,$2,$3,true,$4)',
      [id, name, role, "+91000000" + id.replaceAll("-", "")],
    );
  await pool.query('INSERT INTO "Consent" (id,"guardianId") VALUES ($1,$2)', [
    randomUUID(),
    guardian,
  ]);
  const headers = { Origin: "http://localhost:3000" };
  const teacherSession = await page.request.post("/api/v1/dev/session", {
    headers,
    data: { accountId: teacherAccount },
  });
  expect(teacherSession.status()).toBe(201);
  const applied = await page.request.post("/api/v1/teacher-applications", {
    headers: {
      ...headers,
      "X-CSRF-Token": (await teacherSession.json()).csrfToken,
      "Idempotency-Key": randomUUID(),
    },
    data: {
      ...teacherDetails,
      demoOptIn: false,
      name,
      headline: "Synthetic curriculum coverage",
      bio: "Synthetic coverage acceptance fixture",
      subjects: ["Maths"],
      boards: [],
      grades: [],
      teachingCoverage: scopes,
      languages: ["English"],
      modes: ["ONLINE"],
      localities: [],
      monthlyPaise: 300000,
      experience: 5,
      consultationOptIn: false,
      feeTermsAccepted: true,
    },
  });
  expect(applied.status()).toBe(201);
  const teacher = await applied.json();
  // Synthetic screening fixture only; production applications still require staff checks.
  await pool.query(
    'UPDATE "Teacher" SET status=\'APPROVED\',"screeningComplete"=true,"screeningValidUntil"=$2 WHERE id=$1',
    [teacher.id, new Date(Date.now() + 86400000)],
  );
  const session = await page.request.post("/api/v1/dev/session", {
    headers,
    data: { accountId: guardian },
  });
  expect(session.status()).toBe(201);
  const csrf = (await session.json()).csrfToken;
  return {
    name,
    teacher,
    csrf,
    cleanup: async () => {
      await pool.query(
        'UPDATE "Teacher" SET status=\'SUSPENDED\',"screeningComplete"=false WHERE id=$1',
        [teacher.id],
      );
      await pool.query(
        'UPDATE "Account" SET phone=NULL,disabled=true WHERE id=ANY($1::uuid[])',
        [[teacherAccount, guardian]],
      );
      await pool.query(
        'UPDATE "Session" SET revoked=true WHERE "accountId"=ANY($1::uuid[])',
        [[teacherAccount, guardian]],
      );
      await pool.end();
    },
  };
}

test("real search keeps subjects within their declared class, board and course/year", async ({
  page,
}) => {
  const f = await fixture(page);
  try {
    await page.goto("/teachers");
    await page.getByRole("textbox", { name: "Search teachers" }).fill(f.name);
    await page
      .getByLabel("Education stage", { exact: true })
      .selectOption("SCHOOL");
    await page.getByLabel("Subject", { exact: true }).selectOption("Physics");
    await page.getByLabel("Class", { exact: true }).selectOption("12");
    await page.getByLabel("Board", { exact: true }).selectOption("CBSE");
    await expect(page.getByText("1 teachers to get to know")).toBeVisible();
    await page.getByLabel("Class", { exact: true }).selectOption("11");
    await expect(page.getByText("0 teachers to get to know")).toBeVisible();
    await page
      .getByLabel("Education stage", { exact: true })
      .selectOption("EARLY_YEARS");
    await page.getByLabel("Subject", { exact: true }).selectOption("Language");
    await page
      .getByLabel("Early years level", { exact: true })
      .selectOption("KG1");
    await expect(page.getByText("1 teachers to get to know")).toBeVisible();
    await page
      .getByLabel("Early years level", { exact: true })
      .selectOption("KG2");
    await expect(page.getByText("0 teachers to get to know")).toBeVisible();
    await page
      .getByLabel("Education stage", { exact: true })
      .selectOption("COLLEGE");
    await page
      .getByLabel("Subject", { exact: true })
      .selectOption("__CUSTOM__");
    await page.getByLabel("Subject name", { exact: true }).fill("Mechanics");
    await page
      .getByLabel("Course / degree", { exact: true })
      .fill("BSc Physics");
    await page.getByLabel("Study year", { exact: true }).selectOption("2");
    await expect(page.getByText("1 teachers to get to know")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/expanded-discovery-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/expanded-discovery-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.getByLabel("Study year", { exact: true }).selectOption("3");
    await expect(page.getByText("0 teachers to get to know")).toBeVisible();
    await page
      .getByRole("button", { name: "Reset filters", exact: true })
      .click();
    await expect(
      page.getByLabel("Education stage", { exact: true }),
    ).toHaveValue("");
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Subject name", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByLabel("Course / degree", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Subject", { exact: true })
      .selectOption("__CUSTOM__");
    await page
      .getByLabel("Subject name", { exact: true })
      .pressSequentially("Physics lab");
    await expect(page.getByLabel("Subject name", { exact: true })).toHaveValue(
      "Physics lab",
    );
  } finally {
    await f.cleanup();
  }
});
