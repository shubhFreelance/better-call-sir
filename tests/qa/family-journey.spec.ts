import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { connect } from "node:net";
import { ids } from "../../packages/test-fixtures/src";
import { migrateTestDatabase } from "../helpers/test-migrations";
import { totp } from "../../apps/api/src/modules/identity/totp";
let db: PrismaClient,
  adminPool: Pool,
  api: ChildProcess,
  worker: ChildProcess,
  database: string,
  evidence: string;
const origin = "http://localhost:3002";
test.beforeAll(async () => {
  const manifest = JSON.parse(
    readFileSync("apps/web/.next/routes-manifest.json", "utf8"),
  );
  const rewrites = Array.isArray(manifest.rewrites)
    ? manifest.rewrites
    : (Object.values(manifest.rewrites).flat() as {
        source: string;
        destination: string;
      }[]);
  const rule = rewrites.find(
    (entry: { source: string }) => entry.source === "/api/v1/:path*",
  );
  expect(
    rule,
    "Build the QA frontend with its API rewrite targeting localhost:4000.",
  ).toBeTruthy();
  const destination = new URL(rule.destination);
  expect(["localhost", "127.0.0.1"]).toContain(destination.hostname);
  expect(destination.protocol).toBe("http:");
  expect(destination.port).toBe("4000");
  const occupied = await new Promise<boolean>((resolve) => {
    const socket = connect(4000, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  expect(
    occupied,
    "Stop your own local API before running the isolated family QA suite.",
  ).toBe(false);
  const local = parseEnv(
      readFileSync(existsSync(".env") ? ".env" : ".env.example", "utf8"),
    ),
    url = new URL(local.DATABASE_URL || "");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  adminPool = new Pool({ connectionString: url.href });
  database = "bcs_test_" + randomUUID().replaceAll("-", "");
  url.pathname = "/" + database;
  await adminPool.query(`CREATE DATABASE "${database}"`);
  evidence = mkdtempSync(path.join(tmpdir(), "bcs-family-qa-"));
  const env = {
    ...process.env,
    ...local,
    BCS_TEST_SQL_MIGRATIONS: "1",
    DATABASE_URL: url.href,
    MIGRATION_DATABASE_URL: url.href,
    APP_MODE: "development",
    NODE_ENV: "test",
    PORT: "4000",
    WEB_ORIGIN: origin,
    EMAIL_DELIVERY_MODE: "sandbox",
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    OTP_HASH_KEY: randomBytes(32).toString("base64"),
    EVIDENCE_DIRECTORY: evidence,
    CLAMAV_HOST: "127.0.0.1",
    CLAMAV_PORT: "3310",
  };
  await migrateTestDatabase(env);
  execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
    env,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "-p", "apps/api/tsconfig.json"],
    { env, stdio: "pipe" },
  );
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href }),
  });
  execFileSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "-p", "apps/worker/tsconfig.json"],
    { env, stdio: "pipe" },
  );
  worker = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    env,
    stdio: "ignore",
  });
  api = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env,
    stdio: "ignore",
  });
  await expect
    .poll(
      async () => {
        if (api.exitCode !== null)
          throw new Error("Isolated QA API exited before readiness");
        try {
          return (await fetch("http://127.0.0.1:4000/api/v1/health/ready"))
            .status;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);
});
test.afterAll(async () => {
  for (const child of [worker, api]) {
    if (!child || child.exitCode !== null || child.signalCode !== null)
      continue;
    const stopped = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await stopped;
    }
  }
  if (db) await db.$disconnect();
  if (database) {
    await adminPool.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  }
  if (adminPool) await adminPool.end();
  if (evidence) rmSync(evidence, { recursive: true, force: true });
});
async function post(
  request: APIRequestContext,
  url: string,
  body: unknown,
  csrf?: string,
) {
  const response = await request.post("/api/v1" + url, {
    headers: {
      Origin: origin,
      "Idempotency-Key": randomUUID(),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    data: body,
  });
  const data = await response.json();
  expect(response.status(), url + " " + JSON.stringify(data)).toBe(201);
  return data;
}

async function emailAccess(page: Page, email: string, name?: string) {
  if (name) await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const requested = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: /Send (sign-in|verification) code/,
      exact: true,
    })
    .click();
  const challenge = await (await requested).json();
  expect(challenge.status).toBe("SANDBOX");
  await page
    .getByLabel("Six-digit code", { exact: true })
    .fill(challenge.developmentCode);
  const verified = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/verify") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /^Verify and continue(?: to setup)?$/ })
    .click();
  const session = await (await verified).json();
  expect(session.accountCreated).toBe(!!name);
  return session;
}
async function returnLogin(
  page: Page,
  email: string,
  id: string,
  role: string,
) {
  if (
    !(await page
      .getByRole("button", { name: "Sign out", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/login");
  const session = await emailAccess(page, email);
  expect(session.account.id).toBe(id);
  expect(session.account.role).toBe(role);
  await expect(page).toHaveURL(/dashboard$/);
}
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1x8AAAAASUVORK5CYII=",
  "base64",
);

test("adult signup separates readiness from age, saves college education, and resumes the same independent account", async ({
  page,
}) => {
  const email = "adult-" + randomUUID() + "@example.test";
  await page.goto("/onboarding/independent-student");
  const session = await emailAccess(page, email, "Synthetic QA adult");
  await page.getByRole("radio", { name: /I can manage my learning/ }).check();
  await page.getByRole("radio", { name: "I am under 18", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Continue to education", exact: true }),
  ).toHaveCount(0);
  expect(
    await db.independentStudentProfile.count({
      where: { accountId: session.account.id },
    }),
  ).toBe(0);
  await expect(page.locator(".guardian-handoff")).toBeVisible();
  await page
    .getByRole("radio", {
      name: "I declare that I am 18 or older",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Continue to education", exact: true })
    .click();
  await page
    .getByLabel("Education stage", { exact: true })
    .selectOption("COLLEGE");
  await page
    .getByLabel("School / college name", { exact: true })
    .fill("Synthetic QA college");
  await page.getByLabel("Course / degree", { exact: true }).fill("BSc Physics");
  await page
    .getByLabel("University / awarding institution", { exact: true })
    .fill("Synthetic QA university");
  await page.getByLabel("Current year of study", { exact: true }).fill("2");
  await page
    .getByLabel("Subjects studied", { exact: true })
    .fill("Physics, Maths");
  await page
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Create my student account",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /I am 18 or older/ }).check();
  await page
    .getByRole("button", { name: "Create my student account", exact: true })
    .click();
  await expect(page).toHaveURL(/dashboard$/);
  expect(
    (await (await page.request.get("/api/v1/auth/session")).json()).account
      .role,
  ).toBe("INDEPENDENT_STUDENT");
  await returnLogin(page, email, session.account.id, "INDEPENDENT_STUDENT");
  expect(
    (
      await (
        await page.request.get("/api/v1/independent-student/profile")
      ).json()
    ).education.courseName,
  ).toBe("BSc Physics");
  await expect(
    page.getByText("BSc Physics · Year 2", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/family-qa-adult.png",
    fullPage: true,
  });
  console.log(
    "QA: under-18 gate and adult college signup/returning account passed",
  );
});

test("student-first shared setup and guardian-first second child complete review, consent, education and code-first student signup", async ({
  page,
  browser,
}) => {
  const guardianEmail = "guardian-" + randomUUID() + "@example.test",
    studentEmail = "minor-" + randomUUID() + "@example.test";
  const studentContext = await browser.newContext({ baseURL: origin }),
    staffContext = await browser.newContext({ baseURL: origin }),
    inviteContext = await browser.newContext({ baseURL: origin }),
    strangerContext = await browser.newContext({ baseURL: origin });
  try {
    const studentPage = await studentContext.newPage();
    await studentPage.goto("/onboarding/student?mode=together");
    const studentSession = await emailAccess(
      studentPage,
      studentEmail,
      "Synthetic QA shared child",
    );
    await expect(studentPage.locator(".student-connection")).toBeVisible();
    expect(
      (await (await studentPage.request.get("/api/v1/auth/session")).json())
        .account.studentSetupPending,
    ).toBe(true);
    await page.goto("/signup/guardian");
    const guardianSession = await emailAccess(
      page,
      guardianEmail,
      "Synthetic QA parent",
    );
    await expect(page).toHaveURL(/onboarding\/guardian$/);
    await page.goto("/guardian-verification");
    const staffSession = await post(staffContext.request, "/dev/session", {
      accountId: ids.admin,
    });
    const enrollment = await post(
      staffContext.request,
      "/auth/mfa/enrollment",
      {},
      staffSession.csrfToken,
    );
    await post(
      staffContext.request,
      "/auth/mfa/verification",
      { code: totp(enrollment.secret, BigInt(Math.floor(Date.now() / 30000))) },
      staffSession.csrfToken,
    );
    const staffPage = await staffContext.newPage();
    const browserErrors: string[] = [];
    for (const current of [page, studentPage, staffPage])
      current.on("pageerror", (error) => browserErrors.push(error.message));
    for (const [name, mode, age] of [
      ["Synthetic QA shared child", "SHARED", "15_TO_17"],
      ["Synthetic QA younger child", "GUARDIAN_ONLY", "UNDER_15"],
    ] as const) {
      if (mode === "GUARDIAN_ONLY") {
        const unverified = await page.request.post("/api/v1/learner-profiles", {
          headers: {
            Origin: origin,
            "X-CSRF-Token": guardianSession.csrfToken,
            "Idempotency-Key": randomUUID(),
          },
          data: {
            alias: name,
            education: {
              stage: "SCHOOL",
              grade: 8,
              board: "CBSE",
              institutionName: "Synthetic QA school",
              subjects: ["Maths"],
            },
          },
        });
        expect(unverified.status()).toBe(403);
        expect(
          await db.child.count({
            where: { guardianId: guardianSession.account.id },
          }),
        ).toBe(1);
      }
      await page.setViewportSize({
        width: mode === "GUARDIAN_ONLY" ? 390 : 1440,
        height: 1000,
      });
      await page.goto("/guardian-verification");
      await page
        .getByRole("button", {
          name: "Start guardian verification",
          exact: true,
        })
        .click();
      await page
        .getByLabel("Guardian's full name", { exact: true })
        .fill("Synthetic QA parent");
      await page
        .getByLabel("Learner's name on the school report", { exact: true })
        .fill(name);
      await page
        .getByRole("combobox", { name: "Learner's age group", exact: true })
        .selectOption(age);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("radio", {
          name:
            mode === "SHARED"
              ? /Guardian and student manage together/
              : /Guardian manages everything/,
        })
        .check();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      if (mode === "SHARED") {
        await page
          .getByRole("combobox", {
            name: /How will the student confirm this relationship/,
          })
          .selectOption("STUDENT_ACCOUNT");
        await page
          .getByRole("textbox", { name: /^Student's email address/ })
          .fill(studentEmail);
      }
      await page
        .getByRole("checkbox", { name: /I am an adult authorized to act/ })
        .check();
      await page
        .getByRole("checkbox", { name: /I permit private review/ })
        .check();
      await page
        .getByRole("button", {
          name: "Review relationship details",
          exact: true,
        })
        .click();
      await page
        .getByRole("checkbox", {
          name: /I reviewed the names, management choice/,
        })
        .check();
      await page
        .getByRole("button", { name: "Save relationship details", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Upload the school report",
          exact: true,
        }),
      ).toBeVisible();
      const verification = await db.guardianVerification.findFirstOrThrow({
        where: { guardianId: guardianSession.account.id, learnerName: name },
      });
      if (mode === "SHARED") {
        await studentPage.goto("/guardian-verification?view=student");
        await studentPage
          .getByRole("button", {
            name: "Review guardian relationship",
            exact: true,
          })
          .click();
        await studentPage.getByRole("checkbox").check();
        await studentPage
          .getByRole("button", {
            name: /Confirm.*relationship|Confirm.*guardian|Acknowledge/,
            exact: false,
          })
          .click();
        await expect
          .poll(
            async () =>
              !!(
                await db.guardianVerification.findUniqueOrThrow({
                  where: { id: verification.id },
                })
              ).studentAcknowledgedAt,
          )
          .toBe(true);
        await page
          .getByRole("button", {
            name: "Refresh verification details",
            exact: true,
          })
          .click();
        await expect(
          page.getByText("Acknowledgment recorded", { exact: true }),
        ).toBeVisible();
      }
      console.log(
        "QA: relationship details and acknowledgment checked: " + mode,
      );
      await page
        .getByLabel("School marksheet or performance-card image", {
          exact: true,
        })
        .setInputFiles({
          name: "synthetic-school-report.png",
          mimeType: "image/png",
          buffer: image,
        });
      await page
        .getByRole("button", { name: "Upload school report", exact: true })
        .click();
      await expect
        .poll(
          async () => {
            const record = await db.guardianVerification.findUniqueOrThrow({
              where: { id: verification.id },
            });
            return (
              record.currentEvidenceId &&
              (
                await db.guardianEvidence.findUniqueOrThrow({
                  where: { id: record.currentEvidenceId },
                })
              ).status
            );
          },
          { timeout: 30000 },
        )
        .toBe("CLEAN");
      await page
        .getByRole("checkbox", {
          name: /Send this relationship and its current report/,
        })
        .check();
      await page
        .getByRole("button", { name: "Send for staff review", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await db.guardianVerification.findUniqueOrThrow({
                where: { id: verification.id },
              })
            ).status,
        )
        .toBe("PENDING");
      await staffPage.goto("/guardian-verification");
      await staffPage
        .locator(".staff-person")
        .filter({ has: staffPage.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: "Review guardian evidence", exact: true })
        .click();
      await staffPage
        .getByRole("button", { name: "See uploaded document", exact: true })
        .click();
      await expect(
        staffPage.getByRole("dialog").getByRole("img"),
      ).toBeVisible();
      await staffPage.keyboard.press("Escape");
      const current = await db.guardianVerification.findUniqueOrThrow({
        where: { id: verification.id },
      });
      expect(
        (
          await strangerContext.request.get(
            "/api/v1/guardian-evidence/" +
              current.currentEvidenceId +
              "/content",
          )
        ).status(),
      ).toBe(401);
      const approve = staffPage.getByRole("button", {
        name: "Record verification decision",
        exact: true,
      });
      await expect(approve).toBeDisabled();
      await staffPage
        .getByRole("checkbox", { name: /I independently checked adult status/ })
        .check();
      await staffPage
        .getByRole("checkbox", { name: /The clean report names this guardian/ })
        .check();
      if (mode === "GUARDIAN_ONLY") {
        await staffPage
          .getByRole("combobox", { name: "Completed call review", exact: true })
          .selectOption("VIDEO");
        await staffPage
          .getByRole("checkbox", {
            name: /I observed the student acknowledgment/,
          })
          .check();
      }
      await staffPage
        .getByLabel("Feedback for the guardian", { exact: true })
        .fill("Synthetic QA review; no real-world identity assertion.");
      await staffPage
        .getByLabel(/^Protected review reference/)
        .fill("qa:synthetic-review-" + verification.id);
      await staffPage
        .getByRole("checkbox", {
          name: /I reviewed this learner, guardian, evidence and the exact decision/,
        })
        .check();
      await approve.click();
      await expect
        .poll(
          async () =>
            (
              await db.guardianVerification.findUniqueOrThrow({
                where: { id: verification.id },
              })
            ).status,
        )
        .toBe("APPROVED");
      console.log(
        "QA: " +
          mode +
          " relationship uploaded, worker-scanned, privately previewed and staff approved",
      );
      await page
        .getByRole("button", {
          name: "Refresh verification details",
          exact: true,
        })
        .click();
      const consent = page.getByRole("checkbox", {
        name: /I am the learner’s parent or lawful guardian/,
      });
      await expect(
        consent.or(page.getByLabel("Learner name or alias", { exact: true })),
      ).toBeVisible();
      if (await consent.count()) {
        await consent.check();
        await page
          .getByRole("button", { name: "Agree and continue", exact: true })
          .click();
      }
      await expect(
        page.getByLabel("Learner name or alias", { exact: true }),
      ).toHaveValue(name);
      await page
        .getByLabel("School / institution name", { exact: true })
        .fill("Synthetic QA school");
      await page.getByLabel("Class", { exact: true }).selectOption("8");
      await page.getByLabel("School board", { exact: true }).fill("CBSE");
      await page
        .getByLabel("Subjects studied", { exact: true })
        .fill("Maths, English");
      await page
        .getByRole("button", { name: "Review learner profile", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm and save profile", exact: true })
        .click();
      await expect(
        page.getByText(name + "’s profile is saved.", { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/guardian-verification/);
      const child = await db.child.findFirstOrThrow({
        where: { guardianVerificationId: verification.id },
      });
      expect(child.guardianId).toBe(guardianSession.account.id);
      if (mode === "SHARED") {
        expect(child.studentAccountId).toBe(studentSession.account.id);
        await studentPage.reload();
        await studentPage.goto("/onboarding/student?mode=together");
        await expect(
          studentPage.getByRole("heading", {
            name: "Your learning profile is ready",
            exact: true,
          }),
        ).toBeVisible();
        const permissions = await (
          await studentPage.request.get(
            "/api/v1/children/" + child.id + "/learning-management",
          )
        ).json();
        expect(permissions.mode).toBe("SHARED");
        expect(permissions.canManageLearning).toBe(true);
        expect(permissions.canManageConsent).toBe(false);
        await returnLogin(
          studentPage,
          studentEmail,
          studentSession.account.id,
          "STUDENT",
        );
        await expect(
          studentPage.locator(".student-access-ready"),
        ).toContainText(name);
        await expect(
          studentPage.locator(".student-profile-management"),
        ).toBeVisible();
      } else {
        await page
          .getByRole("button", {
            name: "Create first student invitation",
            exact: true,
          })
          .click();
        await page
          .getByRole("checkbox", {
            name: /I am the learner’s guardian and will authorize only the intended student device/,
          })
          .check();
        await page
          .getByRole("button", { name: "Create invitation", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Reveal invitation code", exact: true })
          .click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const token = await page
          .getByLabel("Private invitation code", { exact: true })
          .inputValue();
        expect(token.length).toBeGreaterThan(10);
        const invitePage = await inviteContext.newPage();
        invitePage.on("pageerror", (error) =>
          browserErrors.push(error.message),
        );
        await invitePage.setViewportSize({ width: 390, height: 844 });
        await invitePage.goto("/signup/student");
        await invitePage
          .getByRole("link", { name: "Use a student invitation", exact: true })
          .click();
        await expect(
          invitePage.getByLabel("Invitation code", { exact: true }),
        ).toBeVisible();
        await expect(
          invitePage.getByLabel("Email address", { exact: true }),
        ).toHaveCount(0);
        await invitePage
          .getByLabel("Invitation code", { exact: true })
          .fill(token);
        await invitePage
          .getByRole("button", { name: "Check my invitation", exact: true })
          .click();
        const email = "invited-" + randomUUID() + "@example.test";
        const linkedSession = await emailAccess(
          invitePage,
          email,
          "Synthetic QA invited child",
        );
        await invitePage
          .getByRole("checkbox", { name: /My guardian gave me this code/ })
          .check();
        await invitePage
          .getByRole("button", { name: "Link my student profile", exact: true })
          .click();
        await expect(
          invitePage.getByRole("heading", {
            name: "Your learning profile is ready",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          (await db.child.findUniqueOrThrow({ where: { id: child.id } }))
            .studentAccountId,
        ).toBe(linkedSession.account.id);
        expect(
          (
            await strangerContext.request.post("/api/v1/invitations/check", {
              headers: { Origin: origin },
              data: { token },
            })
          ).status(),
        ).toBe(409);
        const permissions = await (
          await invitePage.request.get(
            "/api/v1/children/" + child.id + "/learning-management",
          )
        ).json();
        expect(permissions.mode).toBe("GUARDIAN_ONLY");
        expect(permissions.canManageLearning).toBe(false);
        expect(permissions.canConfirmFinancialCommencement).toBe(false);
        await returnLogin(
          invitePage,
          email,
          linkedSession.account.id,
          "STUDENT",
        );
        await expect(invitePage.locator(".student-access-ready")).toContainText(
          name,
        );
        await expect(
          invitePage.locator(".student-profile-management"),
        ).toBeVisible();
        expect(
          await invitePage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await invitePage.screenshot({
          path: "test-results/family-qa-invited-student.png",
          fullPage: true,
        });
      }
      console.log(
        "QA: " +
          mode +
          " inline student setup and returning student access persisted",
      );
    }
    await returnLogin(
      page,
      guardianEmail,
      guardianSession.account.id,
      "GUARDIAN",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard/learners");
    await expect(
      page.getByRole("heading", {
        name: "Synthetic QA shared child",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Synthetic QA younger child",
        exact: true,
      }),
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
    expect(
      await db.child.count({
        where: { guardianId: guardianSession.account.id },
      }),
    ).toBe(2);
    await page.screenshot({
      path: "test-results/family-qa-two-children.png",
      fullPage: true,
    });
  } finally {
    await studentContext.close();
    await staffContext.close();
    await inviteContext.close();
    await strangerContext.close();
  }
});
