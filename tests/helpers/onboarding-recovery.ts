import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { teachers, teacherDetails } from "../../packages/test-fixtures/src";
import { hindiMessages } from "../../apps/web/app/hindi-messages";
const id = "10000000-0000-4000-8000-000000000991";
const teacherId = "30000000-0000-4000-8000-000000000991";
const privateProfile = {
  ...teachers[0],
  ...teacherDetails,
  id: teacherId,
  accountId: id,
  name: "Synthetic Teacher",
  slug: "onboarding-recovery",
  headline: "Saved teaching headline",
  boards: ["CBSE"],
  grades: [8],
  lockInDays: 0,
  consultationOptIn: false,
  status: "APPROVED",
  screeningComplete: true,
  screeningValidUntil: null,
  profileRevision: 1,
  feePolicyVersion: "development-v1",
  feeTermsAcceptedAt: "2026-10-17T00:00:00.000Z",
  region: "RAIPUR",
  version: 1,
  maxActiveStudents: 10,
  travelAccepted: false,
};
const education = {
  stage: "COLLEGE",
  institutionName: "Synthetic college",
  subjects: ["Physics"],
  courseName: "BSc Physics",
  university: "Synthetic university",
  studyYear: 2,
};
async function setup(
  page: Page,
  kind: "guardian" | "teacher" | "revision" | "independent",
  prefilled = false,
  initialFailure = 0,
) {
  let failure = initialFailure;
  let submitted = false;
  let handoffFailure = false;
  let writeFailure = false;
  let slow = false;
  let release = () => {};
  let gate = Promise.resolve();
  const writes: { path: string; key: string; body: unknown }[] = [];
  let progress = {
    kind: kind === "guardian" ? "PARENT" : "TEACHER",
    state: "DRAFT",
    draft: prefilled ? privateProfile : {},
    version: 0,
    completedResourceId: null as string | null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const context =
      (kind === "revision"
        ? path.endsWith("/revision-draft")
        : path ===
          `/api/v1/onboarding/${kind === "guardian" ? "parent" : "teacher"}`) ||
      (kind === "independent" &&
        path.endsWith("/independent-student/signup") &&
        req.method() === "GET");
    if (context && slow) await gate;
    if (context && failure) {
      return route.fulfill({
        status: failure,
        json: {
          code: "UNAVAILABLE",
          message: "Internal synthetic account detail",
        },
      });
    }
    if (req.method() !== "GET") {
      writes.push({
        path,
        key: req.headers()["idempotency-key"],
        body: req.postDataJSON(),
      });
      if (path.endsWith("/completions")) {
        submitted = true;
        progress = {
          ...progress,
          state: "READY",
          version: 1,
          completedResourceId: teacherId,
        };
        return route.fulfill({ status: 201, json: progress });
      }
      if (writeFailure) {
        writeFailure = false;
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic unknown save" },
        });
      }
      if (path.endsWith("/profile/updates"))
        return route.fulfill({
          status: 409,
          json: { code: "CONFLICT", message: "Profile changed" },
        });
      return route.fulfill({
        status: 201,
        json: path.endsWith("/consents")
          ? { accepted: true }
          : { ...progress, version: 1 },
      });
    }
    if (path.endsWith("/auth/session") && submitted && handoffFailure) {
      handoffFailure = false;
      return route.fulfill({
        status: 503,
        json: {
          code: "UNAVAILABLE",
          message: "Synthetic session check failed",
        },
      });
    }
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id,
            name: "Synthetic account",
            role:
              kind === "revision" || (kind === "teacher" && submitted)
                ? "TEACHER"
                : kind === "independent"
                  ? "INDEPENDENT_STUDENT"
                  : "GUARDIAN",
            verified: kind === "guardian",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/independent-student/signup"))
      return route.fulfill({
        json: {
          status: "COMPLETE",
          profile: {
            accountId: id,
            education,
            managementPreference: "SELF_DIRECTED",
            adultStatus: "SELF_DECLARED_18_PLUS",
            policyVersion: "independent-student-development-v1",
            consentedAt: "2026-10-17T00:00:00.000Z",
            version: 1,
            editStatus: "EDITABLE",
          },
        },
      });
    if (path.endsWith("/revision-draft"))
      return route.fulfill({
        json: { draft: {}, version: 0, applicationVersion: 1, stale: false },
      });
    if (path.endsWith("/onboarding/enquiry"))
      return route.fulfill({ json: { ...progress, kind: "ENQUIRY" } });
    if (
      path.endsWith("/onboarding/parent") ||
      path.endsWith("/onboarding/teacher")
    )
      return route.fulfill({ json: progress });
    if (path.endsWith("/dashboard"))
      return route.fulfill({ json: { profile: privateProfile } });
    if (path.endsWith("/children") || path.endsWith("/evidence"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/calendar"))
      return route.fulfill({ json: { patterns: [], exceptions: [] } });
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic unavailable" },
    });
  });
  await page.clock.install();
  await page.goto(
    kind === "guardian"
      ? "/onboarding/parent"
      : kind === "independent"
        ? "/onboarding/independent-student?edit=1"
        : "/onboarding/teacher",
  );
  await page.waitForLoadState("networkidle");
  return {
    writes,
    loseHandoff() {
      handoffFailure = true;
    },
    failNextWrite() {
      writeFailure = true;
    },
    fail(status: number, delayed = false) {
      failure = status;
      slow = delayed;
      if (delayed)
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
    },
    release() {
      slow = false;
      release();
    },
    async reconnect() {
      await page.clock.fastForward(16000);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    },
  };
}
export function onboardingRecoveryChecks() {
  test("learner profile focus follows committed changes and denied reads hide private fields", async ({
    page,
  }) => {
    let denied = false;
    await page.clock.install();
    const learner = {
      id: "20000000-0000-4000-8000-000000000991",
      alias: "Synthetic learner",
      education: {
        stage: "SCHOOL",
        grade: 8,
        board: "CBSE",
        institutionName: "Synthetic school",
        subjects: ["Maths"],
      },
      version: 1,
      editStatus: "EDITABLE",
      enquiryEligible: true,
    };
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      expect(route.request().method()).toBe("GET");
      if (path.endsWith("/auth/session"))
        return route.fulfill({
          json: {
            account: {
              id,
              name: "Synthetic guardian",
              role: "GUARDIAN",
              verified: true,
            },
            csrfToken: "synthetic-csrf",
          },
        });
      if (path.endsWith("/learner-profiles") && denied)
        return route.fulfill({
          status: 403,
          json: { code: "FORBIDDEN", message: "Synthetic access denied" },
        });
      if (path.endsWith("/learner-profiles"))
        return route.fulfill({
          json: { items: [learner], creationStatus: "READY", nextCursor: null },
        });
      if (path.endsWith("/learner-profiles/" + learner.id))
        return route.fulfill({ json: learner });
      return route.fulfill({
        status: 403,
        json: { code: "FORBIDDEN", message: "Unexpected read" },
      });
    });
    await page.goto("/dashboard/learners");
    await page
      .getByRole("button", {
        name: "Edit profile for Synthetic learner",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Edit education details",
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByLabel("Learner name or alias", { exact: true })
      .fill("Reviewed learner");
    await page
      .getByRole("button", { name: "Review learner profile", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Review the learner profile",
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Edit education details",
        exact: true,
      }),
    ).toBeFocused();
    await expect(
      page.getByLabel("Learner name or alias", { exact: true }),
    ).toHaveValue("Reviewed learner");
    denied = true;
    await page.clock.fastForward(16000);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      page.getByLabel("Learner name or alias", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Saved learner profiles", exact: true }),
    ).toHaveCount(0);
  });
  for (const kind of ["guardian", "teacher", "revision"] as const) {
    test(`${kind} first-read failure blocks form entry and recovers without exposing backend details`, async ({
      page,
    }) => {
      const s = await setup(page, kind, false, 503);
      if (kind === "revision")
        await page
          .getByRole("button", { name: "Edit application", exact: true })
          .click();
      const retry = page.getByRole("button", {
        name: kind === "revision" ? "Retry saved revision" : "Try again",
        exact: true,
      });
      await expect(retry).toBeVisible();
      await expect(page.locator("body")).not.toContainText(
        "Internal synthetic account detail",
      );
      await expect(
        page.getByLabel(
          kind === "guardian" ? "Learner alias" : "Teaching headline",
          { exact: true },
        ),
      ).toHaveCount(0);
      s.fail(0);
      await retry.click();
      if (kind === "guardian")
        await expect(
          page.getByRole("button", { name: "Agree and continue", exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByLabel("Teaching headline", { exact: true }),
        ).toBeVisible();
      expect(s.writes).toHaveLength(0);
    });
  }
  test("saved teacher application retries a failed workspace handoff without resubmitting", async ({
    page,
  }) => {
    const s = await setup(page, "teacher", true);
    for (const name of [
      "Continue to private address",
      "Continue to education & previous work",
      "Continue to teaching preferences",
      "Continue to review application",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
    }
    await page.getByRole("checkbox").check();
    s.loseHandoff();
    await page
      .getByRole("button", { name: "Submit teacher application", exact: true })
      .click();
    await expect(
      page.getByText(
        "Your application is saved, but we couldn’t open your teacher workspace. Try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open teacher workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your teacher workspace.",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      s.writes.filter((w) => w.path.endsWith("/completions")),
    ).toHaveLength(1);
  });
  test("an uncertain teacher draft keeps the exact retry identity through read recovery", async ({
    page,
  }) => {
    const s = await setup(page, "teacher");
    await page
      .getByLabel("Teaching headline", { exact: true })
      .fill("Reviewed teaching headline");
    await page
      .getByLabel("About your teaching", { exact: true })
      .fill("Patient explanations and worked examples.");
    await page
      .getByLabel("Years of teaching experience", { exact: true })
      .fill("4");
    s.failNextWrite();
    await page
      .getByRole("button", { name: "Continue to private address", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry saving progress", exact: true }),
    ).toBeVisible();
    s.fail(503);
    await s.reconnect();
    const retry = page.getByRole("button", {
      name: "Retry setup check",
      exact: true,
    });
    await expect(retry).toBeVisible();
    s.fail(0);
    await retry.click();
    await expect(retry).toHaveCount(0);
    await page
      .getByRole("button", { name: "Retry saving progress", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Private address", exact: true }),
    ).toBeVisible();
    expect(s.writes).toHaveLength(2);
    expect(s.writes[1]).toEqual(s.writes[0]);
  });
  for (const kind of ["guardian", "teacher", "revision"] as const) {
    test(`${kind} retains local onboarding edits through a failed refresh and a pending retry`, async ({
      page,
    }) => {
      const s = await setup(page, kind);
      if (kind === "guardian") {
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", { name: "Agree and continue", exact: true })
          .click();
      }
      if (kind === "revision")
        await page
          .getByRole("button", { name: "Edit application", exact: true })
          .click();
      const name = kind === "guardian" ? "Learner alias" : "Teaching headline";
      await page
        .getByLabel(name, { exact: true })
        .fill("Unsaved local onboarding edits");
      const count = s.writes.length;
      s.fail(503);
      await s.reconnect();
      const retry = page
        .getByRole("button", { name: "Retry setup check", exact: true })
        .last();
      await expect(retry).toBeVisible();
      await expect(page.getByLabel(name, { exact: true })).toHaveValue(
        "Unsaved local onboarding edits",
      );
      await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
      await expect(page.locator("body")).not.toContainText(
        "Internal synthetic account detail",
      );
      s.fail(503, true);
      await retry.click();
      await expect(retry).toBeDisabled();
      await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
      s.fail(0);
      s.release();
      await expect(retry).toHaveCount(0);
      await expect(page.getByLabel(name, { exact: true })).toHaveValue(
        "Unsaved local onboarding edits",
      );
      await expect(page.getByLabel(name, { exact: true })).toBeEnabled();
      expect(s.writes).toHaveLength(count);
    });
  }
  for (const kind of ["guardian", "teacher", "revision"] as const) {
    test(`${kind} removes cached onboarding details after access is denied`, async ({
      page,
    }) => {
      const s = await setup(page, kind);
      if (kind === "guardian") {
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", { name: "Agree and continue", exact: true })
          .click();
      }
      if (kind === "revision")
        await page
          .getByRole("button", { name: "Edit application", exact: true })
          .click();
      const name = kind === "guardian" ? "Learner alias" : "Teaching headline";
      await page
        .getByLabel(name, { exact: true })
        .fill("Private local onboarding edits");
      s.fail(403);
      await s.reconnect();
      await expect(page.getByLabel(name, { exact: true })).toHaveCount(0);
      await expect(
        page.locator("input[value='Private local onboarding edits']"),
      ).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(
        "Internal synthetic account detail",
      );
    });
  }
  test("independent student failed context reload keeps reviewed edits locked until recovery", async ({
    page,
  }) => {
    const s = await setup(page, "independent");
    await page
      .getByLabel("School / college name", { exact: true })
      .fill("Locally edited college");
    await page
      .getByRole("button", { name: "Review profile", exact: true })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Save profile changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Discard edits and reload",
        exact: true,
      }),
    ).toBeVisible();
    s.fail(503);
    await page
      .getByRole("button", { name: "Discard edits and reload", exact: true })
      .click();
    const retry = page.getByRole("button", {
      name: "Retry setup check",
      exact: true,
    });
    await expect(retry).toBeFocused();
    await expect(
      page.getByText("Locally edited college", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save profile changes", exact: true }),
    ).toBeDisabled();
    s.fail(0);
    await retry.click();
    await expect(retry).toHaveCount(0);
    expect(s.writes).toHaveLength(1);
  });
  test("Hindi recovery fits a phone and supports keyboard retry without losing teacher edits", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "bcs.interface-language", value: "hi", url: baseURL! },
    ]);
    await page.addInitScript(() =>
      localStorage.setItem("bcs.interface-language", "hi"),
    );
    await page.setViewportSize({ width: 360, height: 800 });
    const s = await setup(page, "teacher");
    const t = (text: string) => hindiMessages[text] || text;
    await page
      .getByLabel(t("Teaching headline"), { exact: true })
      .fill("Authored teaching headline");
    s.fail(503);
    await s.reconnect();
    const retry = page.getByRole("button", {
      name: t("Retry setup check"),
      exact: true,
    });
    await expect(retry).toBeFocused();
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
    await page.screenshot({
      path: "test-results/onboarding-recovery-hindi-mobile.png",
      fullPage: true,
    });
    s.fail(0);
    await page.keyboard.press("Enter");
    await expect(
      page.getByLabel(t("Teaching headline"), { exact: true }),
    ).toHaveValue("Authored teaching headline");
    await expect(
      page.getByLabel(t("Teaching headline"), { exact: true }),
    ).toBeEnabled();
  });
}
