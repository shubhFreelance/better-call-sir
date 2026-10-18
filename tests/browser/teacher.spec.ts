import { translateText } from "../../apps/web/app/locale";
import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import { teacherDetails } from "../../packages/test-fixtures/src";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator, validator } from "../helpers/contract";
async function privateDetails(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Private address", exact: true }),
  ).toBeVisible();
  for (const [name, value] of Object.entries({
    "House / office and street address": "12 Synthetic Road",
    "Address locality": "Shankar Nagar",
    City: "Raipur",
    State: "Chhattisgarh",
    "PIN code": "492001",
  }))
    await page.getByLabel(name, { exact: true }).fill(value);
  await page
    .getByRole("button", {
      name: "Continue to education & previous work",
      exact: true,
    })
    .click();
  for (const name of ["Class 10", "Class 12"]) {
    const row = page.getByRole("region", { name, exact: true });
    await row.getByLabel("Milestone status").selectOption("COMPLETED");
    await row
      .getByLabel("School / college / university")
      .fill("Synthetic school");
    await row.getByLabel("Board and stream").fill("CBSE");
    await row
      .getByLabel("Completion year", { exact: true })
      .fill(name === "Class 10" ? "2010" : "2012");
    await row.getByLabel("Official result format").selectOption("PERCENTAGE");
    await row.getByLabel("Percentage (%)").fill("80");
  }
  await page
    .getByRole("button", {
      name: "Continue to teaching preferences",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Monthly tuition (₹)")).toBeVisible();
}
async function teaching(page: Page) {
  await page.getByLabel("Teaching headline").fill("Patient Maths guidance");
  await page
    .getByLabel("About your teaching")
    .fill("I explain concepts with worked examples and regular practice.");
  await page.getByLabel("Years of teaching experience").fill("4");
  await page
    .getByRole("button", { name: "Continue to private address", exact: true })
    .click();
  const address = page.getByRole("heading", {
      name: "Private address",
      exact: true,
    }),
    error = page.getByText("The application draft changed elsewhere.", {
      exact: true,
    });
  await expect(address.or(error)).toBeVisible();
  if (await address.isVisible()) await privateDetails(page);
}
async function coverage(page: Page) {
  await page
    .getByLabel("Subjects in teaching area 1", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Boards in teaching area 1", { exact: true })
    .fill("CBSE");
  for (const label of ["Class 8", "Hindi", "Online"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("2500.50");
  await page.getByRole("radio", { name: "Yes, I can offer a demo" }).check();
  await page.getByRole("radio", { name: "Yes, 15 days", exact: true }).check();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
}
async function mock(
  page: Page,
  options: {
    uncertain?: boolean;
    conflict?: boolean;
    teacher?: boolean;
    revisionStale?: boolean;
    uncertainRevisionSave?: boolean;
    uncertainRevisionSubmit?: boolean;
    uncertainUpload?: boolean;
  } = {},
) {
  let role = options.teacher ? "TEACHER" : "GUARDIAN",
    completions = 0,
    uploads = 0,
    profile: any = null;
  let progress: any = {
    kind: "TEACHER",
    state: "DRAFT",
    draft: {},
    version: 0,
    completedResourceId: null,
  };
  const keys: string[] = [],
    bodies: unknown[] = [],
    files: any[] = [];
  const uploadKeys: string[] = [],
    uploadBodies: unknown[] = [];
  let revision: any = {
    draft: {},
    version: 0,
    applicationVersion: 1,
    stale: false,
  };
  const revisionKeys: string[] = [],
    revisionBodies: unknown[] = [];
  const revisionSaveKeys: string[] = [],
    revisionSaveBodies: unknown[] = [];
  let revisionResult: any = null;
  const privateProfile = () => ({
    ...teacherDetails,
    id: "30000000-0000-4000-8000-000000000091",
    slug: "synthetic-teacher",
    name: "Synthetic Teacher",
    headline: "Patient Maths guidance",
    bio: "Worked examples",
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["Hindi"],
    modes: ["ONLINE"],
    localities: [],
    monthlyPaise: 250050,
    experience: 4,
    lockInDays: 0,
    avatarColor: "#034F46",
    consultationOptIn: false,
    accountId: "10000000-0000-4000-8000-000000000091",
    status: "SUBMITTED",
    screeningComplete: false,
    screeningValidUntil: null,
    profileRevision: 1,
    feePolicyVersion: "development-v1",
    feeTermsAcceptedAt: new Date().toISOString(),
    region: "RAIPUR",
    maxActiveStudents: 10,
    travelAccepted: false,
    version: 1,
  });
  if (options.teacher)
    profile = {
      ...privateProfile(),
      status: "APPROVED",
      screeningComplete: true,
    };
  if (options.revisionStale) {
    profile.version = 2;
    revision = {
      draft: { headline: "Saved earlier headline" },
      version: 1,
      applicationVersion: 1,
      stale: true,
    };
  }
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000091",
            name: "Synthetic Teacher",
            role,
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/calendar"))
      return route.fulfill({ json: { patterns: [], exceptions: [] } });
    if (path.endsWith("/dashboard"))
      return route.fulfill({ json: { profile } });
    if (path.includes("/onboarding/teacher")) {
      if (path.endsWith("/drafts")) {
        const body = req.postDataJSON();
        if (options.conflict && body.draft.headline) {
          options.conflict = false;
          progress = {
            ...progress,
            draft: { ...body.draft, headline: "Remote teaching headline" },
            version: progress.version + 1,
          };
          return route.fulfill({
            status: 409,
            json: {
              code: "CONFLICT",
              message: "The application draft changed elsewhere.",
            },
          });
        }
        expect(body.expectedVersion).toBe(progress.version);
        progress = {
          ...progress,
          draft: body.draft,
          version: progress.version + 1,
        };
      }
      if (path.endsWith("/completions")) {
        completions++;
        keys.push(req.headers()["idempotency-key"]);
        bodies.push(req.postDataJSON());
        if (completions === 1) {
          profile = { ...privateProfile(), ...progress.draft };
          role = "TEACHER";
          progress = {
            ...progress,
            draft: {},
            state: "SUBMITTED",
            completedResourceId: profile.id,
            version: progress.version + 1,
          };
        }
        if (options.uncertain && completions === 1)
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: "unreadable response",
          });
      }
      const suffix = path.endsWith("/drafts")
        ? "/drafts"
        : path.endsWith("/completions")
          ? "/completions"
          : "";
      const check = operationValidator(
        `/onboarding/{kind}${suffix}`,
        suffix ? "post" : "get",
        suffix ? "201" : "200",
      );
      expect(check(progress), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ status: suffix ? 201 : 200, json: progress });
    }
    if (path.endsWith("/revision-draft"))
      return route.fulfill({ json: revision });
    if (path.endsWith("/revision-drafts")) {
      const body = req.postDataJSON(),
        key = req.headers()["idempotency-key"];
      expect(validator("TeacherRevisionSave")(body)).toBe(true);
      revisionSaveKeys.push(key);
      revisionSaveBodies.push(body);
      if (revisionSaveKeys.indexOf(key) === revisionSaveKeys.length - 1) {
        expect(body.expectedVersion).toBe(revision.version);
        expect(body.expectedApplicationVersion).toBe(profile.version);
        revision = {
          draft: body.draft,
          version: revision.version + 1,
          applicationVersion: profile.version,
          stale: false,
        };
      }
      if (options.uncertainRevisionSave && revisionSaveKeys.length === 1)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable revision save",
        });
      expect(validator("TeacherRevisionProgress")(revision)).toBe(true);
      return route.fulfill({ status: 201, json: revision });
    }
    if (path.endsWith("/revision-draft-discards")) {
      const body = req.postDataJSON();
      expect(validator("TeacherRevisionDiscard")(body)).toBe(true);
      expect(body.expectedVersion).toBe(revision.version);
      expect(body.expectedApplicationVersion).toBe(profile.version);
      revision = {
        draft: {},
        version: revision.version + 1,
        applicationVersion: profile.version,
        stale: false,
      };
      return route.fulfill({ status: 201, json: revision });
    }
    if (path.endsWith("/revision-draft-submissions")) {
      const body = req.postDataJSON();
      revisionKeys.push(req.headers()["idempotency-key"]);
      revisionBodies.push(body);
      expect(validator("TeacherRevisionSubmit")(body)).toBe(true);
      if (!revisionResult) {
        expect(body.expectedVersion).toBe(revision.version);
        expect(body.expectedApplicationVersion).toBe(profile.version);
        profile = {
          ...profile,
          ...revision.draft,
          status: "SUBMITTED",
          screeningComplete: false,
          screeningValidUntil: null,
          profileRevision: profile.profileRevision + 1,
          version: profile.version + 1,
        };
        revision = {
          draft: {},
          version: revision.version + 1,
          applicationVersion: profile.version,
          stale: false,
        };
        revisionResult = profile;
      }
      if (options.uncertainRevisionSubmit && revisionKeys.length === 1)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "unreadable revision submission",
        });
      expect(validator("PrivateTeacher")(profile)).toBe(true);
      return route.fulfill({ status: 201, json: revisionResult });
    }
    if (path.endsWith("/revisions")) {
      const body = req.postDataJSON();
      expect(body.expectedVersion).toBe(profile.version);
      const { expectedVersion, feeTermsAccepted, ...fields } = body;
      profile = {
        ...profile,
        ...fields,
        status: "SUBMITTED",
        screeningComplete: false,
        screeningValidUntil: null,
        profileRevision: profile.profileRevision + 1,
        version: profile.version + 1,
      };
      expect(validator("PrivateTeacher")(profile)).toBe(true);
      return route.fulfill({ status: 201, json: profile });
    }
    if (path.endsWith("/evidence")) {
      if (req.method() === "POST") {
        uploads++;
        uploadKeys.push(req.headers()["idempotency-key"]);
        uploadBodies.push(req.postDataJSON());
        if (options.uncertainUpload && uploads > 1)
          return route.fulfill({ status: 201, json: files.at(-1) });
        const body = req.postDataJSON();
        expect(body.expectedVersion).toBe(profile.version);
        files.push({
          id: "80000000-0000-4000-8000-000000000091",
          teacherId: profile.id,
          kind: body.kind,
          mediaType: body.mediaType,
          size: Buffer.from(body.contentBase64, "base64").length,
          sha256: "a".repeat(64),
          status: "QUARANTINED",
          scannerVersion: null,
          scannedAt: null,
          uploadedAt: new Date().toISOString(),
          version: 1,
        });
        expect(validator("Evidence")(files.at(-1))).toBe(true);
        if (options.uncertainUpload)
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: "unreadable upload response",
          });
        return route.fulfill({ status: 201, json: files.at(-1) });
      }
      return route.fulfill({ json: { items: files } });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Mock route unavailable" },
    });
  });
  return {
    keys,
    bodies,
    revisionKeys,
    revisionBodies,
    revisionSaveKeys,
    revisionSaveBodies,
    getRevision: () => revision,
    uploadKeys,
    uploadBodies,
    getProfile: () => profile,
    getUploads: () => uploads,
  };
}
test("real teacher application resumes, switches role and uploads private quarantined evidence", async ({
  page,
}) => {
  await page.goto("/login?next=%2Fonboarding%2Fteacher");
  await page.getByLabel("Your name").fill("Synthetic UI Teacher");
  await page
    .getByLabel("Email address")
    .fill(`teacher-${crypto.randomUUID()}@example.test`);
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/auth/otp/request"),
  );
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  const otp = await (await response).json();
  await page.getByLabel("Six-digit code").fill(otp.developmentCode);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/onboarding\/teacher/);
  await teaching(page);
  await page.reload();
  await expect(page.getByLabel("Teaching headline")).toHaveValue(
    "Patient Maths guidance",
  );
  await page
    .getByRole("button", { name: "Continue to private address" })
    .click();
  await privateDetails(page);
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Teaching area 1: enter 1–40 distinct subjects/),
  ).toBeVisible();
  await coverage(page);
  await expect(
    page.getByText("₹2,500.50 per month", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit teacher application" })
    .click();
  await expect(
    page.getByText(
      "Accept the stated fee terms and account changes before submitting.",
    ),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit teacher application" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  const session = await (await page.request.get("/api/v1/auth/session")).json();
  expect(session.account.role).toBe("TEACHER");
  const dashboard = await (await page.request.get("/api/v1/dashboard")).json();
  expect(dashboard.profile).toMatchObject({
    status: "SUBMITTED",
    subjects: ["Maths"],
    boards: ["CBSE"],
    grades: [8],
    languages: ["Hindi"],
    modes: ["ONLINE"],
    localities: [],
    monthlyPaise: 250050,
  });
  await page.getByLabel("Private evidence file").setInputFiles({
    name: "identity.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Upload private evidence" }).click();
  await expect(
    page.getByText(
      "Private evidence uploaded. Check its safety-scan status below.",
    ),
  ).toBeVisible();
  const evidence = await (
    await page.request.get(`/api/v1/teachers/${dashboard.profile.id}/evidence`)
  ).json();
  expect(evidence.items).toHaveLength(1);
  expect(["QUARANTINED", "CLEAN"]).toContain(evidence.items[0].status);
  await page.reload();
  await expect(
    page.getByText("Submitted for review", { exact: true }),
  ).toBeVisible();
});
test("uncertain completion retries identically; mobile application is accessible and uploads are private", async ({
  page,
}) => {
  const state = await mock(page, { uncertain: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await coverage(page);
  await page.evaluate(() => document.fonts.ready);
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
    path: "test-results/teacher-review-mobile.png",
    fullPage: true,
  });
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit teacher application" })
    .click();
  await expect(page.getByText(/We couldn’t confirm the result/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit coverage" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Submit teacher application" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  expect(state.keys).toHaveLength(2);
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  await page.getByLabel("Private evidence file").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private"),
  });
  await page.getByRole("button", { name: "Upload private evidence" }).click();
  await expect(
    page.getByText("Choose a nonempty PDF, PNG or JPEG of at most 5 MiB."),
  ).toBeVisible();
  expect(state.getUploads()).toBe(0);
  await page.getByLabel("Private evidence file").setInputFiles({
    name: "identity.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsynthetic"),
  });
  await page.getByRole("button", { name: "Upload private evidence" }).click();
  await expect(
    page.getByText("Awaiting safety scan", { exact: true }),
  ).toBeVisible();
  expect(state.getUploads()).toBe(1);
  await expect(
    page.getByRole("link", { name: "Download private file" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/teacher-workspace-mobile.png",
    fullPage: true,
  });
  const workspace = await new AxeBuilder({ page }).analyze();
  expect(
    workspace.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
});
test("stale teacher draft preserves changes until explicit reload", async ({
  page,
}) => {
  await mock(page, { conflict: true });
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await expect(
    page.getByText("The application draft changed elsewhere."),
  ).toBeVisible();
  await expect(page.getByLabel("Teaching headline")).toHaveValue(
    "Patient Maths guidance",
  );
  await expect(
    page.getByRole("button", { name: "Continue to private address" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload saved application" }).click();
  await expect(page.getByLabel("Teaching headline")).toHaveValue(
    "Remote teaching headline",
  );
});
test("approved profile edits require explicit resubmission and reopen screening", async ({
  page,
}) => {
  const state = await mock(page, { teacher: true });
  await page.goto("/onboarding/teacher");
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Private evidence file")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit application" }).click();
  await teaching(page);
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Resubmitting reopens screening/)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(
    page.getByText("Submitted for review", { exact: true }),
  ).toBeVisible();
  expect(state.getProfile()).toMatchObject({
    status: "SUBMITTED",
    screeningComplete: false,
    profileRevision: 2,
    version: 2,
  });
  await expect(page.getByLabel("Private evidence file")).toBeVisible();
});

test("home locality is explicit and uncertain private uploads keep their retry key", async ({
  page,
}) => {
  const state = await mock(page, { uncertainUpload: true });
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await page
    .getByLabel("Subjects in teaching area 1", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Boards in teaching area 1", { exact: true })
    .fill("CBSE");
  for (const label of ["Class 8", "Hindi", "At home"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("2500.50");
  await page.getByRole("radio", { name: "Yes, I can offer a demo" }).check();
  await page.getByRole("radio", { name: "Yes, 15 days", exact: true }).check();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Choose at least one locality for home tuition."),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Mowa", exact: true }).check();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit teacher application" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/teacher-workspace-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Private evidence file").setInputFiles({
    name: "big.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await page.getByRole("button", { name: "Upload private evidence" }).click();
  await expect(
    page.getByText("Choose a nonempty PDF, PNG or JPEG of at most 5 MiB."),
  ).toBeVisible();
  expect(state.getUploads()).toBe(0);
  await page.getByLabel("Private evidence file").setInputFiles({
    name: "private.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nsynthetic"),
  });
  await page.getByRole("button", { name: "Upload private evidence" }).click();
  await expect(page.getByText(/We couldn’t confirm this upload/)).toBeVisible();
  await expect(page.getByLabel("Check category")).toBeDisabled();
  await expect(page.getByLabel("Private evidence file")).toBeDisabled();
  await page.getByRole("button", { name: "Retry private upload" }).click();
  await expect(
    page.getByText("Awaiting safety scan", { exact: true }),
  ).toBeVisible();
  expect(state.uploadKeys).toHaveLength(2);
  expect(state.uploadKeys[0]).toBe(state.uploadKeys[1]);
  expect(state.uploadBodies[0]).toEqual(state.uploadBodies[1]);
});

test("private education records and a declined demo survive review and submission", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const school = page.getByRole("region", { name: "Class 10", exact: true });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("PIN code", { exact: true }).fill("123");
  await page
    .getByRole("button", {
      name: "Continue to education & previous work",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Enter a valid six-digit Indian PIN code."),
  ).toBeVisible();
  await page.getByLabel("PIN code", { exact: true }).fill("492001");
  await page.screenshot({
    path: "test-results/teacher-private-address-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Continue to education & previous work",
      exact: true,
    })
    .click();
  await school.getByLabel("Official result format").selectOption("MARKS");
  await school.getByLabel("Marks obtained", { exact: true }).fill("560");
  await school.getByLabel("Total marks", { exact: true }).fill("500");
  await page
    .getByRole("button", {
      name: "Continue to teaching preferences",
      exact: true,
    })
    .click();
  await expect(
    school.getByText("Enter a valid total or CGPA scale."),
  ).toBeVisible();
  await school.getByLabel("Marks obtained", { exact: true }).fill("420");
  await expect(
    school.getByText("Enter a valid total or CGPA scale."),
  ).toHaveCount(0);
  await expect(school.getByText("Calculated percentage: 84%.")).toBeVisible();
  const college = page.getByRole("region", {
    name: "College / undergraduate",
    exact: true,
  });
  await college.getByLabel("Milestone status").selectOption("PURSUING");
  await college
    .getByLabel("School / college / university")
    .fill("Synthetic University");
  await college
    .getByLabel("Degree and specialization")
    .fill("B.Sc. Mathematics");
  await college
    .getByLabel("Expected completion year")
    .fill(String(new Date().getFullYear() + 1));
  await expect(college.getByLabel("Official result format")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add previous work", exact: true })
    .click();
  const work = page.getByRole("region", {
    name: "Previous work 1",
    exact: true,
  });
  await work
    .getByLabel("Institution / employer / tuition practice")
    .fill("Synthetic Tuition Practice");
  await work.getByLabel("Your role").fill("Independent teacher");
  await work.getByLabel("Start year", { exact: true }).fill("2020");
  await work
    .getByLabel("Experience certificate or reference")
    .selectOption("CERTIFICATE_AVAILABLE");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/teacher-education-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Continue to teaching preferences",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Subjects in teaching area 1", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Boards in teaching area 1", { exact: true })
    .fill("CBSE");
  for (const label of ["Class 8", "Hindi", "Online"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("2500");
  await page
    .getByRole("radio", {
      name: "No, I prefer to discuss tuition without a demo",
    })
    .check();
  await page
    .getByRole("radio", { name: "No, I do not require a lock-in" })
    .check();
  await page.screenshot({
    path: "test-results/teacher-demo-preference-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/teacher-demo-preference-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(page.getByText(/12 Synthetic Road/)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit teacher application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  expect(state.getProfile()).toMatchObject({
    demoOptIn: false,
    lockInDays: 0,
    address: { line1: "12 Synthetic Road" },
    education: expect.arrayContaining([
      {
        ...state.getProfile().education[0],
        grading: "MARKS",
        score: 420,
        outOf: 500,
        percentage: 84,
      },
    ]),
    employment: [
      expect.objectContaining({
        organization: "Synthetic Tuition Practice",
        role: "Independent teacher",
        fromYear: 2020,
        toYear: null,
      }),
    ],
  });
});

test("teacher revision saves privately and resumes after reload without changing approval", async ({
  page,
}) => {
  const state = await mock(page, { teacher: true });
  await page.goto("/onboarding/teacher");
  await page.getByRole("button", { name: "Edit application" }).click();
  await page.getByLabel("Teaching headline").fill("My saved revision");
  await page
    .getByRole("button", { name: "Continue to private address" })
    .click();
  await expect(page.getByText("Progress saved", { exact: true })).toBeVisible();
  expect(state.getProfile().headline).toBe("Patient Maths guidance");
  expect(state.getProfile().status).toBe("APPROVED");
  await page.reload();
  await page.getByRole("button", { name: "Edit application" }).click();
  await expect(page.getByLabel("Teaching headline")).toHaveValue(
    "My saved revision",
  );
  await page.screenshot({
    path: "test-results/teacher-revision-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/teacher-revision-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(
    a11y.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Return to workspace" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  expect(state.getRevision().draft.headline).toBe("My saved revision");
});

test("uncertain teacher revision save locks editing and retries the same body and key", async ({
  page,
}) => {
  const state = await mock(page, {
    teacher: true,
    uncertainRevisionSave: true,
  });
  await page.goto("/onboarding/teacher");
  await page.getByRole("button", { name: "Edit application" }).click();
  await page.getByLabel("Teaching headline").fill("Retry my changes");
  await page
    .getByRole("button", { name: "Continue to private address" })
    .click();
  await expect(page.getByText(/We couldn’t confirm the save/)).toBeVisible();
  await expect(page.getByLabel("Teaching headline")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Return to workspace" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Private address", exact: true }),
  ).toBeVisible();
  expect(state.revisionSaveKeys).toHaveLength(2);
  expect(state.revisionSaveKeys[0]).toBe(state.revisionSaveKeys[1]);
  expect(state.revisionSaveBodies[0]).toEqual(state.revisionSaveBodies[1]);
});

test("stale teacher revision requires acknowledged discard and preserves the current application", async ({
  page,
}) => {
  const state = await mock(page, { teacher: true, revisionStale: true });
  await page.goto("/onboarding/teacher");
  await page.getByRole("button", { name: "Edit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Your application changed." }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved earlier headline", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/teacher-revision-recovery-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const recovery = await new AxeBuilder({ page }).analyze();
  expect(
    recovery.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);

  await expect(
    page.getByRole("button", { name: "Discard saved revision", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Keep saved revision" }).click();
  expect(state.getRevision().draft.headline).toBe("Saved earlier headline");
  await page.getByRole("button", { name: "Edit application" }).click();
  await page
    .getByRole("checkbox", {
      name: "I understand that my saved revision edits will be discarded.",
    })
    .check();
  await page
    .getByRole("button", { name: "Discard saved revision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  expect(state.getProfile().status).toBe("APPROVED");
  expect(state.getProfile().version).toBe(2);
  expect(state.getRevision().draft).toEqual({});
  await page.getByRole("button", { name: "Edit application" }).click();
  await expect(page.getByLabel("Teaching headline")).toHaveValue(
    "Patient Maths guidance",
  );
});

test("uncertain saved revision submission retries once without repeating screening revisions", async ({
  page,
}) => {
  const state = await mock(page, {
    teacher: true,
    uncertainRevisionSubmit: true,
  });
  await page.goto("/onboarding/teacher");
  await page.getByRole("button", { name: "Edit application" }).click();
  await teaching(page);
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText(/We couldn’t confirm the result/)).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(
    page.getByText("Submitted for review", { exact: true }),
  ).toBeVisible();
  expect(state.revisionKeys).toHaveLength(2);
  expect(state.revisionKeys[0]).toBe(state.revisionKeys[1]);
  expect(state.revisionBodies[0]).toEqual(state.revisionBodies[1]);
  expect(state.getProfile().profileRevision).toBe(2);
});

test("lock-in choice is explicit, saved on review and can be edited before submission", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await page
    .getByLabel("Subjects in teaching area 1", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Boards in teaching area 1", { exact: true })
    .fill("CBSE");
  for (const label of ["Class 8", "Hindi", "Online"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("2500");
  await page.getByRole("radio", { name: "Yes, I can offer a demo" }).check();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Choose no lock-in, 15 days or 30 days."),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Yes, 30 days", exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("group", { name: "Do you want a minimum engagement period?" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/teacher-lock-in-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("30 days lock-in", { exact: true }),
  ).toBeVisible();
  await page.reload();
  for (const name of [
    "Continue to private address",
    "Continue to education & previous work",
    "Continue to teaching preferences",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Yes, 30 days", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Edit lock-in preference", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "No, I do not require a lock-in" })
    .check();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit teacher application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  expect(state.getProfile().lockInDays).toBe(0);
});

test("teacher early-years, senior-school and college scopes save privately, resume and submit without cross-stage broadening", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await page
    .getByLabel("Education stage for teaching area 1")
    .selectOption("COLLEGE");
  await page
    .getByLabel("Subjects in teaching area 1", { exact: true })
    .fill("Mechanics");
  await page
    .getByLabel("Course / degree in teaching area 1")
    .fill("BSc Physics");
  await page.getByRole("checkbox", { name: "Year 2", exact: true }).check();
  await page
    .getByRole("button", { name: "Add teaching area", exact: true })
    .click();
  await page
    .getByLabel("Education stage for teaching area 2")
    .selectOption("EARLY_YEARS");
  await page
    .getByLabel("Subjects in teaching area 2", { exact: true })
    .fill("Language");
  await page.getByRole("checkbox", { name: "KG1", exact: true }).check();
  await page
    .getByRole("button", { name: "Add teaching area", exact: true })
    .click();
  await page
    .getByLabel("Subjects in teaching area 3", { exact: true })
    .fill("Physics");
  await page
    .getByLabel("Boards in teaching area 3", { exact: true })
    .fill("CBSE");
  await page.getByRole("checkbox", { name: "Class 12", exact: true }).check();
  for (const name of ["English", "Online"])
    await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("3000");
  await page
    .getByRole("radio", {
      name: "No, I prefer to discuss tuition without a demo",
    })
    .check();
  await page.getByRole("radio", { name: "Yes, 15 days", exact: true }).check();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/expanded-teacher-coverage-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/expanded-teacher-coverage-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(
    a11y.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(page.locator(".wizard-review")).toContainText("BSc Physics");
  await page.reload();
  for (const name of [
    "Continue to private address",
    "Continue to education & previous work",
    "Continue to teaching preferences",
  ])
    await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByLabel("Education stage for teaching area 1"),
  ).toHaveValue("COLLEGE");
  await expect(
    page.getByRole("checkbox", { name: "Year 2", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Submit teacher application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your teacher workspace." }),
  ).toBeVisible();
  expect(state.getProfile().teachingCoverage).toEqual(
    expect.arrayContaining([
      {
        stage: "COLLEGE",
        subject: "Mechanics",
        courseName: "BSc Physics",
        studyYear: 2,
      },
      { stage: "EARLY_YEARS", subject: "Language", level: "KG1" },
      { stage: "SCHOOL", subject: "Physics", board: "CBSE", grade: 12 },
    ]),
  );
  expect(state.getProfile().teachingCoverage).toHaveLength(3);
  expect(state.getProfile().grades).toEqual([12]);
});
test("duplicate teaching areas are blocked before the application can reach review", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/onboarding/teacher");
  await teaching(page);
  await page
    .getByLabel("Subjects in teaching area 1", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Boards in teaching area 1", { exact: true })
    .fill("CBSE");
  await page.getByRole("checkbox", { name: "Class 8", exact: true }).check();
  await page
    .getByRole("button", { name: "Add teaching area", exact: true })
    .click();
  await page
    .getByLabel("Subjects in teaching area 2", { exact: true })
    .fill("Maths");
  await page
    .getByLabel("Boards in teaching area 2", { exact: true })
    .fill("CBSE");
  await page
    .getByRole("region", { name: "Teaching area 2", exact: true })
    .getByRole("checkbox", { name: "Class 8", exact: true })
    .check();
  await page
    .getByRole("button", {
      name: "Continue to review application",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Two teaching areas repeat the same subject/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review your application" }),
  ).toHaveCount(0);
});

test("Hindi complete interface — शिक्षक आवेदन", async ({ page }) => {
  await chooseHindi(page);
  await mock(page);
  await page.goto("/onboarding/teacher");
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
});

test("Hindi full teacher application validates, reviews authored evidence and retries canonical payload unchanged", async ({
  page,
}) => {
  const t = (text: string) => translateText(true, text);
  const next = (name: string) =>
    page.getByRole("button", {
      name: translateText(true, "Continue to {0}", [t(name.toLowerCase())]),
      exact: true,
    });
  await chooseHindi(page);
  const state = await mock(page, { uncertain: true });
  await page.goto("/onboarding/teacher");
  await next("Private address").click();
  await expect(page.locator("#teacher-headline-error")).toHaveText(
    "यह जानकारी भरें।",
  );
  await page.getByLabel(t("Teaching headline"), { exact: true }).fill("Open");
  await page
    .getByLabel(t("About your teaching"), { exact: true })
    .fill("Teacher");
  await page
    .getByLabel(t("Years of teaching experience"), { exact: true })
    .fill("4");
  await next("Private address").click();
  for (const [name, value] of Object.entries({
    "House / office and street address": "12 Synthetic Road",
    "Address locality": "Shankar Nagar",
    City: "Raipur",
    State: "Chhattisgarh",
    "PIN code": "492001",
  }))
    await page.getByLabel(t(name), { exact: true }).fill(value);
  await next("Education & previous work").click();
  for (const [name, year] of [
    ["Class 10", "2010"],
    ["Class 12", "2012"],
  ]) {
    const row = page.getByRole("region", { name: t(name), exact: true });
    await row.getByLabel(t("Milestone status")).selectOption("COMPLETED");
    await row.getByLabel(t("School / college / university")).fill("Open");
    await row.getByLabel(t("Board and stream")).fill("CBSE");
    await row.getByLabel(t("Completion year"), { exact: true }).fill(year);
    await row
      .getByLabel(t("Official result format"))
      .selectOption("PERCENTAGE");
    await row.getByLabel(t("Percentage (%)")).fill("80");
  }
  await next("Teaching preferences").click();
  await page
    .getByLabel(t("Subjects in teaching area") + " 1", { exact: true })
    .fill("Maths");
  await page
    .getByLabel(t("Boards in teaching area") + " 1", { exact: true })
    .fill("CBSE");
  for (const label of ["Class 8", "Hindi", "Online"])
    await page.getByRole("checkbox", { name: t(label), exact: true }).check();
  await page.getByLabel(t("Monthly tuition (₹)")).fill("2500.50");
  await page.getByRole("radio", { name: t("Yes, I can offer a demo") }).check();
  await page
    .getByRole("radio", {
      name: translateText(true, "Yes, {0} days", [15]),
      exact: true,
    })
    .check();
  await next("Review application").click();
  await expect(page.locator(".wizard-review")).toContainText("Teacher");
  await expect(page.locator(".wizard-review")).toContainText("Open");
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(
    axe.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/hindi-teacher-review-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", {
      name: t(
        "I acknowledge these account changes. Each hiring arrangement shows its proposed platform fee for separate review and acceptance. This application does not create a charge.",
      ),
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: t("Submit teacher application"), exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: t("Submit teacher application"),
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: t("Submit teacher application"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: t("Your teacher workspace."),
      exact: true,
    }),
  ).toBeVisible();
  expect(state.bodies).toHaveLength(2);
  expect(state.bodies[0]).toEqual(state.bodies[1]);
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.getProfile()).toMatchObject({
    headline: "Open",
    bio: "Teacher",
    languages: ["Hindi"],
    modes: ["ONLINE"],
    monthlyPaise: 250050,
    demoOptIn: true,
    lockInDays: 15,
  });
  await expect(
    page.getByRole("button", { name: t("Choose evidence file"), exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(t("Check category"), { exact: true })
    .selectOption("QUALIFICATIONS");
  await page
    .getByLabel(t("Private evidence file"), { exact: true })
    .setInputFiles({
      name: "Teacher.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 Synthetic Hindi evidence"),
    });
  await page
    .getByRole("button", { name: t("Upload private evidence"), exact: true })
    .click();
  await expect(
    page.getByText(
      t("Private evidence uploaded. Check its safety-scan status below."),
      { exact: true },
    ),
  ).toBeVisible();
  expect(state.uploadBodies[0]).toMatchObject({
    kind: "QUALIFICATIONS",
    mediaType: "application/pdf",
  });
});
