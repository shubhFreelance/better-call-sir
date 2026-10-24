import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import { beginGuardian } from "./guardian-journey";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { operationValidator } from "../helpers/contract";
const learnerId = "20000000-0000-4000-8000-000000000291",
  secondId = "20000000-0000-4000-8000-000000000292";
const college = {
  stage: "COLLEGE",
  institutionName: "Synthetic College",
  subjects: ["Economics", "Statistics"],
  courseName: "BA Economics",
  university: "Synthetic University",
  studyYear: 2,
};
const profile = {
  id: learnerId,
  alias: "Synthetic learner",
  education: college,
  version: 1,
  enquiryEligible: false,
};
async function mock(page: Page, mode = "normal") {
  let saved = false,
    fail = mode === "error",
    unknown = mode === "unknown";
  let recorded = profile;
  const writes: { key: string | null; body: any }[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (p.endsWith("/guardian-verifications")) return route.fulfill({json:{items:[{id:secondId,learnerName:"Synthetic learner",status:"APPROVED",learnerId:saved || ["pagination","student"].includes(mode) ? learnerId : null}],nextCursor:null}});
    if (p.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000291",
            name: "Synthetic guardian",
            role: mode === "student" ? "STUDENT" : "GUARDIAN",
            verified: mode !== "VERIFICATION_REQUIRED",
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (p === "/api/v1/learner-profiles" && req.method() === "POST") {
      writes.push({
        key: req.headers()["idempotency-key"] || null,
        body: req.postDataJSON(),
      });
      saved = true;
      if (unknown) {
        unknown = false;
        return route.abort();
      }
      const value = {
        ...profile,
        alias: req.postDataJSON().alias,
        education: req.postDataJSON().education,
      };
      recorded = value;
      expect(
        operationValidator("/learner-profiles", "post", "201")(value),
      ).toBe(true);
      return route.fulfill({ status: 201, json: value });
    }
    if (p === "/api/v1/learner-profiles") {
      if (fail || (mode === "pagination" && url.searchParams.has("cursor")))
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic history unavailable",
          },
        });
      const status = [
        "VERIFICATION_REQUIRED",
        "CONSENT_REQUIRED",
        "PRIVACY_PAUSED",
      ].includes(mode)
        ? mode
        : mode === "student"
          ? "READ_ONLY"
          : "READY";
      const value = {
        creationStatus: status,
        items: saved
          ? [recorded]
          : ["student", "pagination"].includes(mode)
            ? [profile]
            : [],
        nextCursor: mode === "pagination" ? secondId : null,
      };
      expect(operationValidator("/learner-profiles", "get", "200")(value)).toBe(
        true,
      );
      return route.fulfill({ json: value });
    }
    return route.continue();
  });
  return {
    writes,
    recover: () => {
      fail = false;
    },
  };
}
async function fillCollege(page: Page) {
  await page
    .getByRole("button", { name: "Complete learner profile", exact: true })
    .click();
  await page.getByLabel("Learner name or alias").fill("Synthetic learner");
  await page.getByLabel("Education stage").selectOption("COLLEGE");
  await page.getByLabel("College / institution name").fill("Synthetic College");
  await page.getByLabel("Course / degree").fill("BA Economics");
  await page
    .getByLabel("University / awarding institution")
    .fill("Synthetic University");
  await page.getByLabel("Current year of study").fill("2");
  await page.getByLabel("Subjects studied").fill("Economics, Statistics");
}
test("college profile reviews, edits and saves only the stage-specific API payload", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/learners");
  await fillCollege(page);
  await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("School board")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review the learner profile" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Course / degree")).toHaveValue("BA Economics");
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm and save profile" }).click();
  await expect(
    page.getByText("Synthetic learner’s profile is saved.", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({
    alias: "Synthetic learner",
    education: college,
  });
  await expect(
    page.getByRole("button", { name: "Confirm and save profile" }),
  ).toHaveCount(0);
});
test("unknown profile save locks the form and replays exactly the same request and key", async ({
  page,
}) => {
  const state = await mock(page, "unknown");
  await page.goto("/dashboard/learners");
  await fillCollege(page);
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm and save profile" }).click();
  await expect(
    page.getByText(/We couldn’t confirm whether the profile was saved/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit details", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry profile save" }).click();
  await expect(
    page.getByText("Synthetic learner’s profile is saved.", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
});
for (const mode of [
  "VERIFICATION_REQUIRED",
  "CONSENT_REQUIRED",
  "PRIVACY_PAUSED",
  "student",
])
  test(`learner profile access respects ${mode}`, async ({ page }) => {
    const state = await mock(page, mode);
    await page.goto("/dashboard/learners?new=1");
    if (mode === "student") {
      await expect(
        page.getByText("BA Economics · Year 2", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Complete learner profile", exact: true }),
      ).toHaveCount(0);
    } else
      await expect(
        page.getByRole("button", { name: "Complete learner profile", exact: true }),
      ).toHaveCount(0);
    await expect(page.getByLabel("Learner name or alias")).toHaveCount(0);
    expect(state.writes).toHaveLength(0);
  });
test("read failures and invalid pagination recover without opening creation prematurely", async ({
  page,
}) => {
  const state = await mock(page, "error");
  await page.goto("/dashboard/learners");
  await expect(
    page.getByText(/We couldn’t load the current learner profiles/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete learner profile", exact: true }),
  ).toHaveCount(0);
  state.recover();
  await page.getByRole("button", { name: "Retry learner profiles" }).click();
  await expect(
    page.getByRole("button", { name: "Complete learner profile", exact: true }),
  ).toBeEnabled();
});
test("learner history pagination keeps profiles private and offers first-page recovery", async ({
  page,
}) => {
  await mock(page, "pagination");
  await page.goto("/dashboard/learners");
  await page
    .getByRole("button", { name: "Next profiles", exact: true })
    .click();
  await expect(
    page.getByText(/We couldn’t load the current learner profiles/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to first page", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synthetic learner", exact: true }),
  ).toBeVisible();
});
test("education fields validate by stage and remain accessible on mobile", async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/learners");
  await page
    .getByRole("button", { name: "Complete learner profile", exact: true })
    .click();
  await page.getByLabel("Learner name or alias").fill("");
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await expect(page.getByLabel("Learner name or alias")).toBeFocused();
  await page.getByLabel("Education stage").selectOption("EARLY_YEARS");
  await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
  await page.getByLabel("Early years level").selectOption("KG2");
  await page.getByLabel("Learner name or alias").fill("Synthetic KG learner");
  await page.getByLabel("School / institution name").fill("Synthetic school");
  await page.getByLabel("Subjects studied").fill("Language, language");
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await expect(page.getByText(/Enter 1–20 distinct subjects/)).toBeVisible();
  await page.getByLabel("Subjects studied").fill("Language, Numbers");
  await page.screenshot({
    path: "test-results/learner-education-mobile.png",
    fullPage: true,
  });
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
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await expect(page.getByText("KG2", { exact: true })).toBeVisible();
});
test("real guardian saves a college profile, reloads it and reads the same private record through the API", async ({
  page,
}) => {
  const config = parseEnv(readFileSync(".env", "utf8")),
    url = new URL(config.DATABASE_URL);
  expect(config.APP_MODE).toBe("development");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const pool = new Pool({ connectionString: url.href }),
    id = randomUUID();
  try {
    await pool.query(
      'INSERT INTO "Account" (id,name,role,verified,phone) VALUES ($1,$2,$3,true,$4)',
      [
        id,
        "Synthetic learner education guardian",
        "GUARDIAN",
        "+91000000" + id.replaceAll("-", ""),
      ],
    );
    await pool.query('INSERT INTO "Consent" (id,"guardianId") VALUES ($1,$2)', [
      randomUUID(),
      id,
    ]);
    await pool.query('INSERT INTO "GuardianVerification" (id,"guardianId",region,"guardianName","learnerName",relationship,"ageBand","acknowledgmentMethod","documentNamesGuardian",status,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,now())', [randomUUID(),id,"Raipur","Synthetic guardian","Synthetic learner","PARENT","UNDER_15","STAFF_CALL","APPROVED"]);
    const session = await page.request.post("/api/v1/dev/session", {
      headers: { Origin: "http://localhost:3000" },
      data: { accountId: id },
    });
    expect(session.status()).toBe(201);
    await page.goto("/dashboard/learners");
    await fillCollege(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/learner-education-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Review learner profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm and save profile" })
      .click();
    await expect(
      page.getByText("Synthetic learner’s profile is saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("BA Economics · Year 2", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Class null", { exact: false })).toHaveCount(0);
    const list = await (
      await page.request.get("/api/v1/learner-profiles")
    ).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].education).toEqual(college);
    const detail = await page.request.get(
      "/api/v1/learner-profiles/" + list.items[0].id,
    );
    expect(detail.status()).toBe(200);
    expect((await detail.json()).education).toEqual(college);
    await page.goto("/dashboard");
    await expect(page.getByText("BA Economics", { exact: true })).toBeVisible();
    await page.goto("/dashboard/family?learner=" + list.items[0].id);
    await expect(
      page.getByRole("option", {
        name: "Synthetic learner · BA Economics · Year 2",
        exact: true,
      }),
    ).toHaveCount(1);
    await page.goto("/onboarding/parent");
    await beginGuardian(page);
    await expect(page.getByLabel("Link an existing learner")).toBeVisible();
    await page
      .getByLabel("Link an existing learner")
      .selectOption(list.items[0].id);
    await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("BA Economics · Year 2", { exact: true }),
    ).toBeVisible();
  } finally {
    await pool.query(
      'UPDATE "Account" SET disabled=true,phone=NULL WHERE id=$1',
      [id],
    );
    await pool.query('UPDATE "Session" SET revoked=true WHERE "accountId"=$1', [
      id,
    ]);
    await pool.end();
  }
});

test("school education records Class 12 and explains that teacher fit is still checked", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/dashboard/learners");
  await page
    .getByRole("button", { name: "Complete learner profile", exact: true })
    .click();
  await page
    .getByLabel("Learner name or alias")
    .fill("Synthetic senior learner");
  await page.getByLabel("Class", { exact: true }).selectOption("12");
  await page.getByLabel("School board").fill("cbse");
  await page
    .getByLabel("School / institution name")
    .fill("Synthetic senior school");
  await page.getByLabel("Subjects studied").fill("Physics, Chemistry, Maths");
  await page
    .getByRole("button", { name: "Review learner profile", exact: true })
    .click();
  await expect(
    page.getByText("Class 12 · CBSE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Teacher enquiries support early years, school and college/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and save profile" }).click();
  expect(state.writes[0].body.education).toEqual({
    stage: "SCHOOL",
    grade: 12,
    board: "CBSE",
    institutionName: "Synthetic senior school",
    subjects: ["Physics", "Chemistry", "Maths"],
  });
});

test("Hindi complete interface — विद्यार्थी शिक्षा और प्रोफ़ाइल", async ({
  page,
}) => {
  await chooseHindi(page);
  await mock(page);
  await page.goto("/dashboard/learners");
  await checkHindi(page);
  await page
    .getByRole("button", { name: "विद्यार्थी प्रोफ़ाइल पूरी करें", exact: true })
    .click();
  await page
    .getByLabel("विद्यार्थी का नाम या उपनाम", { exact: true })
    .waitFor();
  await checkHindi(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await checkHindi(page);
});

for (const permission of ["READY", "CONSENT_REQUIRED"]) test(`approved learner is visible before profile creation with ${permission}`, async ({page}) => {
  await mock(page, permission === "READY" ? "normal" : permission);
  const requests: string[] = [];
  await page.route("**/api/v1/guardian-verifications?**", route => {
    requests.push(route.request().url());
    return route.fulfill({json:{items:[{id:secondId,learnerName:"Anshuman",status:"APPROVED",learnerId:null,studentEmail:"synthetic-student@example.test"},{id:learnerId,learnerName:"Pending learner",status:"PENDING_REVIEW",learnerId:null}],nextCursor:null}});
  });
  await page.goto("/dashboard/learners");
  const section=page.getByRole("region",{name:"Verified learners awaiting setup"});
  await expect(section.getByRole("heading",{name:"Anshuman",exact:true})).toBeVisible();
  await expect(section.getByRole("heading",{name:"Pending learner"})).toHaveCount(0);
  await page.getByLabel("Find your learner").fill("An");
  await expect(section.getByRole("heading",{name:"Anshuman",exact:true})).toBeVisible();
  await page.getByLabel("Find your learner").fill("Different child");
  await expect(section.getByRole("heading",{name:"Anshuman",exact:true})).toHaveCount(0);
  await page.getByLabel("Find your learner").fill("An");
  if(permission === "READY") {
    await section.getByRole("button",{name:"Complete learner profile"}).click();
    await expect(page.getByLabel("Learner name or alias")).toHaveValue("Anshuman");
  } else {
    await expect(section.getByRole("link",{name:"Review learning permission"})).toHaveAttribute("href","/onboarding/guardian");
    await expect(section.getByRole("button",{name:"Complete learner profile"})).toHaveCount(0);
  }
  expect(new Set(requests).size).toBe(1);
  expect(requests.length).toBeGreaterThan(0);
});


test("adding another child starts a separate relationship request before education setup", async ({page}) => {
  const state = await mock(page);
  await page.goto("/dashboard/learners");
  await expect(page.getByRole("heading",{name:"Manage children & learners",exact:true})).toBeVisible();
  const add=page.getByRole("link",{name:"Add a child or learner",exact:true});
  await expect(add).toHaveAttribute("href","/guardian-verification?new=1");
  await add.click();
  await expect(page.getByLabel("Guardian's full name")).toBeVisible();
  await expect(page.getByText(/Approval for another child remains valid/)).toBeVisible();
  expect(state.writes).toHaveLength(0);
});
