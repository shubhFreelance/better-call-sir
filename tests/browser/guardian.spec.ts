import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { beginGuardian, reviewGuardian } from "./guardian-journey";
import { operationValidator, validator } from "../helpers/contract";

test("real draft resumes privately, validates money and schedules, and preserves back navigation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByText("Development accounts", { exact: true }).click();
  await page.getByRole("button", { name: /Vivek/ }).click();
  await expect(
    page.getByRole("heading", { name: /Hello, Vivek/ }),
  ).toBeVisible();
  await page.goto("/onboarding/parent");
  await beginGuardian(page);
  await page.getByLabel("Learner alias", { exact: true }).fill("Draft Learner");
  if (await page.getByLabel("School name", { exact: true }).isEditable())
    await page
      .getByLabel("School name", { exact: true })
      .fill("Synthetic school");
  if (
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .isEditable()
  )
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .fill("Maths, Science, English, Hindi");
  await page
    .getByLabel("Subjects studied in this class", { exact: true })
    .fill("Maths, maths");
  await page.getByRole("button", { name: "Continue to tuition needs" }).click();
  await expect(
    page.getByText("List 1–20 unique subjects, separated by commas."),
  ).toBeVisible();
  await page
    .getByLabel("Subjects studied in this class", { exact: true })
    .fill("Maths, Science, English, Hindi");
  await page.screenshot({
    path: "test-results/learner-school-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to tuition needs" }).click();
  await page.reload();
  await beginGuardian(page);
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue(
    "Draft Learner",
  );
  if (await page.getByLabel("School name", { exact: true }).isEditable())
    await page
      .getByLabel("School name", { exact: true })
      .fill("Synthetic school");
  if (
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .isEditable()
  )
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .fill("Maths, Science, English, Hindi");
  await page.getByRole("button", { name: "Continue to tuition needs" }).click();
  await page.getByLabel("Monthly tuition budget (₹)").fill("499");
  await page.getByRole("button", { name: "Continue to schedule" }).click();
  await expect(page.getByText(/Enter a monthly budget/)).toBeVisible();
  await page.getByLabel("Monthly tuition budget (₹)").fill("500.29");
  await page.getByRole("button", { name: "Continue to schedule" }).click();
  await page
    .getByLabel("Preferred start time 1 (IST)", { exact: true })
    .fill("");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByText(/Choose nonoverlapping 20–120 minute windows/),
  ).toBeVisible();
  const remove = page.getByRole("button", {
    name: /Remove availability window/,
  });
  while (await remove.count()) await remove.last().click();
  const start = new Date(Date.now() + 2 * 86400000 + 330 * 60000)
    .toISOString()
    .slice(0, 16);
  await page
    .getByLabel("Preferred start time 1 (IST)", { exact: true })
    .fill(start);
  await page.getByRole("button", { name: "Add another window" }).click();
  await page
    .getByLabel("Preferred start time 2 (IST)", { exact: true })
    .fill(start);
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByText(/Choose nonoverlapping 20–120 minute windows/),
  ).toBeVisible();
  await page
    .getByLabel("Preferred start time 2 (IST)", { exact: true })
    .fill(
      new Date(Date.now() + 3 * 86400000 + 330 * 60000)
        .toISOString()
        .slice(0, 16),
    );
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your tuition request" }),
  ).toBeVisible();
  await expect(page.getByText("₹500.29", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit tuition needs" }).click();
  await expect(page.getByLabel("Monthly tuition budget (₹)")).toHaveValue(
    "500.29",
  );
  const progress = await (
    await page.request.get("/api/v1/onboarding/parent")
  ).json();
  const activeProgress = progress.completedResourceId
    ? await (await page.request.get("/api/v1/onboarding/enquiry")).json()
    : progress;
  expect(activeProgress.draft).toMatchObject({
    alias: "Draft Learner",
    schoolName: "Synthetic school",
    schoolSubjects: ["Maths", "Science", "English", "Hindi"],
    budgetPaise: 50029,
    preferences: { timezone: "Asia/Kolkata" },
  });
  expect(activeProgress.draft.preferences.slots).toHaveLength(2);
  expect(activeProgress.draft.preferences.slots[0].startsAt).toMatch(/Z$/);
  const children = await (await page.request.get("/api/v1/children")).json();
  expect(
    children.items.some((c: { alias: string }) => c.alias === "Draft Learner"),
  ).toBe(false);
});

test("mobile wizard protects an uncertain submission and retries the same operation once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 850 });
  let progress = {
    kind: "PARENT",
    state: "DRAFT",
    draft: {},
    version: 0,
    completedResourceId: null as string | null,
  };
  const completionKeys: string[] = [];
  const completionBodies: unknown[] = [];
  let resources = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Synthetic guardian",
            role: "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-mock-csrf",
        },
      });
    if (path.endsWith("/children"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/consents"))
      return route.fulfill({ status: 201, json: { accepted: true } });
    if (path === "/api/v1/onboarding/enquiry")
      return route.fulfill({
        json: {
          kind: "ENQUIRY",
          state: "DRAFT",
          draft: {},
          version: 0,
          completedResourceId: null,
        },
      });
    if (path.includes("/onboarding/parent")) {
      if (path.endsWith("/drafts")) {
        const body = request.postDataJSON();
        const check = validator("OnboardingSave");
        expect(check(body), JSON.stringify(check.errors)).toBe(true);
        expect(body.expectedVersion).toBe(progress.version);
        progress = {
          ...progress,
          draft: body.draft,
          version: progress.version + 1,
        };
      }
      if (path.endsWith("/completions")) {
        completionKeys.push(request.headers()["idempotency-key"]);
        completionBodies.push(request.postDataJSON());
        if (!progress.completedResourceId) {
          resources++;
          progress = {
            ...progress,
            state: "READY",
            version: progress.version + 1,
            draft: {},
            completedResourceId: "40000000-0000-4000-8000-000000000001",
          };
        }
        if (completionKeys.length === 1)
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: "Unconfirmed response",
          });
      }
      const suffix = path.endsWith("/drafts")
        ? "/drafts"
        : path.endsWith("/completions")
          ? "/completions"
          : "";
      const check = operationValidator(
        `/onboarding/{kind}${suffix}`,
        request.method().toLowerCase(),
        suffix ? "201" : "200",
      );
      expect(check(progress), JSON.stringify(check.errors)).toBe(true);
      return route.fulfill({ status: suffix ? 201 : 200, json: progress });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic mock route unavailable" },
    });
  });
  await page.goto("/onboarding/parent");
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveCount(
    0,
  );
  const inspect = async (step: string) => {
    await page.evaluate(() => document.fonts.ready.then(() => true));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const findings = await new AxeBuilder({ page }).analyze();
    expect(
      findings.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/guardian-${step}-mobile.png`,
      fullPage: true,
    });
  };
  await expect(
    page.getByRole("button", { name: "Agree and continue" }),
  ).toBeVisible();
  await inspect("permission");
  await beginGuardian(page);
  await page
    .getByLabel("Learner alias", { exact: true })
    .fill("Synthetic Learner");
  if (await page.getByLabel("School name", { exact: true }).isEditable())
    await page
      .getByLabel("School name", { exact: true })
      .fill("Synthetic school");
  if (
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .isEditable()
  )
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .fill("Maths, Science, English, Hindi");
  await page.getByRole("button", { name: "Continue to tuition needs" }).click();
  await reviewGuardian(page, "After school works best");
  await inspect("review");
  await page.getByRole("button", { name: "Submit tuition request" }).click();
  await expect(page.getByText(/We couldn’t confirm the result/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit learner" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Submit tuition request" }).click();
  await expect(
    page.getByRole("heading", { name: "Your tuition request is saved." }),
  ).toBeVisible();
  expect(resources).toBe(1);
  expect(completionKeys).toHaveLength(2);
  expect(completionKeys[1]).toBe(completionKeys[0]);
  expect(completionBodies[1]).toEqual(completionBodies[0]);
});

test("a stale draft keeps local edits until the guardian explicitly reloads", async ({
  page,
}) => {
  let progress = {
    kind: "PARENT",
    state: "DRAFT",
    draft: {} as Record<string, unknown>,
    version: 0,
    completedResourceId: null,
  };
  let changedElsewhere = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Synthetic guardian",
            role: "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-mock-csrf",
        },
      });
    if (path.endsWith("/children"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/consents"))
      return route.fulfill({ status: 201, json: { accepted: true } });
    if (path === "/api/v1/onboarding/enquiry")
      return route.fulfill({
        json: {
          kind: "ENQUIRY",
          state: "DRAFT",
          draft: {},
          version: 0,
          completedResourceId: null,
        },
      });
    if (path.includes("/onboarding/parent")) {
      if (path.endsWith("/drafts")) {
        const body = request.postDataJSON();
        if (body.draft.alias === "Local learner" && !changedElsewhere) {
          changedElsewhere = true;
          progress = {
            ...progress,
            draft: { ...body.draft, alias: "Remote learner" },
            version: progress.version + 1,
          };
          return route.fulfill({
            status: 409,
            json: {
              code: "CONFLICT",
              message: "The draft was updated elsewhere.",
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
      return route.fulfill({
        status: request.method() === "POST" ? 201 : 200,
        json: progress,
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic mock route unavailable" },
    });
  });
  await page.goto("/onboarding/parent");
  await beginGuardian(page);
  await page.getByLabel("Learner alias", { exact: true }).fill("Local learner");
  if (await page.getByLabel("School name", { exact: true }).isEditable())
    await page
      .getByLabel("School name", { exact: true })
      .fill("Synthetic school");
  if (
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .isEditable()
  )
    await page
      .getByLabel("Subjects studied in this class", { exact: true })
      .fill("Maths, Science, English, Hindi");
  await page.getByRole("button", { name: "Continue to tuition needs" }).click();
  await expect(
    page.getByText("The draft was updated elsewhere."),
  ).toBeVisible();
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue(
    "Local learner",
  );
  await expect(
    page.getByRole("button", { name: "Continue to tuition needs" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload saved progress" }).click();
  await beginGuardian(page);
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue(
    "Remote learner",
  );
});

async function additionalDraftMock(
  page: import("@playwright/test").Page,
  mode = "normal",
) {
  let progress: any = {
    kind: "ENQUIRY",
    state: "DRAFT",
    draft: {},
    version: 0,
    completedResourceId: null,
  };
  const writes: { path: string; key: string; body: any }[] = [],
    replay = new Map<string, any>();
  let resources = 0,
    restarts = 0;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000081",
            name: "Synthetic draft guardian",
            role: "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/onboarding/parent"))
      return route.fulfill({
        json: {
          kind: "PARENT",
          state: "READY",
          draft: {},
          version: 5,
          completedResourceId: "40000000-0000-4000-8000-000000000081",
        },
      });
    if (path.endsWith("/children"))
      return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/consents"))
      return route.fulfill({ status: 201, json: { accepted: true } });
    if (path.includes("/onboarding/enquiry")) {
      if (req.method() === "POST") {
        const body = req.postDataJSON(),
          key = req.headers()["idempotency-key"];
        writes.push({ path, key, body });
        if (replay.has(key))
          return route.fulfill({ status: 201, json: replay.get(key) });
        if (body.expectedVersion !== progress.version)
          return route.fulfill({
            status: 409,
            json: {
              code: "CONFLICT",
              message: "The enquiry draft changed elsewhere.",
            },
          });
        if (path.endsWith("/drafts"))
          progress = {
            ...progress,
            draft: body.draft,
            version: progress.version + 1,
          };
        if (path.endsWith("/completions")) {
          resources++;
          progress = {
            ...progress,
            draft: {},
            state: "READY",
            version: progress.version + 1,
            completedResourceId: "40000000-0000-4000-8000-000000000082",
          };
        }
        if (path.endsWith("/restarts")) {
          restarts++;
          progress = {
            ...progress,
            draft: {},
            state: "DRAFT",
            version: progress.version + 1,
            completedResourceId: null,
          };
        }
        expect(validator("OnboardingProgress")(progress)).toBe(true);
        replay.set(key, structuredClone(progress));
        if (
          (mode === "uncertain" &&
            path.endsWith("/completions") &&
            resources === 1) ||
          (mode === "restart-unknown" &&
            path.endsWith("/restarts") &&
            restarts === 1)
        )
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: "Unconfirmed enquiry response",
          });
      }
      return route.fulfill({
        status: req.method() === "POST" ? 201 : 200,
        json: progress,
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: "NOT_FOUND", message: "Synthetic route unavailable" },
    });
  });
  return {
    writes,
    getProgress: () => progress,
    getResources: () => resources,
    getRestarts: () => restarts,
    changeRemote: () => {
      progress = {
        ...progress,
        version: progress.version + 1,
        draft: { ...progress.draft, alias: "Remote additional learner" },
      };
    },
  };
}
async function additionalLearner(page: import("@playwright/test").Page) {
  await beginGuardian(page);
  await page
    .getByLabel("Learner alias", { exact: true })
    .fill("Additional learner");
  await page
    .getByLabel("School name", { exact: true })
    .fill("Synthetic additional school");
  await page
    .getByLabel("Subjects studied in this class", { exact: true })
    .fill("Maths, Science, English, Hindi");
  await page
    .getByRole("button", { name: "Continue to tuition needs", exact: true })
    .click();
}

test("additional enquiry resumes school and criteria after reload and submits independently of first onboarding", async ({
  page,
}) => {
  const state = await additionalDraftMock(page);
  await page.goto("/onboarding/parent");
  await additionalLearner(page);
  await page.getByLabel("Monthly tuition budget (₹)").fill("3500.29");
  await page
    .getByRole("button", { name: "Continue to schedule", exact: true })
    .click();
  await page.reload();
  await beginGuardian(page);
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue(
    "Additional learner",
  );
  await expect(page.getByLabel("School name", { exact: true })).toHaveValue(
    "Synthetic additional school",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/additional-enquiry-resume-desktop.png",
    fullPage: true,
    style: "nextjs-portal{display:none!important}",
  });
  await page
    .getByRole("button", { name: "Continue to tuition needs", exact: true })
    .click();
  await expect(page.getByLabel("Monthly tuition budget (₹)")).toHaveValue(
    "3500.29",
  );
  await reviewGuardian(page);
  await page
    .getByRole("button", { name: "Submit tuition request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your tuition request is saved.",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.getResources()).toBe(1);
  expect(
    state.writes.filter((w) => w.path.endsWith("/completions")),
  ).toHaveLength(1);
  expect(
    state.writes.every((w) => w.path.includes("/onboarding/enquiry/")),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Create another request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Agree and continue", exact: true }),
  ).toBeVisible();
  expect(state.getRestarts()).toBe(1);
  expect(state.getProgress().completedResourceId).toBeNull();
});

test("uncertain additional enquiry submits once and replays the same saved version and key", async ({
  page,
}) => {
  const state = await additionalDraftMock(page, "uncertain");
  await page.goto("/onboarding/parent");
  await additionalLearner(page);
  await reviewGuardian(page);
  await page
    .getByRole("button", { name: "Submit tuition request", exact: true })
    .click();
  await expect(page.getByText(/couldn’t confirm the result/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit learner", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Submit tuition request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your tuition request is saved.",
      exact: true,
    }),
  ).toBeVisible();
  const writes = state.writes.filter((w) => w.path.endsWith("/completions"));
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(state.getResources()).toBe(1);
});

test("unknown restart preserves the submitted enquiry and retries the same action before editing", async ({
  page,
}) => {
  const state = await additionalDraftMock(page, "restart-unknown");
  await page.goto("/onboarding/parent");
  await additionalLearner(page);
  await reviewGuardian(page);
  await page
    .getByRole("button", { name: "Submit tuition request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your tuition request is saved.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create another request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your tuition request is saved.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create another request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Agree and continue", exact: true }),
  ).toBeVisible();
  const writes = state.writes.filter((w) => w.path.endsWith("/restarts"));
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(state.getRestarts()).toBe(1);
  expect(state.getResources()).toBe(1);
});

test("an additional enquiry conflict keeps local criteria until explicit reload of the saved draft", async ({
  page,
}) => {
  const state = await additionalDraftMock(page);
  await page.goto("/onboarding/parent");
  await additionalLearner(page);
  await page.getByLabel("Monthly tuition budget (₹)").fill("4200.29");
  state.changeRemote();
  await page
    .getByRole("button", { name: "Continue to schedule", exact: true })
    .click();
  await expect(page.getByLabel("Monthly tuition budget (₹)")).toHaveValue(
    "4200.29",
  );
  await expect(
    page.getByRole("button", { name: "Reload saved progress", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reload saved progress", exact: true })
    .click();
  await beginGuardian(page);
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue(
    "Remote additional learner",
  );
});

test("a different teacher link cannot silently replace an active saved enquiry", async ({
  page,
}) => {
  const state = await additionalDraftMock(page);
  await page.goto("/onboarding/parent");
  await additionalLearner(page);
  const before = structuredClone(state.getProgress());
  await page.goto(
    "/onboarding/parent?teacher=30000000-0000-4000-8000-000000000001",
  );
  await expect(
    page.getByRole("heading", {
      name: "A saved enquiry is already in progress.",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.getProgress()).toEqual(before);
  await page
    .getByRole("link", { name: "Resume saved enquiry", exact: true })
    .click();
  await beginGuardian(page);
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue(
    "Additional learner",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/additional-enquiry-resume-mobile.png",
    fullPage: true,
    style: "nextjs-portal{display:none!important}",
  });
});
