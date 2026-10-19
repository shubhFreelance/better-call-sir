import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppService } from "../../apps/api/src/shared";
import { translateText } from "../../apps/web/app/locale";
import { signInCopy } from "../../apps/web/app/sign-in-copy";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
import { checkHindi } from "../helpers/hindi";
const config = parseEnv(readFileSync(".env", "utf8"));
expect(config.APP_MODE).toBe("development");
expect(["localhost", "127.0.0.1"]).toContain(
  new URL(config.DATABASE_URL).hostname,
);
const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
  }),
  accounts: string[] = [];
test.use({ trace: "off" });
test.afterAll(async () => {
  await db.tuitionRequest.updateMany({
    where: { guardianId: { in: accounts } },
    data: { status: "WITHDRAWN", version: { increment: 1 } },
  });
  await db.placement.updateMany({
    where: { guardianId: { in: accounts }, status: { not: "CLOSED" } },
    data: { status: "CLOSED", closedAt: new Date(), version: { increment: 1 } },
  });
  await db.teacher.updateMany({
    where: { accountId: { in: accounts } },
    data: { status: "SUSPENDED", version: { increment: 1 } },
  });
  await db.account.updateMany({
    where: { id: { in: accounts } },
    data: { disabled: true },
  });
  await db.session.updateMany({
    where: { accountId: { in: accounts } },
    data: { revoked: true },
  });
  await db.$disconnect();
  await cleanupStaffFixtures();
});
async function post(
  client: APIRequestContext,
  path: string,
  csrf: string,
  data: unknown,
) {
  const response = await client.post("/api/v1" + path, {
    data,
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": csrf,
      "Idempotency-Key": randomUUID(),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function teacherFixture(context: BrowserContext) {
  const account = await db.account.create({
    data: {
      name: "Synthetic guardian journey teacher",
      email: randomUUID() + "@example.test",
      role: "TEACHER",
    },
  });
  accounts.push(account.id);
  const service = new AppService();
  service.db = db;
  const session = await service.issueSession(account, randomUUID(), db);
  await context.addCookies(
    ["access", "refresh"].map((key) => ({
      name: "bcs_" + key,
      value: session[key as "access" | "refresh"],
      url: "http://localhost:3000/api/v1",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  const teacher = await db.teacher.create({
    data: {
      accountId: account.id,
      name: "Family journey " + randomUUID(),
      slug: "family-journey-" + randomUUID(),
      headline: "Synthetic reviewed subject teacher",
      bio: "Synthetic acceptance fixture only",
      subjects: ["Maths"],
      grades: [8],
      boards: ["CBSE"],
      languages: ["English"],
      modes: ["ONLINE"],
      monthlyPaise: 200000,
      experience: 3,
      status: "APPROVED",
      screeningComplete: true,
      screeningValidUntil: new Date(Date.now() + 90 * 86400000),
      maxActiveStudents: 1,
      lockInDays: 15,
      demoOptIn: false,
    },
  });
  await db.availabilityPattern.create({
    data: {
      teacherId: teacher.id,
      kind: "RECURRING",
      weekday: 1,
      startMinute: 960,
      endMinute: 1200,
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 80 * 86400000),
    },
  });
  return { teacher, csrf: session.csrf };
}
for (const hindi of [false, true])
  test(`guardian proof-to-hiring acceptance in ${hindi ? "Hindi mobile" : "English desktop"} uses actual review, consent and owned replacement`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    const T = (value: string) => translateText(hindi, value) as string,
      language = hindi ? "hi" : "en",
      copy = signInCopy[language],
      learner = "Synthetic learner " + randomUUID().slice(0, 8),
      email = "family-journey-" + randomUUID() + "@example.test";
    const viewport = hindi
      ? { width: 360, height: 800 }
      : { width: 1440, height: 1000 };
    await page.setViewportSize(viewport);
    await page.context().addCookies([
      {
        name: "bcs.interface-language",
        value: language,
        url: "http://localhost:3000",
      },
    ]);
    await page
      .context()
      .addInitScript(
        (language) => localStorage.setItem("bcs.interface-language", language),
        language,
      );
    const staff = await browser.newContext({
        baseURL: "http://localhost:3000",
      }),
      tc = await browser.newContext({ baseURL: "http://localhost:3000" });
    try {
      await page.goto("/login?next=%2Fonboarding%2Fguardian");
      await page
        .getByLabel(copy.name, { exact: true })
        .fill("Synthetic guardian journey");
      await page.getByLabel(copy.email, { exact: true }).fill(email);
      const requested = page.waitForResponse(
        (r) =>
          r.url().endsWith("/auth/otp/request") &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: copy.send, exact: true }).click();
      const challenge = await (await requested).json();
      expect(challenge.status).toBe("SANDBOX");
      await page
        .getByLabel(copy.code, { exact: true })
        .fill(challenge.developmentCode);
      await page
        .getByRole("button", { name: copy.verify, exact: true })
        .click();
      await expect(page).toHaveURL(/onboarding\/guardian/);
      let session = await (
        await page.request.get("/api/v1/auth/session")
      ).json();
      accounts.push(session.account.id);
      expect(session.account.verified).toBe(false);
      expect(
        (
          await page.request.post("/api/v1/consents", {
            data: {
              purpose: "tuition-and-learning-records",
              policyVersion: "development-v1",
              accepted: true,
            },
            headers: {
              Origin: "http://localhost:3000",
              "X-CSRF-Token": session.csrfToken,
            },
          })
        ).status(),
      ).toBe(403);
      // Human attestations below are explicitly synthetic, never evidence of a real reviewer or guardian identity.
      let proof = await post(
        page.request,
        "/guardian-verifications",
        session.csrfToken,
        {
          guardianName: session.account.name,
          learnerName: learner,
          relationship: "PARENT",
          ageBand: "UNDER_15",
          managementMode: "SHARED",
          studentEmail: null,
          acknowledgmentMethod: "STAFF_CALL",
          documentNamesGuardian: true,
          adultDeclaration: true,
          authorityDeclaration: true,
          verificationPermission: true,
          policyVersion: "guardian-verification-v1",
        },
      );
      const report = Buffer.concat([
        Buffer.from("89504e470d0a1a0a", "hex"),
        Buffer.from("Synthetic school report; no real child data"),
      ]).toString("base64");
      proof = await post(
        page.request,
        `/guardian-verifications/${proof.id}/evidence`,
        session.csrfToken,
        {
          expectedVersion: proof.version,
          mediaType: "image/png",
          contentBase64: report,
        },
      );
      proof = await post(
        page.request,
        `/guardian-verifications/${proof.id}/submissions`,
        session.csrfToken,
        { expectedVersion: proof.version, confirmed: true },
      );
      await expect
        .poll(
          async () => {
            const response = await page.request.get(
              "/api/v1/guardian-verifications/" + proof.id,
            );
            return (await response.json()).evidence.status;
          },
          { timeout: 45000 },
        )
        .toBe("CLEAN");
      const reviewer = await verifiedStaffSession(staff.request);
      proof = await post(
        staff.request,
        `/admin/guardian-verifications/${proof.id}/decisions`,
        reviewer.csrfToken,
        {
          expectedVersion: proof.version,
          decision: "APPROVE",
          reason: "Synthetic acceptance review only",
          reviewReference: "synthetic-qualification/" + randomUUID(),
          adultAndAuthorityChecked: true,
          documentNameMatched: true,
          studentAcknowledgmentObserved: true,
          callMethod: "PHONE",
          confirmed: true,
        },
      );
      expect(proof.status).toBe("APPROVED");
      expect(
        await db.consent.count({ where: { guardianId: session.account.id } }),
      ).toBe(0);
      await page.reload();
      await page.locator('.guardian-setup input[type="checkbox"]').check();
      await page
        .getByRole("button", { name: T("Agree and continue"), exact: true })
        .click();
      await page
        .getByRole("link", { name: T("Add learner profile"), exact: true })
        .click();
      await page
        .getByLabel(T("Learner name or alias"), { exact: true })
        .fill(learner);
      await page
        .getByLabel(T("Education stage"), { exact: true })
        .selectOption("SCHOOL");
      await page.getByLabel(T("Class"), { exact: true }).selectOption("8");
      await page.getByLabel(T("School board"), { exact: true }).fill("CBSE");
      await page
        .getByLabel(T("School / institution name"), { exact: true })
        .fill("Synthetic family school");
      await page
        .getByLabel(T("Subjects studied"), { exact: true })
        .fill("Maths, Science");
      await page
        .getByRole("button", { name: T("Review learner profile"), exact: true })
        .click();
      const savedProfile = page.waitForResponse(
        (r) =>
          r.url().endsWith("/learner-profiles") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", {
          name: T("Confirm and save profile"),
          exact: true,
        })
        .click();
      const saved = await savedProfile;
      expect(saved.status(), await saved.text()).toBe(201);
      const child = await db.child.findFirstOrThrow({
        where: { guardianId: session.account.id, alias: learner },
      });
      expect(child.guardianVerificationId).toBe(proof.id);
      expect(child.learningManagementMode).toBe("SHARED");
      const { teacher, csrf } = await teacherFixture(tc);
      await page.goto("/teachers");
      await page
        .getByRole("textbox", { name: T("Search teachers"), exact: true })
        .fill(teacher.name);
      await page.locator(`a[href="/teachers/${teacher.slug}"]`).first().click();
      await expect(
        page.getByRole("heading", { name: teacher.name, exact: true }),
      ).toBeVisible();
      const preferences = {
        timezone: "Asia/Kolkata",
        weekly: [{ weekday: 1, startMinute: 1020, endMinute: 1080 }],
      };
      const enquiry = await post(page.request, "/requests", session.csrfToken, {
        childId: child.id,
        alias: learner,
        discoveryMethod: "MANUAL",
        preferredTeacherId: teacher.id,
        subject: "Maths",
        mode: "ONLINE",
        language: "English",
        locality: "Shankar Nagar",
        budgetPaise: 300000,
        schedule: "Synthetic weekly availability",
        preferences,
      });
      const run = await post(
        staff.request,
        `/admin/requests/${enquiry.id}/recommendations`,
        reviewer.csrfToken,
        { expectedVersion: enquiry.version },
      );
      const candidate = run.items.find(
        (x: { teacherId: string }) => x.teacherId === teacher.id,
      );
      expect(candidate).toBeTruthy();
      await post(tc.request, `/candidates/${candidate.id}/responses`, csrf, {
        response: "ACCEPTED",
        expectedVersion: candidate.version,
      });
      await post(
        staff.request,
        `/admin/requests/${enquiry.id}/presentations`,
        reviewer.csrfToken,
        {
          expectedVersion: run.requestVersion,
          runId: run.runId,
          candidateIds: [candidate.id],
          reason: "Synthetic shortlist approval",
        },
      );
      const current = await db.tuitionRequest.findUniqueOrThrow({
          where: { id: enquiry.id },
        }),
        reply = await db.recommendation.findUniqueOrThrow({
          where: { id: candidate.id },
        });
      await post(
        page.request,
        `/requests/${enquiry.id}/selections`,
        session.csrfToken,
        {
          expectedVersion: current.version,
          candidateId: candidate.id,
          candidateVersion: reply.version,
        },
      );
      let arrangement = await post(
        page.request,
        "/placements",
        session.csrfToken,
        { requestId: enquiry.id, teacherId: teacher.id },
      );
      arrangement = await post(
        page.request,
        `/placements/${arrangement.id}/acceptances`,
        session.csrfToken,
        { expectedVersion: arrangement.version, action: "ACCEPT_TERMS" },
      );
      arrangement = await post(
        tc.request,
        `/placements/${arrangement.id}/acceptances`,
        csrf,
        { expectedVersion: arrangement.version, action: "ACCEPT_TERMS" },
      );
      expect(arrangement.guardianAccepted && arrangement.teacherAccepted).toBe(
        true,
      );
      expect(arrangement.guardianStarted).toBe(false);
      expect(await db.reservation.count({ where: { childId: child.id } })).toBe(
        0,
      );
      await page.goto("/support?placement=" + arrangement.id);
      await page
        .getByRole("button", { name: T("Create a case"), exact: true })
        .click();
      await page
        .getByLabel(T("Tell us what happened"), { exact: true })
        .fill("Synthetic guardian fit question");
      await page
        .getByRole("button", { name: T("Review request"), exact: true })
        .click();
      await page
        .getByRole("checkbox", {
          name: T("I reviewed this request and want to send it to support."),
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: T("Send support request"), exact: true })
        .click();
      await expect(
        page.getByText("Synthetic guardian fit question", { exact: true }),
      ).toBeVisible();
      await page.goto("/dashboard/arrangements?placement=" + arrangement.id);
      await page
        .getByLabel(T("Tuition arrangement"), { exact: true })
        .selectOption(arrangement.id);
      await page
        .getByRole("button", { name: T("Request a replacement"), exact: true })
        .click();
      await page
        .getByLabel(T("Reason for replacement"), { exact: true })
        .fill("Synthetic teaching preference changed");
      await page
        .getByLabel(T("Preferred day") + " 1", { exact: true })
        .selectOption("1");
      await page
        .getByRole("button", { name: T("Review decision"), exact: true })
        .click();
      await page
        .getByRole("checkbox", {
          name: T("I reviewed these effects and want to"),
          exact: false,
        })
        .check();
      await page
        .getByRole("button", {
          name: T("Confirm closure and replacement"),
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          db.tuitionRequest.count({
            where: { rematchFromPlacementId: arrangement.id },
          }),
        )
        .toBe(1);
      expect(
        (
          await db.placement.findUniqueOrThrow({
            where: { id: arrangement.id },
          })
        ).status,
      ).toBe("CLOSED");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (hindi) await checkHindi(page);
      await page.screenshot({
        path: `test-results/guardian-hiring-${language}-${hindi ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
    } finally {
      await staff.close();
      await tc.close();
    }
  });
