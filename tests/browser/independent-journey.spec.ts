import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppService } from "../../apps/api/src/shared";
import { verifiedStaffSession, cleanupStaffFixtures } from "./staff-fixture";
test.use({ trace: "off" });
const env = parseEnv(readFileSync(".env", "utf8"));
expect(env.APP_MODE).toBe("development");
expect(["localhost", "127.0.0.1"]).toContain(
  new URL(env.DATABASE_URL).hostname,
);
const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  }),
  created: string[] = [];
test.afterAll(async () => {
  await db.studentGuardianGrant.deleteMany({
    where: { studentAccountId: { in: created } },
  });
  await db.studentArrangement.updateMany({
    where: { studentAccountId: { in: created }, status: { not: "CLOSED" } },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closureReason: "Synthetic browser cleanup",
      version: { increment: 1 },
    },
  });
  await db.independentStudentProfile.deleteMany({
    where: { accountId: { in: created } },
  });
  await db.account.updateMany({
    where: { id: { in: created } },
    data: { disabled: true },
  });
  await db.session.updateMany({
    where: { accountId: { in: created } },
    data: { revoked: true },
  });
  await db.teacher.updateMany({
    where: { accountId: { in: created } },
    data: { status: "SUSPENDED", version: { increment: 1 } },
  });
  await db.$disconnect();
  await cleanupStaffFixtures();
});
async function identity(context: BrowserContext, role = "INDEPENDENT_STUDENT") {
  const account = await db.account.create({
    data: {
      name: "Synthetic " + role,
      email: "journey-" + randomUUID() + "@example.test",
      role,
    },
  });
  created.push(account.id);
  if (role === "INDEPENDENT_STUDENT")
    await db.independentStudentProfile.create({
      data: {
        accountId: account.id,
        education: {
          stage: "SCHOOL",
          grade: 8,
          board: "CBSE",
          subjects: ["Maths"],
          institutionName: "Private synthetic school",
        },
      },
    });
  const svc = new AppService();
  svc.db = db;
  const state = await svc.issueSession(account, randomUUID(), db);
  await context.addCookies([
    {
      name: "bcs_access",
      value: state.access,
      url: "http://localhost:3000/api/v1",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "bcs_refresh",
      value: state.refresh,
      url: "http://localhost:3000/api/v1",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return { ...account, csrf: state.csrf };
}
async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth
          ? null
          : {
              scroll: document.documentElement.scrollWidth,
              width: innerWidth,
              nodes: Array.from(document.querySelectorAll("body *"))
                .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
                .map((e) => ({
                  tag: e.tagName,
                  cls: String(e.className),
                  width: e.getBoundingClientRect().width,
                  right: e.getBoundingClientRect().right,
                }))
                .slice(0, 12),
            },
      ),
    )
    .toBeNull();
}
async function post(
  context: BrowserContext,
  path: string,
  csrf: string,
  data: unknown,
) {
  const r = await context.request.post("/api/v1" + path, {
    data,
    headers: {
      Origin: "http://localhost:3000",
      "X-CSRF-Token": csrf,
      "Idempotency-Key": randomUUID(),
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
test("real independent enquiry connects reviewed matching, teacher response, mutual terms, private support and replacement on desktop and mobile", async ({
  page,
  browser,
}) => {
  const buyer = await identity(page.context()),
    tc = await browser.newContext({ baseURL: "http://localhost:3000" }),
    sc = await browser.newContext({ baseURL: "http://localhost:3000" });
  try {
    const ta = await identity(tc, "TEACHER"),
      teacher = await db.teacher.create({
        data: {
          accountId: ta.id,
          name: "Synthetic learning teacher",
          slug: "journey-" + randomUUID(),
          headline: "Subject specialist",
          bio: "Synthetic browser qualification only",
          subjects: ["Maths"],
          grades: [8],
          boards: ["CBSE"],
          languages: ["English"],
          modes: ["ONLINE"],
          localities: [],
          monthlyPaise: 200000,
          status: "APPROVED",
          screeningComplete: true,
          screeningValidUntil: new Date(Date.now() + 90 * 86400000),
          maxActiveStudents: 1,
          lockInDays: 15,
          demoOptIn: true,
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
    const enq = await post(page.context(), "/student-enquiries", buyer.csrf, {
      expectedProfileVersion: 1,
      discoveryMethod: "MANUAL",
      preferredTeacherId: teacher.id,
      subject: "Maths",
      mode: "ONLINE",
      language: "English",
      locality: "Shankar Nagar",
      budgetPaise: 300000,
      preferences: {
        timezone: "Asia/Kolkata",
        weekly: [{ weekday: 1, startMinute: 1020, endMinute: 1080 }],
      },
      confirmed: true,
    });
    await verifiedStaffSession(sc.request);
    const staff = await sc.newPage();
    await staff.goto("/dashboard/student-enquiries?enquiry=" + enq.id);
    await staff
      .getByRole("checkbox", {
        name: "I reviewed this enquiry and want a fresh matching run.",
      })
      .check();
    await staff
      .getByRole("button", { name: "Run matching", exact: true })
      .click();
    await staff
      .getByRole("checkbox", { name: "Add to published shortlist" })
      .check();
    await staff
      .getByRole("button", { name: "Publish reviewed shortlist" })
      .click();
    await expect(
      staff.getByText("Shortlist published.", { exact: true }),
    ).toBeVisible();
    const tp = await tc.newPage();
    await tp.goto("/dashboard/student-opportunities");
    await tp.getByRole("button", { name: "Review interest" }).click();
    await tp
      .getByRole("checkbox", { name: "I reviewed this response." })
      .check();
    await tp.getByRole("button", { name: "Confirm response" }).click();
    await expect(
      tp.getByText("Response recorded.", { exact: true }),
    ).toBeVisible();
    await page.goto("/dashboard/enquiries?enquiry=" + enq.id);
    await page.getByRole("button", { name: "Review this choice" }).click();
    await page
      .getByRole("checkbox", {
        name: "I want to review hiring terms with this teacher.",
      })
      .check();
    await page.getByRole("button", { name: "Open hiring terms" }).click();
    await expect(
      page.getByRole("heading", { name: "Review your tuition arrangement" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/independent-hiring-terms-desktop.png",
      fullPage: true,
    });
    const arrangement = new URL(page.url()).searchParams.get("arrangement")!;
    await page
      .getByRole("checkbox", {
        name: "I accept these exact terms",
        exact: false,
      })
      .check();
    await page.getByRole("button", { name: "Accept reviewed terms" }).click();
    await expect(
      page.getByText("Student side accepted", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show agreed contact email" }),
    ).toHaveCount(0);
    await tp.goto("/dashboard/student-arrangements?arrangement=" + arrangement);
    await tp
      .getByRole("checkbox", {
        name: "I accept these exact terms",
        exact: false,
      })
      .check();
    await tp.getByRole("button", { name: "Accept reviewed terms" }).click();
    await expect(
      tp.getByText("Teacher accepted", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Show agreed contact email" })
      .click();
    await expect(
      page.getByRole("link", { name: ta.email!, exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
    expect(
      (
        await new AxeBuilder({ page })
          .include(".student-terms-panel")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "test-results/independent-hiring-confirmed-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Help and progress", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Help with this enquiry" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create a case", exact: true })
      .click();
    await page
      .getByLabel("Tell us what happened")
      .fill("Synthetic private question about learning progress.");
    await page
      .getByRole("button", { name: "Review request", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "I reviewed this request", exact: false })
      .check();
    await page.getByRole("button", { name: "Send support request" }).click();
    await expect(
      page.getByText("Synthetic private question about learning progress.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(
      "/dashboard/student-arrangements?arrangement=" + arrangement,
    );
    await page
      .getByRole("button", { name: "Request a different teacher" })
      .click();
    await page.getByLabel("Locality", { exact: true }).fill("Shankar Nagar");
    await page
      .getByLabel("Why do you need a replacement?")
      .fill("Synthetic changed learning needs");
    await page.getByLabel("Preferred day 1", { exact: true }).selectOption("1");
    await page
      .getByRole("button", { name: "Review replacement", exact: true })
      .click();
    await page
      .getByRole("checkbox", {
        name: "I reviewed the brief and want to request a different teacher.",
      })
      .check();
    await page
      .getByRole("button", { name: "Confirm replacement request" })
      .click();
    await expect(page).toHaveURL(/student-enquiries\?enquiry=/);
    await expect(
      page.getByRole("heading", { name: "Your teacher shortlist" }),
    ).toBeVisible();
    expect(
      await db.studentArrangement.findUniqueOrThrow({
        where: { id: arrangement },
      }),
    ).toMatchObject({ status: "CLOSED" });
  } finally {
    await tc.close();
    await sc.close();
  }
});
test("real optional supporter acceptance, shared education and immediate revocation preserve adult account ownership", async ({
  page,
  browser,
}) => {
  const student = await identity(page.context()),
    gc = await browser.newContext({ baseURL: "http://localhost:3000" });
  try {
    const g = await identity(gc, "GUARDIAN");
    await page.goto("/dashboard/student-supporters");
    await page.getByRole("button", { name: "Invite a supporter" }).click();
    await page.getByLabel("Supporter’s account email").fill(g.email!);
    await page.getByLabel("Permission", { exact: true }).selectOption("MANAGE");
    await page
      .getByRole("button", { name: "Review invitation", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "I trust this person", exact: false })
      .check();
    await page.getByRole("button", { name: "Create invitation" }).click();
    await expect(
      page.getByRole("heading", { name: g.email!, exact: true }),
    ).toBeVisible();
    const gp = await gc.newPage();
    await gp.goto("/dashboard/supported-students");
    await gp
      .getByRole("button", { name: "Review invitation", exact: true })
      .click();
    await gp
      .getByRole("checkbox", { name: "I understand this decision." })
      .check();
    await gp.getByRole("button", { name: "Confirm decision" }).click();
    await gp
      .getByRole("link", { name: "Open shared learning profile" })
      .click();
    await expect(
      gp.getByRole("heading", { name: "Shared learning profile" }),
    ).toBeVisible();
    await gp.getByRole("button", { name: "Edit shared education" }).click();
    await gp
      .getByLabel("School / college name", { exact: true })
      .fill("Updated synthetic school");
    await gp
      .getByRole("button", { name: "Review profile", exact: true })
      .click();
    await gp
      .getByRole("checkbox", { name: "I reviewed and confirm these changes." })
      .check();
    await gp.getByRole("button", { name: "Save profile changes" }).click();
    await expect(
      gp.getByText("Updated synthetic school", { exact: true }),
    ).toBeVisible();
    await gp.setViewportSize({ width: 360, height: 800 });
    await noOverflow(gp);
    await gp.screenshot({
      path: "test-results/independent-supporter-mobile.png",
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("button", { name: "Remove access" }).click();
    await page
      .getByRole("checkbox", { name: "I understand this decision." })
      .check();
    await page.getByRole("button", { name: "Confirm decision" }).click();
    await gp.reload();
    await expect(
      gp.getByText("Access is unavailable or has been revoked.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: student.id } })).role,
    ).toBe("INDEPENDENT_STUDENT");
    expect(await db.child.count({ where: { guardianId: g.id } })).toBe(0);
    const advice = await post(
      page.context(),
      "/student-guardian-grants",
      student.csrf,
      {
        email: g.email,
        supportMode: "ADVICE",
        expectedPendingVersion: 0,
        confirmed: true,
      },
    );
    await post(
      gc,
      "/student-guardian-grants/" + advice.id + "/decisions",
      g.csrf,
      { expectedVersion: 1, action: "ACCEPT", confirmed: true },
    );
    const enquiry = await post(
      page.context(),
      "/student-enquiries",
      student.csrf,
      {
        expectedProfileVersion: 2,
        discoveryMethod: "ASSISTED",
        subject: "Maths",
        mode: "ONLINE",
        language: "English",
        locality: "Shankar Nagar",
        budgetPaise: 300000,
        preferences: {
          timezone: "Asia/Kolkata",
          weekly: [{ weekday: 1, startMinute: 1020, endMinute: 1080 }],
        },
        confirmed: true,
      },
    );
    await gp.goto(
      "/dashboard/student-enquiries?student=" +
        student.id +
        "&enquiry=" +
        enquiry.id,
    );
    await expect(
      gp.getByRole("heading", { name: "Your teacher shortlist", exact: true }),
    ).toBeVisible();
    await expect(
      gp.getByRole("link", { name: "New teacher enquiry", exact: true }),
    ).toHaveCount(0);
    await expect(
      gp.getByRole("button", { name: "Withdraw enquiry", exact: true }),
    ).toHaveCount(0);
    await expect(
      gp.getByRole("link", { name: "Help and progress", exact: true }),
    ).toHaveAttribute("href", "/support");
  } finally {
    await gc.close();
  }
});
test("real independent device names survive reload and signing out this device returns to sign-in", async ({
  page,
}) => {
  await identity(page.context());
  await page.goto("/dashboard/student-devices");
  await page.getByRole("button", { name: "Name device", exact: true }).click();
  await page.getByLabel("Device name (optional)").fill("My study laptop");
  await page.getByRole("checkbox", { name: "I reviewed this change." }).check();
  await page.getByRole("button", { name: "Save device name" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My study laptop" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign out device", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "I reviewed this change." }).check();
  await page.getByRole("button", { name: "Confirm sign-out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
});
test("Hindi enquiry validation, mobile support choices and typography remain usable without submitting invalid criteria", async ({
  page,
}) => {
  await identity(page.context());
  await page.goto("/dashboard/enquiries?new=1");
  await page.getByRole("button", { name: "Switch English and Hindi" }).click();
  await expect(
    page.getByRole("heading", { name: "हमें आपके लिए खोजने दें", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "पूछताछ की समीक्षा करें", exact: true })
    .click();
  await expect(
    page.getByText("अधिकतम 60 अक्षरों में विषय लिखें।"),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/independent-enquiry-hindi-mobile.png",
    fullPage: true,
  });
  await page.goto("/dashboard/student-supporters");
  await expect(
    page.getByRole("heading", { name: "पढ़ाई में मदद चुनें" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".student-workspace")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
