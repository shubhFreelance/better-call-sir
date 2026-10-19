import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoFixtureRow } from "./demo-history";
import { validator, operationValidator } from "./contract";
import { chooseHindi, checkHindi } from "./hindi";
const learner = "50000000-0000-4000-8000-000000000821",
  actor = "10000000-0000-4000-8000-000000000821",
  guardian = "10000000-0000-4000-8000-000000000822",
  enquiryId = "20000000-0000-4000-8000-000000000821";
async function fixture(
  page: Page,
  options: {
    role?: string;
    mode?: string;
    uncertain?: boolean;
    readFailure?: boolean;
    history?: boolean;
    demo?: boolean;
    manual?: boolean;
  } = {},
) {
  const role = options.role || "GUARDIAN";
  let mode = options.mode || "GUARDIAN_ONLY",
    version = 1,
    fail = false,
    aborted = false;
  const writes: any[] = [],
    receipts = new Map(),
    now = new Date().toISOString();
  const child = {
    id: learner,
    guardianId: guardian,
    alias: "Synthetic Learner",
    grade: 8,
    board: "CBSE",
    schoolName: "Synthetic School",
    schoolSubjects: ["Maths", "Science"],
    educationStage: "SCHOOL",
    earlyYearsLevel: null,
    courseName: null,
    university: null,
    studyYear: null,
    studentAccountId: actor,
    studentAccessRevokedAt: null,
    guardianVerificationId: null,
    version: 1,
  };
  const profile = {
    id: learner,
    alias: child.alias,
    education: {
      stage: "SCHOOL",
      institutionName: child.schoolName,
      subjects: child.schoolSubjects,
      grade: 8,
      board: "CBSE",
    },
    version: 1,
    enquiryEligible: true,
  };
  let rows: any[] = options.history
    ? [
        {
          id: enquiryId,
          guardianId: guardian,
          childId: learner,
          discoveryMethod: "ASSISTED",
          preferredTeacherId: null,
          subject: "Maths",
          mode: "ONLINE",
          language: "English",
          locality: "Raipur",
          budgetPaise: 300000,
          schedule: "Synthetic weekly preference",
          region: "Raipur",
          schedulePreferences: {
            timezone: "Asia/Kolkata",
            weekly: [{ weekday: 1, startMinute: 960, endMinute: 1020 }],
          },
          scheduleStatus: "CONFIRMED",
          matchStatus: "PENDING",
          selectedCandidateId: null,
          rematchFromPlacementId: null,
          guardianDecisionRequested: false,
          status: "OPEN",
          version: 1,
          createdAt: now,
        },
      ]
    : [];
  const demo = demoFixtureRow(821);
  demo.requestId = enquiryId;
  demo.guardianId = guardian;
  demo.reservation.guardianId = guardian;
  const publicTeacher = {
    id: demo.teacherId,
    slug: "synthetic-teacher",
    name: "Synthetic Teacher",
    headline: "Synthetic tutor",
    bio: "Synthetic teacher profile",
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["English"],
    modes: ["ONLINE"],
    localities: ["Raipur"],
    monthlyPaise: 200000,
    experience: 3,
    avatarColor: "#034F46",
    demoAvailable: true,
    lockInDays: 15,
    capabilityLabel: "Reviewed subject coverage",
    consultationOptIn: false,
    teachingCoverage: [
      { stage: "SCHOOL", subject: "Maths", grade: 8, board: "CBSE" },
    ],
  };
  const management = () => ({
    childId: learner,
    mode,
    version,
    canManageLearning: role === "GUARDIAN" || mode !== "GUARDIAN_ONLY",
    canChangeManagement: role === "GUARDIAN",
    canManageConsent: role === "GUARDIAN",
    canConfirmFinancialCommencement: role === "GUARDIAN",
  });
  const checked = (name: string, value: any) => {
    const v = validator(name);
    expect(v(value), JSON.stringify(v.errors)).toBe(true);
    return value;
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      p = new URL(req.url()).pathname,
      method = req.method();
    if (p.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: actor,
            name: "Synthetic Account",
            role,
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (method === "GET") {
      if (
        fail &&
        (p.endsWith("/learning-management") || p.endsWith("/requests"))
      )
        return route.fulfill({
          status: 403,
          json: {
            code: "FORBIDDEN",
            message: "Synthetic backend private detail",
          },
        });
      if (p.endsWith("/learner-profiles"))
        return route.fulfill({
          json: checked("LearnerProfiles", {
            creationStatus: role === "STUDENT" ? "READ_ONLY" : "READY",
            items: [profile],
            nextCursor: null,
          }),
        });
      if (p.endsWith(`/learner-profiles/${learner}`))
        return route.fulfill({
          json: checked("LearnerProfile", {
            ...profile,
            editStatus: "EDITABLE",
          }),
        });
      if (p.endsWith("/learning-management"))
        return route.fulfill({
          json: checked("LearningManagement", management()),
        });
      if (p.endsWith("/dashboard"))
        return route.fulfill({
          json: {
            role,
            children: [child],
            placements: [],
            teachers: [],
            lessons: [],
            metrics: {},
          },
        });
      if (p.endsWith("/requests"))
        return route.fulfill({
          json: checked("RequestList", { items: rows, nextCursor: null }),
        });
      const current = rows.find((r) => p.endsWith("/requests/" + r.id));
      if (current)
        return route.fulfill({
          json: checked("TuitionRequestDetails", {
            ...current,
            candidates: [],
          }),
        });
      if (p.endsWith("/teachers/synthetic-teacher"))
        return route.fulfill({ json: checked("Teacher", publicTeacher) });
      if (p.endsWith("/demos") && options.demo)
        return route.fulfill({ json: { items: [demo], nextCursor: null } });
      if (p.endsWith("/demos") || p.endsWith("/teachers"))
        return route.fulfill({ json: { items: [], nextCursor: null } });
      return route.fulfill({ json: { items: [] } });
    }
    const body = req.postDataJSON(),
      key = req.headers()["idempotency-key"];
    writes.push({ path: p, body, key });
    let value = receipts.get(key);
    if (!value) {
      if (p.endsWith("/learning-management")) {
        expect(role).toBe("GUARDIAN");
        expect(body.expectedVersion).toBe(version);
        mode = body.mode;
        version++;
        value = checked("LearningManagement", management());
      } else if (p.endsWith("/decision-authority")) {
        expect(body.expectedVersion).toBe(rows[0].version);
        rows[0] = {
          ...rows[0],
          guardianDecisionRequested: body.guardianDecisionRequested,
          version: rows[0].version + 1,
        };
        value = checked("TuitionRequest", rows[0]);
      } else if (p.endsWith(`/learner-profiles/${learner}/updates`)) {
        expect(body.alias).toBe(profile.alias);
        expect(body.expectedVersion).toBe(profile.version);
        profile.education = body.education;
        profile.version++;
        value = checked("LearnerProfile", {
          ...profile,
          editStatus: "EDITABLE",
        });
      } else if (p.endsWith(`/demos/${demo.id}/acceptances`)) {
        demo.guardianAccepted = true;
        demo.version++;
        value = checked("Demo", demo);
      } else if (p.endsWith("/requests")) {
        value = {
          id: enquiryId,
          guardianId: guardian,
          region: "Raipur",
          status: "OPEN",
          matchStatus: "PENDING",
          scheduleStatus: "CONFIRMED",
          version: 1,
          createdAt: now,
          preferredTeacherId: null,
          selectedCandidateId: null,
          rematchFromPlacementId: null,
          guardianDecisionRequested: false,
          schedulePreferences: body.preferences,
          ...body,
        };
        delete value.preferences;
        delete value.alias;
        delete value.grade;
        delete value.board;
        rows = [value];
        checked("TuitionRequest", value);
      } else throw new Error("Unexpected learning mutation " + p);
      receipts.set(key, value);
      if (options.readFailure) fail = true;
    }
    if (options.uncertain && !aborted) {
      aborted = true;
      return route.abort("failed");
    }
    return route.fulfill({ status: 201, json: value });
  });
  return {
    writes,
    restore: () => {
      fail = false;
    },
    management,
  };
}
async function reviewMode(page: Page) {
  await page
    .getByRole("button", { name: "Review management choice", exact: true })
    .click();
  await page.getByLabel("Student leads; guardian stays involved").check();
  await page
    .getByRole("button", { name: "Review this choice", exact: true })
    .click();
  await page
    .getByLabel(
      "I reviewed this permission and how it affects the student's learning decisions.",
    )
    .check();
  await page
    .getByRole("button", { name: "Confirm management choice", exact: true })
    .click();
}
export function learningManagementTests() {
  test("guardian reviews a mode change and the API records the exact permission separately from consent", async ({
    page,
  }) => {
    const f = await fixture(page);
    await page.goto("/dashboard/learning-management");
    await expect(
      page.getByRole("heading", { name: "Who manages learning?", exact: true }),
    ).toBeVisible();
    await reviewMode(page);
    await expect(
      page.getByText(
        "Learning management saved. The student will see this choice.",
      ),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].body).toEqual({
      mode: "STUDENT_LED",
      expectedVersion: 1,
      confirmed: true,
    });
    expect(f.writes[0].key).toBeTruthy();
  });
  test("a student sees the guardian choice without being offered a management override", async ({
    page,
  }) => {
    const f = await fixture(page, { role: "STUDENT", mode: "SHARED" });
    await page.goto("/dashboard/learning-management");
    await expect(
      page.getByRole("heading", {
        name: "We manage learning together",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Review management choice",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Open my teacher choices" }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(0);
  });
  test("uncertain management changes freeze the editor and retry the same committed body and key", async ({
    page,
  }) => {
    const f = await fixture(page, { uncertain: true });
    await page.goto("/dashboard/learning-management");
    await reviewMode(page);
    await expect(
      page.getByRole("button", {
        name: "Retry the same decision",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Discard changes", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry the same decision", exact: true })
      .click();
    await expect(
      page.getByText(
        "Learning management saved. The student will see this choice.",
      ),
    ).toBeVisible();
    expect(f.writes).toHaveLength(2);
    expect(f.writes[1]).toEqual(f.writes[0]);
    expect(f.management().version).toBe(2);
  });
  test("a saved management choice survives denied reads without another write or private review text", async ({
    page,
  }) => {
    const f = await fixture(page, { readFailure: true });
    await page.goto("/dashboard/learning-management");
    await reviewMode(page);
    await expect(
      page.getByText(
        "Current learning permissions could not be loaded. Private details are hidden.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic backend private detail"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Student leads; guardian stays involved",
        exact: true,
      }),
    ).toHaveCount(0);
    f.restore();
    await page
      .getByRole("button", { name: "Reload learning permissions", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Student leads; guardian stays involved",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
  });
  test("guardian-only students follow owned enquiries and cannot start a delegated teacher search", async ({
    page,
  }) => {
    const f = await fixture(page, { role: "STUDENT", history: true });
    await page.goto("/dashboard/learning-choices");
    await expect(
      page.getByRole("heading", { name: "My teacher choices", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Find a teacher for another subject",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Ask guardian to decide", exact: true }),
    ).toBeDisabled();
    expect(f.writes).toHaveLength(0);
  });
  test("a permitted student can ask a guardian to decide for one enquiry and resume without changing standing permissions", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "STUDENT",
      mode: "SHARED",
      history: true,
    });
    await page.goto("/dashboard/learning-choices");
    await page
      .getByRole("button", { name: "Ask guardian to decide", exact: true })
      .click();
    await page
      .getByLabel("I reviewed who will make this enquiry's learning decisions.")
      .check();
    await page
      .getByRole("button", { name: "Confirm enquiry preference", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Your guardian is deciding for this enquiry",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Resume my learning decisions",
        exact: true,
      })
      .click();
    await page
      .getByLabel("I reviewed who will make this enquiry's learning decisions.")
      .check();
    await page
      .getByRole("button", { name: "Confirm enquiry preference", exact: true })
      .click();
    expect(f.writes.map((x) => x.body.guardianDecisionRequested)).toEqual([
      true,
      false,
    ]);
    expect(f.management().mode).toBe("SHARED");
  });
  test("Hindi family management fits phones, preserves radio keyboard focus and has accessible labels", async ({
    page,
  }) => {
    await chooseHindi(page);
    await fixture(page);
    await page.goto("/dashboard/learning-management");
    await page
      .getByRole("button", {
        name: "पढ़ाई के प्रबंधन का विकल्प देखें",
        exact: true,
      })
      .click();
    const shared = page.getByRole("radio", {
      name: /हम दोनों मिलकर पढ़ाई सँभालते हैं/,
    });
    await shared.focus();
    await shared.press("Space");
    await expect(shared).toBeFocused();
    await shared.press("ArrowRight");
    await expect(
      page.getByRole("radio", { name: /विद्यार्थी आगे बढ़ता है/ }),
    ).toBeFocused();
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 850 });
      await checkHindi(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".learning-management-workspace")
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 360, height: 850 });
    await page.locator(".learning-management-workspace").screenshot({
      path: "test-results/learning-management-hindi-mobile.png",
      style:"nextjs-portal{display:none!important}",
    });
  });
  for (const failure of ["none", "uncertain", "readFailure"]) {
    test(`student enquiry review preserves ownership and ${failure} save recovery without booking or charging`, async ({
      page,
    }) => {
      const f = await fixture(page, {
        role: "STUDENT",
        mode: "STUDENT_LED",
        uncertain: failure === "uncertain",
        readFailure: failure === "readFailure",
      });
      await page.goto("/dashboard/learning-choices?new=1");
      await page
        .getByRole("combobox", { name: "Subject", exact: true })
        .selectOption("Maths");
      await page
        .getByRole("spinbutton", { name: "Monthly budget (INR)", exact: true })
        .fill("1500");
      await page
        .getByRole("textbox", { name: "City or area", exact: true })
        .fill("Raipur");
      await page
        .getByRole("combobox", { name: "Preferred day 1", exact: true })
        .selectOption("1");
      await page
        .getByRole("button", { name: "Review teacher enquiry", exact: true })
        .click();
      expect(f.writes).toHaveLength(0);
      await page
        .getByLabel(
          "I reviewed these learning criteria and want to send this enquiry.",
        )
        .check();
      await page
        .getByRole("button", { name: "Confirm teacher enquiry", exact: true })
        .click();
      if (failure === "uncertain") {
        await expect(
          page.getByRole("button", {
            name: "Retry the same decision",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Discard changes", exact: true }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: "Retry the same decision", exact: true })
          .click();
        expect(f.writes[1]).toEqual(f.writes[0]);
      }
      if (failure === "readFailure") {
        await expect(
          page.getByText(
            "Your current learning choices could not be loaded. Private details are hidden.",
          ),
        ).toBeVisible();
        await expect(
          page.getByRole("textbox", { name: "City or area", exact: true }),
        ).toHaveCount(0);
        expect(f.writes).toHaveLength(1);
        f.restore();
        await page
          .getByRole("button", { name: "Reload learning choices", exact: true })
          .last()
          .click();
      }
      await expect(
        page.getByRole("button", { name: "View saved enquiry", exact: true }),
      ).toBeEnabled();
      expect(f.writes[0].body).toMatchObject({
        childId: learner,
        subject: "Maths",
        budgetPaise: 150000,
        discoveryMethod: "ASSISTED",
      });
      expect(f.writes[0].body.guardianId).toBeUndefined();
      expect(f.writes.every((w) => w.path.endsWith("/requests"))).toBe(true);
      await page
        .getByRole("button", { name: "View saved enquiry", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Your enquiries", exact: true }),
      ).toBeVisible();
    });
  }
  test("permitted students accept their optional demo; guardian-only students only follow its progress", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "STUDENT",
      mode: "SHARED",
      history: true,
      demo: true,
    });
    await page.goto("/dashboard/learning-choices");
    await page
      .getByRole("button", { name: "Accept demo time", exact: true })
      .click();
    await expect(
      page.getByText("Demo decision recorded.", { exact: true }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].path).toContain("/acceptances");
    expect(f.writes[0].body).toEqual({ expectedVersion: 1 });
  });
  test("guardian-only demo actions stay disabled on the student's screen", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "STUDENT",
      history: true,
      demo: true,
    });
    await page.goto("/dashboard/learning-choices");
    await expect(
      page.getByRole("button", { name: "Accept demo time", exact: true }),
    ).toBeDisabled();
    expect(f.writes).toHaveLength(0);
  });
  test("manual teacher interest opens the permitted student's reviewed enquiry rather than guardian onboarding", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "STUDENT",
      mode: "SHARED",
      manual: true,
    });
    await page.goto("/teachers/synthetic-teacher");
    const entry = page.getByRole("link", {
      name: "Enquire about this teacher",
      exact: true,
    });
    await expect(entry).toHaveAttribute(
      "href",
      /dashboard\/learning-choices\?new=1/,
    );
    await entry.click();
    await expect(
      page.getByRole("heading", {
        name: "Tell us what you want to learn",
        exact: true,
      }),
    ).toBeVisible();
    expect(f.writes).toHaveLength(0);
  });
  test("Hindi student enquiry form is accessible and fits phone widths", async ({
    page,
  }) => {
    await chooseHindi(page);
    await fixture(page, { role: "STUDENT", mode: "SHARED" });
    await page.goto("/dashboard/learning-choices?new=1");
    await expect(
      page.getByRole("heading", {
        name: "बताएँ कि आप क्या सीखना चाहते हैं",
        exact: true,
      }),
    ).toBeVisible();
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 850 });
      await checkHindi(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".managed-learning-workspace")
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 360, height: 850 });
    await page.locator(".managed-learning-workspace").screenshot({
      path: "test-results/managed-student-enquiry-hindi-mobile.png",
      style:"nextjs-portal{display:none!important}",
    });
  });
  test("delegated students edit their own education without rewriting verified names or creating another learner", async ({
    page,
  }) => {
    const f = await fixture(page, { role: "STUDENT", mode: "SHARED" });
    await page.goto("/dashboard/learners");
    await page
      .getByRole("button", {
        name: "Edit profile for Synthetic Learner",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Learner name or alias", exact: true }),
    ).not.toBeEditable();
    await page
      .getByRole("textbox", { name: "Subjects studied", exact: true })
      .fill("Maths, Science, English");
    await page
      .getByRole("button", { name: /Review (learner profile|profile changes)/ })
      .click();
    await page
      .getByRole("button", { name: /Confirm.*(profile|changes)/ })
      .click();
    await expect(
      page.getByText(/profile.*saved|changes.*saved/i).first(),
    ).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].path).toBe(
      `/api/v1/learner-profiles/${learner}/updates`,
    );
    expect(f.writes[0].body.alias).toBe("Synthetic Learner");
  });
}
