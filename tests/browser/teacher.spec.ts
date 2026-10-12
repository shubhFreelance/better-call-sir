import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator, validator } from "../helpers/contract";
async function teaching(page: Page) {
  await page.getByLabel("Teaching headline").fill("Patient Maths guidance");
  await page
    .getByLabel("About your teaching")
    .fill("I explain concepts with worked examples and regular practice.");
  await page.getByLabel("Years of teaching experience").fill("4");
  await page.getByRole("button", { name: "Continue to coverage" }).click();
}
async function coverage(page: Page) {
  for (const label of ["Maths", "CBSE", "Class 8", "Hindi", "Online"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("2500.50");
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
}
async function mock(
  page: Page,
  options: {
    uncertain?: boolean;
    conflict?: boolean;
    teacher?: boolean;
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
  const privateProfile = () => ({
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
  await page.getByRole("button", { name: "Continue to coverage" }).click();
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await expect(page.getByText("Choose at least one subject.")).toBeVisible();
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
    page.getByRole("button", { name: "Continue to coverage" }),
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
    .getByRole("button", { name: "Review application", exact: true })
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
  for (const label of ["Maths", "CBSE", "Class 8", "Hindi", "At home"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByLabel("Monthly tuition (₹)").fill("2500.50");
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await expect(
    page.getByText("Choose at least one locality for home tuition."),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Mowa", exact: true }).check();
  await page
    .getByRole("button", { name: "Review application", exact: true })
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
