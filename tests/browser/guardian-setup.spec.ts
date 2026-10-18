import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator } from "../helpers/contract";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
async function mock(page: Page, mode = "empty", role = "GUARDIAN") {
  let gate =
    mode === "verification"
      ? "VERIFICATION_REQUIRED"
      : mode === "privacy"
        ? "PRIVACY_PAUSED"
        : ["consent", "unknown", "refresh-failure"].includes(mode)
          ? "CONSENT_REQUIRED"
          : "READY";
  let fail = mode === "error",
    applied = false,
    count = ["draft", "submitted"].includes(mode) ? 2 : 0;
  const reads: string[] = [],
    writes: any[] = [];
  const account = {
    id: "10000000-0000-4000-8000-000000000491",
    name: "Synthetic setup guardian",
    role,
    verified: gate !== "VERIFICATION_REQUIRED",
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    reads.push(path);
    if (path.endsWith("/auth/session"))
      return route.fulfill({ json: { account, csrfToken: "synthetic-csrf" } });
    if (path === "/api/v1/onboarding/guardian") {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic setup unavailable" },
        });
      const value = {
        name: account.name,
        gate,
        learnerCount: gate === "READY" ? count : null,
        enquiryStatus:
          gate === "READY"
            ? mode === "draft"
              ? "DRAFT"
              : mode === "submitted"
                ? "SUBMITTED"
                : "NOT_STARTED"
            : null,
      };
      expect(
        operationValidator("/onboarding/guardian", "get", "200")(value),
      ).toBe(true);
      return route.fulfill({ json: value });
    }
    if (path === "/api/v1/consents" && req.method() === "POST") {
      writes.push(req.postDataJSON());
      applied = true;
      gate = "READY";
      count = 0;
      if (mode === "unknown") return route.abort();
      if (mode === "refresh-failure") fail = true;
      return route.fulfill({ status: 201, json: { accepted: true } });
    }
    return route.continue();
  });
  return {
    reads,
    writes,
    recover: () => {
      fail = false;
    },
    applied: () => applied,
  };
}
test("new guardian setup puts education profiles before a new enquiry", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/onboarding/guardian");
  await expect(
    page.getByRole("heading", {
      name: "Start with your first learner.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add learner profile", exact: true }),
  ).toHaveAttribute("href", "/dashboard/learners?new=1");
  await expect(
    page
      .locator(".guardian-setup")
      .getByRole("link", { name: "Let us search for you", exact: true }),
  ).toHaveCount(0);
  expect(
    state.reads.some((p) =>
      /children|learner-profiles|onboarding\/(parent|enquiry)/.test(p),
    ),
  ).toBe(false);
  expect(state.writes).toHaveLength(0);
});
test("explicit purpose-specific permission opens profile setup without creating an enquiry", async ({
  page,
}) => {
  const state = await mock(page, "consent");
  await page.goto("/onboarding/guardian");
  const agree = page.getByRole("button", {
    name: "Agree and continue",
    exact: true,
  });
  await expect(agree).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: /I am the learner’s parent or lawful guardian/,
    })
    .check();
  await agree.click();
  await expect(
    page.getByRole("heading", {
      name: "Start with your first learner.",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toEqual([
    {
      purpose: "tuition-and-learning-records",
      policyVersion: "development-v1",
      accepted: true,
    },
  ]);
  expect(state.reads.some((p) => /onboarding\/(parent|enquiry)/.test(p))).toBe(
    false,
  );
});
test("lost permission response checks saved status instead of silently granting permission again", async ({
  page,
}) => {
  const state = await mock(page, "unknown");
  await page.goto("/onboarding/guardian");
  await page
    .getByRole("checkbox", {
      name: /I am the learner’s parent or lawful guardian/,
    })
    .check();
  await page
    .getByRole("button", { name: "Agree and continue", exact: true })
    .click();
  await expect(
    page.getByText(/Your permission may have been saved/),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await page
    .getByRole("button", { name: "Check permission status", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Add learner profile", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
for (const mode of ["verification", "privacy"])
  test(
    mode + " gate hides learner intake and gives a precise recovery route",
    async ({ page }) => {
      const state = await mock(page, mode);
      await page.goto("/onboarding/guardian");
      await expect(
        page.getByRole("heading", {
          name:
            mode === "verification"
              ? "Guardian verification comes first."
              : "Learner setup is paused.",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name:
            mode === "verification"
              ? "Start guardian verification"
              : "Review privacy request",
          exact: true,
        }),
      ).toHaveAttribute(
        "href",
        mode === "verification" ? "/guardian-verification" : "/dashboard/privacy",
      );
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Add learner profile", exact: true }),
      ).toHaveCount(0);
      expect(state.writes).toHaveLength(0);
    },
  );
for (const mode of ["draft", "submitted"])
  test(
    mode + " progress preserves the existing enquiry journey",
    async ({ page }) => {
      const state = await mock(page, mode);
      await page.goto("/onboarding/guardian");
      await expect(
        page.getByRole("link", {
          name:
            mode === "draft" ? "Resume saved enquiry" : "View your enquiries",
          exact: true,
        }),
      ).toHaveAttribute(
        "href",
        mode === "draft" ? "/onboarding/parent" : "/dashboard/requests",
      );
      await expect(
        page.getByRole("link", {
          name: "Manage or add learner profiles",
          exact: true,
        }),
      ).toHaveAttribute("href", "/dashboard/learners");
      expect(state.writes).toHaveLength(0);
    },
  );
for (const mode of ["error", "refresh-failure"])
  test(
    mode + " blocks stale actions and recovers without another consent write",
    async ({ page }) => {
      const state = await mock(page, mode);
      await page.goto("/onboarding/guardian");
      if (mode === "refresh-failure") {
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", { name: "Agree and continue", exact: true })
          .click();
      }
      await expect(
        page.getByRole("button", { name: "Retry guardian setup", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Add learner profile", exact: true }),
      ).toHaveCount(0);
      state.recover();
      await page
        .getByRole("button", { name: "Retry guardian setup", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Start with your first learner.",
          exact: true,
        }),
      ).toBeVisible();
      expect(state.writes).toHaveLength(mode === "error" ? 0 : 1);
    },
  );
for (const role of ["STUDENT", "TEACHER"])
  test(
    role + " cannot open guardian setup or load its status",
    async ({ page }) => {
      const state = await mock(page, "empty", role);
      await page.goto("/onboarding/guardian");
      await expect(
        page.getByRole("heading", {
          name: "Guardian setup belongs to a guardian account.",
          exact: true,
        }),
      ).toBeVisible();
      expect(state.reads).not.toContain("/api/v1/onboarding/guardian");
    },
  );
test("anonymous guardian setup preserves a safe sign-in return route", async ({
  page,
}) => {
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "SESSION_REQUIRED", message: "Sign in" },
    }),
  );
  await page.goto("/onboarding/guardian");
  await expect(
    page.getByRole("link", { name: /Sign in with email/ }),
  ).toHaveAttribute("href", "/login?next=%2Fonboarding%2Fguardian");
});
test("new email guardian enters guardian setup after sign-in", async ({
  page,
}) => {
  let signed = false;
  const account = {
    id: randomUUID(),
    name: "Synthetic new guardian",
    role: "GUARDIAN",
    verified: false,
  };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill(
        signed
          ? { json: { account, csrfToken: "synthetic-csrf" } }
          : {
              status: 401,
              json: { code: "SESSION_REQUIRED", message: "Sign in" },
            },
      );
    if (path.endsWith("/dev/accounts")) return route.fulfill({ json: [] });
    if (path.endsWith("/auth/otp/request"))
      return route.fulfill({
        status: 201,
        json: { status: "SENT", expiresIn: 300 },
      });
    if (path.endsWith("/auth/otp/verify")) {
      signed = true;
      return route.fulfill({
        status: 201,
        json: { account, csrfToken: "synthetic-csrf" },
      });
    }
    if (path.endsWith("/onboarding/guardian"))
      return route.fulfill({
        json: {
          name: account.name,
          gate: "VERIFICATION_REQUIRED",
          learnerCount: null,
          enquiryStatus: null,
        },
      });
    return route.continue();
  });
  await page.goto("/login");
  await page.getByLabel("Your name").fill(account.name);
  await page.getByLabel("Email address").fill("synthetic-setup@example.test");
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await page.getByLabel("Six-digit code").fill("123456");
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding\/guardian$/);
  await expect(
    page.getByRole("heading", {
      name: "Guardian verification comes first.",
      exact: true,
    }),
  ).toBeVisible();
});
test("real guardian gives permission, saves a KG profile and returns to teacher discovery without creating an enquiry", async ({
  page,
}) => {
  const config = parseEnv(readFileSync(".env", "utf8"));
  expect(config.APP_MODE).toBe("development");
  expect(["127.0.0.1", "localhost"]).toContain(
    new URL(config.DATABASE_URL).hostname,
  );
  const db = new Pool({ connectionString: config.DATABASE_URL }),
    account = randomUUID();
  try {
    await db.query(
      'INSERT INTO "Account" (id,name,role,verified,phone) VALUES ($1,$2,$3,true,$4)',
      [
        account,
        "Synthetic setup journey guardian",
        "GUARDIAN",
        "+91000000" + account.replaceAll("-", ""),
      ],
    );
    const session = await page.request.post("/api/v1/dev/session", {
      headers: { Origin: "http://localhost:3000" },
      data: { accountId: account },
    });
    expect(session.status()).toBe(201);
    await page.goto("/onboarding/guardian");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", {
        name: "Your permission comes first.",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include(".guardian-setup").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/guardian-setup-permission-mobile.png",
      fullPage: true,
    });
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Agree and continue", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Add learner profile", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/learners$/);
    await page.getByLabel("Learner name or alias").fill("Synthetic KG learner");
    await page.getByLabel("Education stage").selectOption("EARLY_YEARS");
    await page.getByLabel("Early years level").selectOption("KG2");
    await page
      .getByLabel("School / institution name")
      .fill("Synthetic early school");
    await page.getByLabel("Subjects studied").fill("Language, Numbers");
    await page
      .getByRole("button", { name: "Review learner profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm and save profile", exact: true })
      .click();
    await expect(
      page.getByText("Synthetic KG learner’s profile is saved.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Continue guardian setup", exact: true })
      .click();
    await expect(
      page.getByText("1 learner has education details saved.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Search teachers", exact: true }),
    ).toHaveAttribute("href", "/teachers");
    await expect(
      page
        .getByRole("link", { name: "Let us search for you", exact: true })
        .last(),
    ).toHaveAttribute("href", "/onboarding/parent?discovery=ASSISTED");
    expect(
      (await new AxeBuilder({ page }).include(".guardian-setup").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/guardian-setup-ready-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/guardian-setup-ready-desktop.png",
      fullPage: true,
    });
    await page.reload();
    await expect(
      page.getByRole("link", {
        name: "Manage or add learner profiles",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await db.query(
          'SELECT count(*) FROM "TuitionRequest" WHERE "guardianId"=$1',
          [account],
        )
      ).rows[0].count,
    ).toBe("0");
    expect(
      (
        await db.query(
          'SELECT count(*) FROM "OnboardingProgress" WHERE "accountId"=$1',
          [account],
        )
      ).rows[0].count,
    ).toBe("0");
  } finally {
    await db.query(
      'UPDATE "Account" SET disabled=true,phone=NULL WHERE id=$1',
      [account],
    );
    await db.query('UPDATE "Session" SET revoked=true WHERE "accountId"=$1', [
      account,
    ]);
    await db.end();
  }
});

 test("Hindi complete interface — अभिभावक खाता, शुरुआत और अनुमति", async ({ page }) => {
 await chooseHindi(page);
 await mock(page);
 await page.goto("/onboarding/guardian");
 await checkHindi(page);
 await page.setViewportSize({ width: 360, height: 800 });
 await checkHindi(page);
 });
