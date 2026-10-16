import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator } from "../helpers/contract";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
const id = "20000000-0000-4000-8000-000000000391";
const school = {
  stage: "SCHOOL",
  grade: 8,
  board: "CBSE",
  institutionName: "Synthetic school",
  subjects: ["Maths"],
};
async function mock(page: Page, mode = "normal") {
  let current: any = {
    id,
    alias: "Synthetic learner",
    education: school,
    version: 1,
    enquiryEligible: true,
    editStatus: "EDITABLE",
  };
  let first = true,
    readsFail = mode === "read-error",
    applied = 0;
  const writes: { body: any; key: string | undefined }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000391",
            name: "Synthetic guardian",
            role: mode === "student" ? "STUDENT" : "GUARDIAN",
            verified: true,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (
      path === "/api/v1/learner-profiles" &&
      mode === "refresh-error" &&
      applied
    )
      return route.fulfill({
        status: 503,
        json: {
          code: "UNAVAILABLE",
          message: "Synthetic profile refresh unavailable",
        },
      });
    if (path === "/api/v1/learner-profiles")
      return route.fulfill({
        json: {
          items: [current],
          creationStatus: mode === "student" ? "READ_ONLY" : "READY",
          nextCursor: null,
        },
      });
    if (path === "/api/v1/learner-profiles/" + id) {
      if (readsFail)
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic detail unavailable",
          },
        });
      const detail = {
        ...current,
        editStatus:
          mode === "history"
            ? "HISTORY_LINKED"
            : mode === "deleted"
              ? "DELETED"
              : current.editStatus,
      };
      expect(
        operationValidator("/learner-profiles/{id}", "get", "200")(detail),
      ).toBe(true);
      return route.fulfill({ json: detail });
    }
    if (path === "/api/v1/learner-profiles/" + id + "/updates") {
      const body = req.postDataJSON();
      writes.push({ body, key: req.headers()["idempotency-key"] });
      if (mode === "history-late" && first) {
        first = false;
        current = { ...current, editStatus: "HISTORY_LINKED" };
        return route.fulfill({
          status: 409,
          json: {
            code: "PROFILE_HISTORY_LINKED",
            message: "This profile is now linked to enquiry history.",
          },
        });
      }
      if (mode === "stale" && first) {
        first = false;
        current = { ...current, alias: "Newer saved learner", version: 2 };
        return route.fulfill({
          status: 409,
          json: {
            code: "CONFLICT",
            message:
              "This learner profile changed. Reload it before reviewing your changes again.",
          },
        });
      }
      if (applied === 0) {
        applied++;
        current = {
          ...current,
          alias: body.alias,
          education: body.education,
          version: body.expectedVersion + 1,
        };
      }
      if (mode === "unreadable" && first) {
        first = false;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: "{",
        });
      }
      if (mode === "unknown" && first) {
        first = false;
        return route.abort();
      }
      expect(
        operationValidator(
          "/learner-profiles/{id}/updates",
          "post",
          "201",
        )(current),
      ).toBe(true);
      return route.fulfill({ status: 201, json: current });
    }
    return route.continue();
  });
  return {
    writes,
    recover: () => {
      readsFail = false;
    },
    applied: () => applied,
  };
}
async function edit(page: Page) {
  await page.goto("/dashboard/learners");
  await page
    .getByRole("button", {
      name: "Edit profile for Synthetic learner",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit education details", exact: true }),
  ).toBeFocused();
}
async function review(page: Page) {
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Review the learner profile",
      exact: true,
    }),
  ).toBeFocused();
}
test("guardian edits latest saved education, reviews the stage change and saves one explicit update", async ({
  page,
}) => {
  const state = await mock(page);
  await edit(page);
  await expect(page.getByLabel("Class", { exact: true })).toHaveValue("8");
  await page.getByLabel("Education stage").selectOption("COLLEGE");
  await page
    .getByLabel("Learner name or alias")
    .fill("Synthetic revised learner");
  await page.getByLabel("College / institution name").fill("Synthetic college");
  await page.getByLabel("Course / degree").fill("BSc Physics");
  await page
    .getByLabel("University / awarding institution")
    .fill("Synthetic university");
  await page.getByLabel("Current year of study").fill("1");
  await page.getByLabel("Subjects studied").fill("Physics, Statistics");
  await review(page);
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Course / degree")).toHaveValue("BSc Physics");
  await review(page);
  await page
    .getByRole("button", { name: "Confirm and save changes", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic revised learner’s profile is saved.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({
    alias: "Synthetic revised learner",
    education: {
      stage: "COLLEGE",
      institutionName: "Synthetic college",
      courseName: "BSc Physics",
      university: "Synthetic university",
      studyYear: 1,
      subjects: ["Physics", "Statistics"],
    },
    expectedVersion: 1,
    confirmed: true,
  });
  await page.reload();
  await expect(
    page.getByText("BSc Physics · Year 1", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain("Synthetic revised learner");
});
for (const mode of ["unknown", "unreadable"])
  test(
    mode +
      " update response locks editing and retries the identical profile, version and key",
    async ({ page }) => {
      const state = await mock(page, mode);
      await edit(page);
      await page.getByLabel("Class", { exact: true }).selectOption("9");
      await review(page);
      await page
        .getByRole("button", { name: "Confirm and save changes", exact: true })
        .click();
      await expect(
        page.getByText(/We couldn’t confirm whether your changes were saved/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Edit details", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "Edit profile for Synthetic learner",
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Retry profile save", exact: true })
        .click();
      await expect(
        page.getByText("Synthetic learner’s profile is saved.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(state.writes).toHaveLength(2);
      expect(state.writes[1]).toEqual(state.writes[0]);
      expect(state.applied()).toBe(1);
    },
  );
test("stale updates retain local review until explicit reload and renewed review of the current version", async ({
  page,
}) => {
  const state = await mock(page, "stale");
  await edit(page);
  await page.getByLabel("Learner name or alias").fill("Local unsaved learner");
  await review(page);
  await page
    .getByRole("button", { name: "Confirm and save changes", exact: true })
    .click();
  await expect(page.getByText(/Your edits are retained/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local unsaved learner", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm and save changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Discard edits and reload profile",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Learner name or alias")).toHaveValue(
    "Newer saved learner",
  );
  expect(state.writes).toHaveLength(1);
  await review(page);
  await page
    .getByRole("button", { name: "Confirm and save changes", exact: true })
    .click();
  await expect(
    page.getByText("Newer saved learner’s profile is saved.", { exact: true }),
  ).toBeVisible();
  expect(state.writes[1].body.expectedVersion).toBe(2);
  expect(state.writes[1].key).not.toBe(state.writes[0].key);
});
for (const mode of ["history", "deleted"])
  test(
    mode + " profile stays read-only with a correction recovery route",
    async ({ page }) => {
      const state = await mock(page, mode);
      await page.goto("/dashboard/learners");
      await page
        .getByRole("button", {
          name: "Edit profile for Synthetic learner",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(
          mode === "history"
            ? /linked to enquiry or learning history/
            : /was deleted and cannot be restored/,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "Review privacy and correction requests",
          exact: true,
        }),
      ).toHaveAttribute("href", "/dashboard/privacy");
      await expect(page.getByLabel("Learner name or alias")).toHaveCount(0);
      expect(state.writes).toHaveLength(0);
    },
  );
test("detail read failures never open stale form data; retry and cancel leave the profile untouched", async ({
  page,
}) => {
  const state = await mock(page, "read-error");
  await page.goto("/dashboard/learners");
  await page
    .getByRole("button", {
      name: "Edit profile for Synthetic learner",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/We couldn’t load the latest learner profile/),
  ).toBeVisible();
  await expect(page.getByLabel("Learner name or alias")).toHaveCount(0);
  state.recover();
  await page
    .getByRole("button", {
      name: "Edit profile for Synthetic learner",
      exact: true,
    })
    .click();
  await page.getByLabel("Learner name or alias").fill("Discarded local name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic learner", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
});
test("linked students have no education editing or update controls", async ({
  page,
}) => {
  const state = await mock(page, "student");
  await page.goto("/dashboard/learners");
  await expect(
    page.getByText(/Your guardian currently manages education details/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Edit profile for/ }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
test("real guardian edits an unlinked learner and sees the updated private profile after reload", async ({
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
        "Synthetic profile editing guardian",
        "GUARDIAN",
        "+91000000" + account.replaceAll("-", ""),
      ],
    );
    await db.query('INSERT INTO "Consent" (id,"guardianId") VALUES ($1,$2)', [
      randomUUID(),
      account,
    ]);
    const session = await page.request.post("/api/v1/dev/session", {
      headers: { Origin: "http://localhost:3000" },
      data: { accountId: account },
    });
    expect(session.status()).toBe(201);
    const created = await page.request.post("/api/v1/learner-profiles", {
      headers: {
        Origin: "http://localhost:3000",
        "X-CSRF-Token": (await session.json()).csrfToken,
        "Idempotency-Key": randomUUID(),
      },
      data: { alias: "Synthetic learner", education: school },
    });
    expect(created.status()).toBe(201);
    const learner = await created.json();
    await edit(page);
    await page.getByLabel("Class", { exact: true }).selectOption("9");
    await page.getByLabel("Subjects studied").fill("Maths, Physics");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (await new AxeBuilder({ page }).include(".learner-profiles").analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/learner-profile-edit-mobile.png",
      fullPage: true,
    });
    await review(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/learner-profile-edit-review-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Confirm and save changes", exact: true })
      .click();
    await expect(
      page.getByText("Synthetic learner’s profile is saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Class 9 · CBSE", { exact: true }),
    ).toBeVisible();
    const response = await page.request.get(
      "/api/v1/learner-profiles/" + learner.id,
    );
    expect(response.status()).toBe(200);
    const detail = await response.json();
    expect(detail.version).toBe(2);
    expect(detail.education.subjects).toEqual(["Maths", "Physics"]);
    expect(
      (
        await db.query(
          'SELECT COUNT(*) FROM "Audit" WHERE "aggregateId"=$1 AND action=$2',
          [learner.id, "LEARNER_PROFILE_UPDATED"],
        )
      ).rows[0].count,
    ).toBe("1");
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

test("enquiry created after opening an edit blocks writes and reloads into the history recovery route", async ({
  page,
}) => {
  const state = await mock(page, "history-late");
  await edit(page);
  await page.getByLabel("Class", { exact: true }).selectOption("9");
  await review(page);
  await page
    .getByRole("button", { name: "Confirm and save changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm and save changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Discard edits and reload profile",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/linked to enquiry or learning history/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Get help with education details",
      exact: true,
    }),
  ).toHaveAttribute("href", "/dashboard/support");
  await expect(page.getByLabel("Learner name or alias")).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});
test("confirmed update followed by a failed list refresh never reopens save or sends the update twice", async ({
  page,
}) => {
  const state = await mock(page, "refresh-error");
  await edit(page);
  await review(page);
  await page
    .getByRole("button", { name: "Confirm and save changes", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic learner’s profile is saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/We couldn’t load the current learner profiles/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm and save changes", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});
