import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { translateText } from "../../apps/web/app/locale";
import { enquiryText } from "../../apps/web/app/student-enquiry-copy";
import { checkHindi } from "../helpers/hindi";
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
// Labels locate controls only; the saved API/database outcomes below are asserted independently.
const legacyJourneyLabels: Record<string, string> = {
  "Shortlist published.": "निर्णय सहेजा गया। नीचे मौजूदा स्थिति देखें।",
  "Response recorded.": "निर्णय सहेजा गया। नीचे मौजूदा स्थिति देखें।",
  "How would you like to manage learning?":
    "आप अपनी पढ़ाई कैसे सँभालना चाहेंगे?",
  "I can manage my learning": "मैं अपनी पढ़ाई सँभाल सकता/सकती हूँ",
  "I declare that I am 18 or older":
    "मैं घोषणा करता/करती हूँ कि मेरी उम्र 18 वर्ष या अधिक है",
  "Continue to education": "पढ़ाई की जानकारी भरें",
  "Education stage": "पढ़ाई का स्तर",
  "School / college name": "स्कूल / कॉलेज का नाम",
  Class: "कक्षा",
  "School board": "स्कूल बोर्ड",
  "Subjects studied": "पढ़ने वाले विषय",
  "Review profile": "प्रोफ़ाइल की समीक्षा करें",
  "Create my student account": "मेरा विद्यार्थी खाता बनाएँ",
  "Your teacher shortlist": "आपके लिए चुने गए शिक्षक",
  "I reviewed this enquiry and want a fresh matching run.":
    "मैंने पूछताछ की समीक्षा की है और नया मिलान चाहता/चाहती हूँ।",
  "Run matching": "मिलान करें",
  "Add to published shortlist": "प्रकाशित सूची में जोड़ें",
  "Review this choice": "इस विकल्प की समीक्षा करें",
  "Publish reviewed shortlist": "समीक्षित सूची प्रकाशित करें",
  "I want to review hiring terms with this teacher.":
    "मैं इस शिक्षक के साथ शर्तों की समीक्षा करना चाहता/चाहती हूँ।",
  "Open hiring terms": "शर्तें देखें",
  "Review interest": "रुचि की समीक्षा करें",
  "I reviewed this response.": "मैंने इस जवाब की समीक्षा की है।",
  "Confirm response": "जवाब की पुष्टि करें",
  "Review your tuition arrangement": "ट्यूशन की व्यवस्था की समीक्षा करें",
  "Student side accepted": "विद्यार्थी पक्ष ने स्वीकारा",
  "Teacher accepted": "शिक्षक ने स्वीकारा",
  "Accept reviewed terms": "समीक्षित शर्तें स्वीकारें",
  "Show agreed contact email": "सहमत संपर्क ईमेल देखें",
  "Help and progress": "सहायता और प्रगति",
  "Request a different teacher": "दूसरा शिक्षक माँगें",
  Locality: "इलाका",
  "Monthly budget (₹)": "मासिक बजट (₹)",
  "Why do you need a replacement?": "शिक्षक क्यों बदलना चाहते हैं?",
  "Review replacement": "बदलाव की समीक्षा करें",
  "I reviewed the brief and want to request a different teacher.":
    "मैंने ज़रूरतें देखी हैं और दूसरा शिक्षक चाहता/चाहती हूँ।",
  "Confirm replacement request": "बदलाव के अनुरोध की पुष्टि करें",
  "Your name": "आपका नाम",
  "Email address": "ईमेल पता",
  "Send sign-in code": "साइन-इन कोड भेजें",
  "Six-digit code": "छह अंकों का कोड",
  "Verify and continue": "पुष्टि करके आगे बढ़ें",
  "I am 18 or older": "मैं 18 वर्ष या अधिक",
  "I accept these exact terms": "मैं ये शर्तें स्वीकार करता/करती हूँ।",
};
const journeyText = (hindi: boolean, value: string) =>
  hindi
    ? legacyJourneyLabels[value] ||
      (enquiryText(true, value) !== value && enquiryText(true, value)) ||
      (translateText(true, value) as string)
    : value;
async function journeyLocale(context: BrowserContext, hindi: boolean) {
  const language = hindi ? "hi" : "en";
  await context.addCookies([
    {
      name: "bcs.interface-language",
      value: language,
      url: "http://localhost:3000",
    },
  ]);
  await context.addInitScript(
    (language) => localStorage.setItem("bcs.interface-language", language),
    language,
  );
}
async function signupJourney(page: Page, hindi: boolean) {
  const T = (value: string) => journeyText(hindi, value);
  await journeyLocale(page.context(), hindi);
  const email = "full-journey-" + randomUUID() + "@example.test";
  await page.goto("/onboarding/independent-student");
  await page
    .getByLabel(T("Your name"), { exact: true })
    .fill("Synthetic complete journey");
  await page.getByLabel(T("Email address"), { exact: true }).fill(email);
  const requested = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: T("Send sign-in code"), exact: true })
    .click();
  const response = await requested;
  expect(response.status(), await response.text()).toBe(201);
  const challenge = await response.json();
  expect(challenge.status).toBe("SANDBOX");
  await page
    .getByLabel(T("Six-digit code"), { exact: true })
    .fill(challenge.developmentCode);
  await page
    .getByRole("button", { name: T("Verify and continue"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: T("How would you like to manage learning?"),
      exact: true,
    }),
  ).toBeVisible();
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  created.push(session.account.id);
  expect(session.account.verified).toBe(false);
  await page
    .getByRole("radio", { name: T("I can manage my learning"), exact: false })
    .check();
  await page
    .getByRole("radio", {
      name: T("I declare that I am 18 or older"),
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: T("Continue to education"), exact: true })
    .click();
  await page
    .getByLabel(T("Education stage"), { exact: true })
    .selectOption("SCHOOL");
  await page
    .getByLabel(T("School / college name"), { exact: true })
    .fill("Synthetic adult continuing education");
  await page.getByLabel(T("Class"), { exact: true }).selectOption("8");
  await page.getByLabel(T("School board"), { exact: true }).fill("CBSE");
  await page
    .getByLabel(T("Subjects studied"), { exact: true })
    .fill("Maths, Science");
  await page
    .getByRole("button", { name: T("Review profile"), exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: T("I am 18 or older"), exact: false })
    .check();
  await page
    .getByRole("button", { name: T("Create my student account"), exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const current = await (await page.request.get("/api/v1/auth/session")).json();
  expect(current.account.role).toBe("INDEPENDENT_STUDENT");
  await noOverflow(page);
  return { ...current.account, csrf: current.csrfToken };
}
for (const hindi of [false, true])
  for (const mobile of [false, true]) {
    test(`complete real hiring journey from OTP signup in ${hindi ? "Hindi" : "English"} on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
      browser,
    }) => {
      test.setTimeout(180000);
      page.setDefaultTimeout(15000);
      const T = (value: string) => journeyText(hindi, value);
      const viewport = mobile
        ? { width: 360, height: 800 }
        : { width: 1440, height: 1000 };
      await page.setViewportSize(viewport);
      const buyer = await signupJourney(page, hindi),
        tc = await browser.newContext({ baseURL: "http://localhost:3000" }),
        sc = await browser.newContext({ baseURL: "http://localhost:3000" });
      try {
        for (const c of [tc, sc]) {
          c.setDefaultTimeout(15000);
          await journeyLocale(c, hindi);
        }
        const ta = await identity(tc, "TEACHER"),
          teacher = await db.teacher.create({
            data: {
              accountId: ta.id,
              name: T("Journey specialist ") + randomUUID(),
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
        await page.goto("/teachers");
        await page
          .getByRole("textbox", { name: T("Search teachers"), exact: true })
          .fill(teacher.name);
        await page
          .locator(`a[href="/teachers/${teacher.slug}"]`)
          .first()
          .click();
        await expect(
          page.getByRole("heading", { name: teacher.name, exact: true }),
        ).toBeVisible();
        await noOverflow(page);
        await page
          .getByRole("link", {
            name: T("Enquire about this teacher"),
            exact: false,
          })
          .first()
          .click();
        await page
          .getByLabel(T("Subject you need help with"), { exact: true })
          .fill("Maths");
        await page
          .getByLabel(T("Teaching format"), { exact: true })
          .selectOption("ONLINE");
        await page
          .getByLabel(T("Teaching language"), { exact: true })
          .selectOption("English");
        await page
          .getByLabel(T("Your locality"), { exact: true })
          .fill("Shankar Nagar");
        await page
          .getByLabel(T("Monthly budget (₹)"), { exact: true })
          .fill("3000");
        await page
          .getByLabel(T("Preferred day") + " 1", { exact: true })
          .selectOption("1");
        await page
          .getByRole("button", { name: T("Review enquiry"), exact: true })
          .click();
        await noOverflow(page);
        await page
          .getByRole("checkbox", {
            name: T(
              "I reviewed my education and enquiry criteria and want to send this request.",
            ),
            exact: false,
          })
          .check();
        const posted = page.waitForResponse(
          (r) =>
            r.url().endsWith("/student-enquiries") &&
            r.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: T("Send my enquiry"), exact: true })
          .click();
        const response = await posted;
        expect(response.status(), await response.text()).toBe(201);
        const enq = await response.json();
        expect(enq).toMatchObject({
          discoveryMethod: "MANUAL",
          preferredTeacherId: teacher.id,
          status: "SUBMITTED",
        });
        await verifiedStaffSession(sc.request);
        const staff = await sc.newPage();
        await staff.setViewportSize(viewport);
        await staff.goto("/dashboard/student-enquiries?enquiry=" + enq.id);
        await staff
          .getByRole("checkbox", {
            name: T("I reviewed this enquiry and want a fresh matching run."),
          })
          .check();
        await staff
          .getByRole("button", { name: T("Run matching"), exact: true })
          .click();
        await staff
          .getByRole("checkbox", { name: T("Add to published shortlist") })
          .check();
        await staff
          .getByRole("button", { name: T("Publish reviewed shortlist") })
          .click();
        await expect(
          staff.getByText(T("Shortlist published."), { exact: true }),
        ).toBeVisible();
        const tp = await tc.newPage();
        await tp.setViewportSize(viewport);
        await tp.goto("/dashboard/student-opportunities");
        await tp.getByRole("button", { name: T("Review interest") }).click();
        await tp
          .getByRole("checkbox", { name: T("I reviewed this response.") })
          .check();
        await tp.getByRole("button", { name: T("Confirm response") }).click();
        await expect(
          tp.getByText(T("Response recorded."), { exact: true }),
        ).toBeVisible();
        await page.goto("/dashboard/enquiries?enquiry=" + enq.id);
        await page
          .getByRole("button", { name: T("Review this choice") })
          .click();
        await page
          .getByRole("checkbox", {
            name: T("I want to review hiring terms with this teacher."),
          })
          .check();
        await page
          .getByRole("button", { name: T("Open hiring terms") })
          .click();
        await expect(
          page.getByRole("heading", {
            name: T("Review your tuition arrangement"),
          }),
        ).toBeVisible();
        await page.screenshot({
          path: `test-results/journey-${hindi ? "hi" : "en"}-${mobile ? "mobile" : "desktop"}-terms.png`,
          fullPage: true,
        });
        const arrangement = new URL(page.url()).searchParams.get(
          "arrangement",
        )!;
        await page
          .getByRole("checkbox", {
            name: T("I accept these exact terms"),
            exact: false,
          })
          .check();
        await page
          .getByRole("button", { name: T("Accept reviewed terms") })
          .click();
        await expect(
          page.getByText(T("Student side accepted"), { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: T("Show agreed contact email") }),
        ).toHaveCount(0);
        await tp.goto(
          "/dashboard/student-arrangements?arrangement=" + arrangement,
        );
        await tp
          .getByRole("checkbox", {
            name: T("I accept these exact terms"),
            exact: false,
          })
          .check();
        await tp
          .getByRole("button", { name: T("Accept reviewed terms") })
          .click();
        await expect(
          tp.getByText(T("Teacher accepted"), { exact: true }),
        ).toBeVisible();
        await page.reload();
        await page
          .getByRole("button", { name: T("Show agreed contact email") })
          .click();
        await expect(
          page.getByRole("link", { name: ta.email!, exact: true }),
        ).toBeVisible();
        await page.setViewportSize(viewport);
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
          path: `test-results/journey-${hindi ? "hi" : "en"}-${mobile ? "mobile" : "desktop"}-confirmed.png`,
          fullPage: true,
        });
        await page
          .getByRole("link", { name: T("Help and progress"), exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: T("Help with this enquiry") }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: T("Create a case"), exact: true })
          .click();
        await page
          .getByLabel(T("Tell us what happened"))
          .fill("Synthetic private question about learning progress.");
        await page
          .getByRole("button", { name: T("Review request"), exact: true })
          .click();
        await page
          .getByRole("checkbox", {
            name: T("I reviewed this request and want to send it to support."),
            exact: false,
          })
          .check();
        await page
          .getByRole("button", { name: T("Send support request") })
          .click();
        await expect(
          page.getByText(
            T("Synthetic private question about learning progress."),
            {
              exact: true,
            },
          ),
        ).toBeVisible();
        await page.goto(
          "/dashboard/student-arrangements?arrangement=" + arrangement,
        );
        await page
          .getByRole("button", { name: T("Request a different teacher") })
          .click();
        await page
          .getByLabel(T("Locality"), { exact: true })
          .fill("Shankar Nagar");
        await page
          .getByLabel(T("Why do you need a replacement?"))
          .fill("Synthetic changed learning needs");
        await page
          .getByLabel(T("Preferred day") + " 1", { exact: true })
          .selectOption("1");
        await page
          .getByRole("button", { name: T("Review replacement"), exact: true })
          .click();
        await page
          .getByRole("checkbox", {
            name: T(
              "I reviewed the brief and want to request a different teacher.",
            ),
          })
          .check();
        await page
          .getByRole("button", { name: T("Confirm replacement request") })
          .click();
        await expect(page).toHaveURL(/student-enquiries\?enquiry=/);
        await expect(
          page.getByRole("heading", { name: T("Your teacher shortlist") }),
        ).toBeVisible();
        await noOverflow(page);
        if (hindi) {
          await checkHindi(page);
          await checkHindi(tp);
          await checkHindi(staff);
        }
        await page.screenshot({
          path: `test-results/journey-${hindi ? "hi" : "en"}-${mobile ? "mobile" : "desktop"}-replacement.png`,
          fullPage: true,
        });
        expect(
          await db.supportCase.count({
            where: { accountId: buyer.id, studentEnquiryId: enq.id },
          }),
        ).toBe(1);
        expect(
          await db.studentEnquiry.count({
            where: {
              studentAccountId: buyer.id,
              rematchFromArrangementId: arrangement,
            },
          }),
        ).toBe(1);
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
  }
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
