import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator, validator } from "../helpers/contract";
test.use({ trace: "off" });
const education = {
  stage: "COLLEGE",
  institutionName: "Synthetic college",
  subjects: ["Physics", "Maths"],
  courseName: "BSc Physics",
  university: "Synthetic university",
  studyYear: 2,
};
const profile = {
  accountId: "10000000-0000-4000-8000-000000000989",
  education,
  managementPreference: "SELF_DIRECTED",
  adultStatus: "SELF_DECLARED_18_PLUS",
  policyVersion: "independent-student-development-v1",
  consentedAt: "2026-10-16T00:00:00.000Z",
  version: 1,
  editStatus: "EDITABLE",
};
async function mock(page: Page, mode = "normal") {
  let signedUp = mode === "complete";
  const bodies: any[] = [],
    keys: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: profile.accountId,
            name: "Synthetic student",
            role: signedUp ? "INDEPENDENT_STUDENT" : "GUARDIAN",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/independent-student/signup") && req.method() === "GET")
      return route.fulfill({
        json: {
          status:
            mode === "used"
              ? "ACCOUNT_IN_USE"
              : signedUp
                ? "COMPLETE"
                : "READY",
          profile: signedUp ? profile : null,
        },
      });
    if (path.endsWith("/independent-student/profile"))
      return route.fulfill({ json: profile });
    if (
      path.endsWith("/independent-student/signup") &&
      req.method() === "POST"
    ) {
      const body = req.postDataJSON();
      expect(validator("IndependentStudentSignup")(body)).toBe(true);
      bodies.push(body);
      keys.push(req.headers()["idempotency-key"]);
      if (mode === "retry" && bodies.length === 1)
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic lost result" },
        });
      signedUp = true;
      expect(
        operationValidator(
          "/independent-student/signup",
          "post",
          "201",
        )(profile),
      ).toBe(true);
      return route.fulfill({ status: 201, json: profile });
    }
    return route.fulfill({
      status: 403,
      json: {
        code: "FORBIDDEN",
        message: "Unexpected private request: " + path,
      },
    });
  });
  return { bodies, keys };
}
async function chooseReadiness(page: Page) {
  await page
    .getByRole("radio", { name: "I can manage my learning", exact: false })
    .check();
  await page
    .getByRole("radio", {
      name: "I declare that I am 18 or older",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Continue to education" }).click();
}
async function fillCollege(page: Page) {
  await page
    .getByLabel("Education stage", { exact: true })
    .selectOption("COLLEGE");
  await page
    .getByLabel("School / college name", { exact: true })
    .fill(education.institutionName);
  await page
    .getByLabel("Course / degree", { exact: true })
    .fill(education.courseName);
  await page
    .getByLabel("University / awarding institution", { exact: true })
    .fill(education.university);
  await page.getByLabel("Current year of study", { exact: true }).fill("2");
  await page
    .getByLabel("Subjects studied", { exact: true })
    .fill("Physics, Maths");
}
test("real email OTP creates and resumes a private independent student account, with editable education and privacy access", async ({
  page,
}) => {
  const forbiddenReads: string[] = [];
  page.on("request", (req) => {
    if (
      req.method() === "GET" &&
      /\/api\/v1\/(dashboard(?:\/hiring)?|children|onboarding\/guardian)$/.test(
        new URL(req.url()).pathname,
      )
    )
      forbiddenReads.push(req.url());
  });
  const email = `independent-${crypto.randomUUID()}@example.test`;
  await page.goto("/onboarding/independent-student");
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Synthetic independent learner");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const requested = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  const challenge = await (await requested).json();
  expect(challenge.status).toBe("SANDBOX");
  await page
    .getByLabel("Six-digit code", { exact: true })
    .fill(challenge.developmentCode);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("heading", {
      name: "How would you like to manage learning?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to education" }),
  ).toBeDisabled();
  await chooseReadiness(page);
  await fillCollege(page);
  await page
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your student profile" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Create my student account" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/independent-student-review-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "I am 18 or older", exact: false })
    .check();
  await page.getByRole("button", { name: "Create my student account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "My education", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("BSc Physics · Year 2", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Student enquiries record your criteria for staff review.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Edit my education", exact: true })
    .click();
  await page.getByLabel("Current year of study", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed and confirm these changes.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save profile changes" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText("BSc Physics · Year 3", { exact: true }),
  ).toBeVisible();
  const auth = await page.request.get("/api/v1/auth/session");
  const state = await auth.json();
  expect(state.account.role).toBe("INDEPENDENT_STUDENT");
  expect(state.account.verified).toBe(false);
  await page
    .getByRole("link", { name: "Account privacy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create privacy request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create privacy request", exact: true })
    .click();
  await page
    .getByLabel("Reason for request", { exact: true })
    .fill("Correct the display name on my own account");
  await page
    .getByLabel("Proposed display name or learner alias", { exact: true })
    .fill("Synthetic corrected learner");
  await page
    .getByRole("button", { name: "Review privacy request", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "I reviewed the record", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Send privacy request", exact: true })
    .click();
  await expect(
    page.getByText("Your privacy request is recorded for review.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  await expect(page.getByLabel("Your name", {exact:true})).toHaveCount(0);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const secondCode = page.waitForResponse(
    (r) =>
      r.url().endsWith("/auth/otp/request") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page
    .getByLabel("Six-digit code", { exact: true })
    .fill((await (await secondCode).json()).developmentCode);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText("BSc Physics · Year 3", { exact: true }),
  ).toBeVisible();
  await page.goto("/teachers?tab=assisted");
  await expect(
    page.getByText("Tell us what would work for your learning.", {
      exact: false,
    }),
  ).toBeVisible();
  const catalog = await (
    await page.request.get("/api/v1/teachers?limit=1")
  ).json();
  await page.goto("/teachers/" + catalog.items[0].slug);
  await expect(
    page.getByText("Your teacher interest is recorded for staff review.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Enquire about this teacher",
      exact: false,
    }),
  ).toHaveAttribute("href", /\/dashboard\/enquiries\?new=1&teacher=/);
  expect(forbiddenReads).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k !== "bcs.interface-language"),
    ),
  ).toEqual([]);
});
test("guardian-guided and under-18 choices never expose independent education intake or submit signup", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/onboarding/independent-student");
  await page
    .getByRole("radio", { name: "I need a guardian to guide me", exact: false })
    .check();
  await expect(
    page.getByRole("button", { name: "Continue to education" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Let your guardian take the next step",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "I can manage my learning", exact: false })
    .check();
  await page.getByRole("radio", { name: "I am under 18", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Continue to education" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("School / college name", { exact: true }),
  ).toHaveCount(0);
  expect(state.bodies).toEqual([]);
});
test("mobile signup validates school details and retries exactly the reviewed request after an unknown result", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await mock(page, "retry");
  await page.goto("/onboarding/independent-student");
  await chooseReadiness(page);
  await page
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await expect(
    page.getByLabel("Education stage", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Education stage", { exact: true })
    .selectOption("SCHOOL");
  await page
    .getByLabel("School / college name", { exact: true })
    .fill("Synthetic senior school");
  await page.getByLabel("Class", { exact: true }).selectOption("12");
  await page.getByLabel("School board", { exact: true }).fill("CBSE");
  await page
    .getByLabel("Subjects studied", { exact: true })
    .fill("Maths, Maths");
  await page
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await expect(
    page.getByLabel("Subjects studied", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Subjects studied", { exact: true })
    .fill("Maths, Physics");
  await page.screenshot({
    path: "test-results/independent-student-education-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page }).include("main").analyze();
  expect(axe.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Review profile", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "I am 18 or older", exact: false })
    .check();
  await page.getByRole("button", { name: "Create my student account" }).click();
  await expect(
    page.getByRole("button", { name: "Retry same save" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit education", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry same save" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(state.bodies).toHaveLength(2);
  expect(state.bodies[1]).toEqual(state.bodies[0]);
  expect(state.keys[1]).toBe(state.keys[0]);
});
test("Hindi readiness and existing-account recovery remain clear on narrow phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await mock(page);
  await page.goto("/onboarding/independent-student");
  await page.getByLabel("Language", { exact: true }).selectOption("hi");
  await expect(page.locator("main")).toHaveAttribute("lang", "hi");
  await page
    .getByRole("radio", {
      name: "मैं अपनी पढ़ाई सँभाल सकता/सकती हूँ",
      exact: false,
    })
    .check();
  await page
    .getByRole("radio", { name: "मैं घोषणा करता/करती हूँ", exact: false })
    .check();
  await page
    .getByRole("button", { name: "पढ़ाई की जानकारी भरें", exact: true })
    .click();
  await page
    .getByRole("button", { name: "प्रोफ़ाइल की समीक्षा करें", exact: true })
    .click();
  await expect(
    page.getByText("यह जानकारी भरें।", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/independent-student-hindi-mobile.png",
    fullPage: true,
  });
  await page.unrouteAll();
  await mock(page, "used");
  await page.reload();
  await expect(
    page.getByText("इस ईमेल पर पहले से दूसरा सेटअप है।", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "पढ़ाई की जानकारी भरें", exact: true }),
  ).toHaveCount(0);
});

test("completed signup resumes without submitting another account creation", async ({
  page,
}) => {
  const state = await mock(page, "complete");
  await page.goto("/onboarding/independent-student");
  await expect(
    page.getByRole("heading", {
      name: "Your student account is ready",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Create my student account",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open my dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "My education", exact: true }),
  ).toBeVisible();
  expect(state.bodies).toEqual([]);
});
