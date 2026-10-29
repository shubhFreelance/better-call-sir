import { test, expect, type APIRequestContext } from "@playwright/test";
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
  database: string,
  evidence: string;
const origin = "http://localhost:3001",
  teacherEmail = "reviewed-teacher-qa@example.test";
test.beforeAll(async () => {
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
    "Stop your own local API before running the isolated teacher QA suite.",
  ).toBe(false);
  const local = parseEnv(
      readFileSync(existsSync(".env") ? ".env" : ".env.example", "utf8"),
    ),
    url = new URL(local.DATABASE_URL);
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  adminPool = new Pool({ connectionString: url.href });
  database = "bcs_teacherqa_" + randomUUID().replaceAll("-", "");
  url.pathname = "/" + database;
  await adminPool.query(`CREATE DATABASE "${database}"`);
  evidence = mkdtempSync(path.join(tmpdir(), "bcs-teacher-qa-"));
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
  await db.account.update({
    where: { id: ids.teacherAccount },
    data: { email: teacherEmail },
  });
  await db.child.update({
    where: { id: ids.otherChild },
    data: {
      schoolName: "Synthetic QA school",
      schoolSubjects: ["Maths", "English", "Science"],
    },
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
  if (api) {
    api.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((r) =>
        api.exitCode !== null ? r() : api.once("exit", () => r()),
      ),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    if (api.exitCode === null) api.kill("SIGKILL");
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

test("reviewed teacher signs in, handles a real family enquiry, confirms tuition, activates promotion and keeps progress after signing in again", async ({
  page,
  browser,
}) => {
  const browserErrors:string[]=[],apiFailures:string[]=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/api/v1/')&&(response.status()===403||response.status()===404||response.status()>=500))apiFailures.push(response.request().method()+' '+new URL(response.url()).pathname+' '+response.status());});
  const family = await browser.newContext({ baseURL: origin }),
    staff = await browser.newContext({ baseURL: origin });
  try {
    const familySession = await post(family.request, "/dev/session", {
      accountId: ids.otherGuardian,
    });
    const requestBody = {
      childId: ids.otherChild,
      alias: "Tara",
      schoolName: "Synthetic QA school",
      schoolSubjects: ["Maths", "English", "Science"],
      grade: 9,
      board: "CGBSE",
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      locality: "Shankar Nagar",
      budgetPaise: 400000,
      schedule: "Tuesday 18:00–20:00 IST",
      preferences: {
        timezone: "Asia/Kolkata",
        weekly: [{ weekday: 2, startMinute: 1080, endMinute: 1200 }],
      },
      discoveryMethod: "MANUAL",
      preferredTeacherId: ids.teacher,
    };
    const enquiry = await post(
      family.request,
      "/requests",
      requestBody,
      familySession.csrfToken,
    );
    const declineRequest = await post(
      family.request,
      "/requests",
      requestBody,
      familySession.csrfToken,
    );
    async function signIn() {
      await page.goto("/login?intent=teacher");
      await page
        .getByLabel("Email address", { exact: true })
        .fill(teacherEmail);
      const challenge = page.waitForResponse(
        (r) =>
          r.url().endsWith("/auth/otp/request") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: /Send (sign-in|verification) code/,
          exact: true,
        })
        .click();
      const otp = await (await challenge).json();
      expect(otp.status).toBe("SANDBOX");
      await page
        .getByLabel("Six-digit code", { exact: true })
        .fill(otp.developmentCode);
      await page
        .getByRole("button", { name: "Verify and continue", exact: true })
        .click();
      await expect(page).toHaveURL(/dashboard/);
      const session = await (
        await page.request.get("/api/v1/auth/session")
      ).json();
      expect(session.account.id).toBe(ids.teacherAccount);
      expect(session.account.role).toBe("TEACHER");
      return session;
    }
    await signIn();
    console.log("QA: existing teacher email sign-in confirmed");
    const inbox = await (
        await page.request.get("/api/v1/direct-enquiries")
      ).json(),
      conversation = inbox.items.find((i: any) => i.sourceId === enquiry.id);
    expect(conversation).toBeTruthy();
    const declineConversation = inbox.items.find(
      (i: any) => i.sourceId === declineRequest.id,
    );
    expect(declineConversation).toBeTruthy();
    await page.goto(
      "/dashboard/enquiries?conversation=" + declineConversation.id,
    );
    const declineCard = page
      .locator(".direct-enquiry-card")
      .filter({ hasText: "Tara" })
      .first();
    await declineCard
      .getByRole("button", { name: "Decline enquiry", exact: true })
      .click();
    const declineDialog = page.getByRole("dialog", {
      name: "Review your reply",
      exact: true,
    });
    await declineDialog.getByRole("checkbox").check();
    await declineDialog
      .getByRole("button", { name: "Confirm reply", exact: true })
      .click();
    await expect(declineDialog).toBeHidden();
    expect(
      (
        await db.directEnquiry.findUniqueOrThrow({
          where: { id: declineConversation.id },
        })
      ).status,
    ).toBe("DECLINED");
    console.log("QA: teacher decline persisted without creating tuition");
    await page.goto("/dashboard/enquiries?conversation=" + conversation.id);
    const card = page
      .locator(".direct-enquiry-card")
      .filter({ hasText: "Tara" })
      .first();
    await expect(card).toBeVisible();
    if (
      (await card.locator("summary").count()) &&
      (await card.getAttribute("open")) === null
    )
      await card.locator("summary").click();
    await expect(card).toContainText("Synthetic QA school");
    await card
      .getByRole("button", {
        name: "Propose another time or group",
        exact: true,
      })
      .click();
    const form = page.locator(".direct-reply-form");
    await form.getByLabel("Teaching format").selectOption("GROUP");
    await form.getByLabel("Available from 1", { exact: true }).fill("17:00");
    await form
      .getByLabel("Message to the family")
      .fill("Synthetic QA: a group place is available earlier.");
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Confirm reply", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    console.log("QA: teacher alternative delivered to family");
    const proposed = await db.directEnquiry.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(proposed.status).toBe("PROPOSED");
    await expect(
      card.getByRole("button", { name: "Accept enquiry", exact: true }),
    ).toBeDisabled();
    await post(
      family.request,
      "/direct-enquiries/" + conversation.id + "/responses",
      {
        action: "ACCEPT_PROPOSAL",
        expectedVersion: proposed.version,
        expectedSourceVersion: 1,
        confirmed: true,
      },
      familySession.csrfToken,
    );
    await page.reload();
    const currentCard = page
      .locator(".direct-enquiry-card")
      .filter({ hasText: "Tara" })
      .first();
    if (
      (await currentCard.locator("summary").count()) &&
      (await currentCard.getAttribute("open")) === null
    )
      await currentCard.locator("summary").click();
    await currentCard
      .getByRole("button", { name: "Accept enquiry", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Review your reply",
      exact: true,
    });
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Confirm reply", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    console.log("QA: family alternative approved and teacher accepted");
    const accepted = await db.directEnquiry.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.arrangementId).toBeTruthy();
    await page.screenshot({
      path: "test-results/teacher-qa-real-accepted-enquiry.png",
      fullPage: true,
    });
    const monthly = currentCard.locator(".monthly-hiring");
    await monthly.getByRole("checkbox").check();
    await monthly
      .getByRole("button", { name: "Confirm monthly tuition", exact: true })
      .click();
    await expect(monthly).toContainText("Waiting for the other party");
    const bookingUrl = "/tuition-bookings/PLACEMENT/" + accepted.arrangementId,
      preview = await (await family.request.get("/api/v1" + bookingUrl)).json();
    await post(
      family.request,
      bookingUrl + "/confirmations",
      {
        expectedVersion: preview.version,
        expectedBookingVersion: preview.bookingVersion,
        month: preview.month,
        policyVersion: preview.policyVersion,
        confirmed: true,
        contactShareAccepted: true,
      },
      familySession.csrfToken,
    );
    expect(
      (await (await page.request.get("/api/v1" + bookingUrl)).json()).confirmed,
    ).toBe(true);
    console.log("QA: monthly tuition mutually confirmed");
    await page.goto("/dashboard/promotions");
    await page
      .locator(".promotion-plan-search")
      .getByRole("button", { name: "Review promotion", exact: true })
      .click();
    const promotionDialog = page.getByRole("dialog", {
      name: "Review your promotion",
      exact: true,
    });
    await promotionDialog.getByRole("checkbox").check();
    await promotionDialog
      .getByRole("button", { name: "Submit promotion request", exact: true })
      .click();
    await expect(promotionDialog).toBeHidden();
    console.log("QA: teacher promotion request submitted");
    const promotion = await db.teacherPromotion.findFirstOrThrow({
      where: { teacherId: ids.teacher, placement: "SEARCH" },
    });
    expect(promotion.status).toBe("PENDING");
    const staffSession = await post(staff.request, "/dev/session", {
        accountId: ids.admin,
      }),
      enrollment = await post(
        staff.request,
        "/auth/mfa/enrollment",
        {},
        staffSession.csrfToken,
      );
    await post(
      staff.request,
      "/auth/mfa/verification",
      { code: totp(enrollment.secret, BigInt(Math.floor(Date.now() / 30000))) },
      staffSession.csrfToken,
    );
    await post(
      staff.request,
      "/promotions/" + promotion.id + "/decision",
      {
        expectedVersion: 1,
        action: "APPROVE",
        reason: "Synthetic QA payment review only",
        paymentReference: "synthetic-qa-" + randomUUID(),
        paymentConfirmed: true,
        confirmed: true,
      },
      staffSession.csrfToken,
    );
    console.log("QA: staff promotion decision persisted");
    await page.locator(".live-bell-trigger").click();
    await expect(
      page.getByText("Your promotion is active", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(
      page.locator(".promotion-campaign .status-badge"),
    ).toContainText("Active");
    await page.screenshot({
      path: "test-results/teacher-qa-real-active-promotion.png",
      fullPage: true,
    });
    async function promotionAction(action: string, status: string) {
      const campaign = page.locator(".promotion-campaign");
      if ((await campaign.getAttribute("open")) === null)
        await campaign.locator("summary").click();
      await campaign.getByRole("combobox", { name:"Action", exact: true }).selectOption(action);
      await campaign
        .getByLabel("Review note", { exact: true })
        .fill("Synthetic QA " + action.toLowerCase());
      await campaign
        .getByRole("checkbox", {
          name: "I reviewed this campaign and the selected action.",
          exact: true,
        })
        .check();
      await campaign
        .getByRole("button", { name: "Confirm action", exact: true })
        .click();
      await expect(
        page.locator(".promotion-campaign .status-badge"),
      ).toContainText(status);
    }
    await promotionAction("PAUSE", "Paused");
    await promotionAction("RESUME", "Active");
    console.log("QA: teacher pause and resume persisted");
    const sponsored = await (
      await family.request.get(
        "/api/v1/sponsored-teachers?promotionPlacement=SEARCH&subject=Maths&grade=9&board=CGBSE",
      )
    ).json();
    expect(sponsored.items.some((t: any) => t.id === ids.teacher)).toBe(true);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await signIn();
    await page.goto("/dashboard/promotions");
    await expect(
      page.locator(".promotion-campaign .status-badge"),
    ).toContainText("Active");
    expect(
      await db.teacherPromotion.count({ where: { teacherId: ids.teacher } }),
    ).toBe(1);
    expect(
      (
        await db.directEnquiry.findUniqueOrThrow({
          where: { id: conversation.id },
        })
      ).arrangementId,
    ).toBe(accepted.arrangementId);
    for(const label of ['Notifications','Assigned enquiries','Independent students','Student arrangements','Teaching profile','Privacy & data','Find a teacher','Help & safety']){
      await page.goto('/dashboard');await page.evaluate(()=>{(window as unknown as {teacherQaNavigation:string}).teacherQaNavigation='retained';});
      await page.locator('.dashboard-sidebar').getByRole('link',{name:label,exact:true}).click();
      await expect(page.locator('main h1').first()).toBeVisible();await expect(page.locator('main h1').first()).not.toHaveText('This page could not be loaded.');
      expect(await page.evaluate(()=>(window as unknown as {teacherQaNavigation:string}).teacherQaNavigation)).toBe('retained');
      const current=await(await page.request.get('/api/v1/auth/session')).json();expect(current.account.id).toBe(ids.teacherAccount);console.log('QA: sidebar '+label+' loads without a document reload');
    }
    await page.goto('/dashboard/promotions');
    await promotionAction("CANCEL", "Cancelled");
    const hidden = await (
      await family.request.get(
        "/api/v1/sponsored-teachers?promotionPlacement=SEARCH",
      )
    ).json();
    expect(hidden.items.some((t: any) => t.id === ids.teacher)).toBe(false);
    console.log("QA: cancellation removed sponsored delivery");
    expect(browserErrors).toEqual([]);expect(apiFailures).toEqual([]);
  } finally {
    await family.close();
    await staff.close();
  }
});
