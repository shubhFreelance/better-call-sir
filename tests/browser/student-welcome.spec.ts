import { chooseHindi, checkHindi } from "../helpers/hindi";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { operationValidator, validator } from "../helpers/contract";
test.use({ trace: "off" });
async function setup(page: Page, mode = "normal") {
  let progress: any = {
    kind: "STUDENT",
    state: "ACTIVE",
    draft: {},
    version: 0,
    completedResourceId: null,
  };
  const learner: any = {
    id: "20000000-0000-4000-8000-000000000424",
    alias: "Synthetic student",
    education: {
      stage: "SCHOOL",
      grade: 8,
      board: "CBSE",
      institutionName: "Synthetic school",
      subjects: ["Maths", "Science"],
    },
    version: 1,
    enquiryEligible: mode !== "incomplete",
  };
  if (mode === "college")
    learner.education = {
      stage: "COLLEGE",
      institutionName: "Synthetic college",
      subjects: ["Mechanics", "Calculus"],
      courseName: "BSc Physics",
      university: "Synthetic university",
      studyYear: 2,
    };
  if (mode === "early")
    learner.education = {
      stage: "EARLY_YEARS",
      institutionName: "Synthetic early school",
      subjects: ["Language", "Numbers"],
      level: "KG2",
    };
  if(mode === "legacy") progress={kind:"STUDENT",state:"READY",version:3,completedResourceId:learner.id,draft:{subjects:["Maths","Science"],language:"Hindi",learningPreferences:"Existing shared notes"}};
  let first = true,
    fail = mode === "load-error",
    denied = false;
  const bodies: any[] = [],
    keys: (string | undefined)[] = [], searches: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/auth/session"))
      return route.fulfill({
        json: {
          account: {
            id: "10000000-0000-4000-8000-000000000424",
            name: "Synthetic student",
            role: "STUDENT",
            verified: false,
          },
          csrfToken: "synthetic-csrf",
        },
      });
    if (path.endsWith("/learning-management")) return route.fulfill({json:{childId:learner.id,mode:"STUDENT_LED",version:1,canManageLearning:true,canChangeManagement:false}});
    if(path.endsWith("/learning-spaces")) return route.fulfill({json:{learner,spaces:progress.draft.spaces||(progress.draft.subjects||[]).map((subject:string)=>({subject,language:progress.draft.language})),version:progress.version}});
    if (path.endsWith("/learner-profiles")) return route.fulfill({json:{items:[learner],nextCursor:null}});
    if (path.endsWith("/teachers")) { searches.push(new URL(req.url())); return route.fulfill({json:{items:[],nextCursor:null}}); }
    if (path.endsWith("/onboarding/student/context")) {
      if (denied)
        return route.fulfill({
          status: 403,
          json: {
            code: "PRIVACY_PENDING",
            message: "Guardian permission needs review",
          },
        });
      if (fail)
        return route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "Synthetic setup read unavailable",
          },
        });
      const value = { learner, progress, spacesVersion:progress.version, authority: "GUARDIAN_MANAGED" };
      expect(
        operationValidator("/onboarding/student/context", "get", "200")(value),
      ).toBe(true);
      return route.fulfill({ json: value });
    }
    if (path.endsWith("/onboarding/student/confirmations")) {
      const body = req.postDataJSON();
      expect(validator("StudentSetupConfirmation")(body)).toBe(true);
      bodies.push(body);
      keys.push(req.headers()["idempotency-key"]);
      if (mode === "denied") {
        denied = true;
        return route.fulfill({
          status: 403,
          json: {
            code: "PRIVACY_PENDING",
            message: "Guardian permission needs review",
          },
        });
      }
      if (["stale", "education-stale"].includes(mode) && first) {
        first = false;
        if (mode === "stale")
          progress = {
            ...progress,
            version: 1,
            draft: {
              managementPreference: "GUARDIAN_GUIDED",
              subjects:["Maths"],
              learningPreferences: "Newer saved preference",
            },
          };
        else {
          learner.version = 2;
          learner.education.grade = 9;
        }
        return route.fulfill({
          status: 409,
          json: {
            code: mode === "stale" ? "CONFLICT" : "LEARNER_CHANGED",
            message:
              "The saved setup or education profile changed. Reload and review.",
          },
        });
      }
      if (first) {
        progress = {
          kind: "STUDENT",
          state: "READY",
          draft: {...body.draft,...(body.draft.spaces ? {subjects:body.draft.spaces.map((space:any)=>space.subject)} : {})},
          version: body.expectedVersion + 1,
          completedResourceId: learner.id,
        };
        first = false;
        if (mode === "uncertain") return route.abort();
        if (mode === "unreadable")
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: "{",
          });
      } else if (!["uncertain", "unreadable"].includes(mode))
        progress = {
          ...progress,
          draft: {...body.draft,...(body.draft.spaces ? {subjects:body.draft.spaces.map((space:any)=>space.subject)} : {})},
          version: body.expectedVersion + 1,
        };
      expect(
        operationValidator(
          "/onboarding/student/confirmations",
          "post",
          "201",
        )(progress),
      ).toBe(true);
      return route.fulfill({ status: 201, json: progress });
    }
    return route.continue();
  });
  return {
    bodies,
    keys,
    searches,
    recover: () => {
      fail = false;
    },
    failReads: () => {
      fail = true;
    },
  };
}
async function openEditor(page:Page) {
  await expect(page.locator(".student-welcome")).toBeVisible();
  await expect(page.getByText("Loading your student setup\u2026",{exact:true})).toHaveCount(0);
  const add=page.getByRole("button",{name:"Add a subject space",exact:true});
  if(await add.isVisible() && await add.isEnabled()) await add.click();
}
async function choose(page: Page) {
  await openEditor(page);
  if(await page.getByRole("radio").count() && !(await page.locator('input[name="student-space-subject"]:checked').count())) await page.getByRole("radio").first().check();
  await page
    .getByRole("checkbox", {
      name: "These education details are correct",
      exact: true,
    })
    .check();
  await expect(page.locator(".student-support-choices")).toHaveCount(0);
}
async function review(page: Page) {
  await page
    .getByRole("button", { name: "Review student setup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Review your student setup",
      exact: true,
    }),
  ).toBeFocused();
}
async function save(page: Page) {
  await page
    .getByRole("button", {
      name: "Confirm and save student setup",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your student setup is saved.",
      exact: true,
    }),
  ).toBeVisible();
}
test("subject spaces keep the dashboard sidebar, saved summary and five-second toast; adding and editing preserve other subjects",async({page})=>{
 const state=await setup(page);await page.goto("/onboarding/student");
 await expect(page.locator(".dashboard-sidebar")).toBeVisible();
 await expect(page.locator(".student-subject-card")).toHaveCount(1);
 await openEditor(page);await choose(page);await page.getByLabel("Language you prefer (optional)").selectOption("Hindi");
 await page.getByLabel("How do you like to learn? (optional)").fill("Use pictures");await review(page);await page.clock.install();await save(page);
 await expect(page.locator(".student-setup-steps [aria-current=step]")).toHaveText("3 \u00b7 Setup saved");
 await expect(page.locator(".action-toast")).toContainText("Your student setup is saved.");await page.clock.fastForward(5000);await expect(page.locator(".action-toast")).toHaveCount(0);
 await expect(page.locator(".student-setup-actions .filter-button")).toHaveCount(3);
 await page.reload();await expect(page.getByRole("button",{name:"Edit Maths space",exact:true})).toBeVisible();await expect(page.locator(".action-toast")).toHaveCount(0);
 await expect(page.locator(".student-subject-card").first()).toContainText("Hindi");
 await openEditor(page);await page.getByRole("checkbox",{name:"These education details are correct",exact:true}).check();await page.getByRole("radio",{name:"Science",exact:true}).check();await review(page);await save(page);
 expect(state.bodies[1].draft.spaces).toEqual([{subject:"Maths",language:"Hindi",learningPreferences:"Use pictures"},{subject:"Science"}]);
 await page.getByRole("button",{name:"Back to subject spaces",exact:true}).click();
 await expect(page.locator(".student-subject-card")).toHaveCount(3);
 const cards=page.locator(".student-subject-card");expect(await cards.first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe("rgb(228, 228, 208)");
 await page.getByRole("button",{name:"Edit Maths space",exact:true}).click();await expect(page.getByLabel("Language you prefer (optional)")).toHaveValue("Hindi");await choose(page);
 await page.getByRole("radio",{name:"Science",exact:true}).click();
 await expect(page.locator(".action-toast")).toContainText("You cannot change the subject because you have already created a space for it.");expect(state.bodies).toHaveLength(2);
 await page.getByRole("radio",{name:"Maths",exact:true}).check();await page.getByLabel("Language you prefer (optional)").selectOption("English");await review(page);await save(page);
 expect(state.bodies[2].draft.spaces).toEqual([{subject:"Science"},{subject:"Maths",language:"English",learningPreferences:"Use pictures"}]);
 await page.getByRole("button",{name:"Back to subject spaces",exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});await page.addStyleTag({content:"nextjs-portal {display:none}"});await page.screenshot({path:"test-results/student-subject-spaces.png",fullPage:true});
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).include(".student-welcome").analyze()).violations).toEqual([]);
});
test("saved setup carries its learner, selected subject and preferred language into teacher discovery",async({page})=>{
 const state=await setup(page);await page.goto("/onboarding/student");await choose(page);
 await page.getByLabel("Language you prefer (optional)").selectOption("Hindi");await review(page);await save(page);
 await page.reload();await page.getByRole("link",{name:"Maths",exact:true}).click();
 await expect.poll(()=>state.searches.some(url=>url.searchParams.get("learnerId")==="20000000-0000-4000-8000-000000000424"&&url.searchParams.get("subject")==="Maths"&&url.searchParams.get("language")==="Hindi")).toBe(true);
});
test("education acknowledgement and one subject are required before review", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/onboarding/student");await openEditor(page);
  await page
    .getByRole("button", { name: "Review student setup", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "These education details are correct",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("checkbox", {
      name: "These education details are correct",
      exact: true,
    })
    .check();
  await choose(page);
  await page.getByRole("radio", { name: "Maths", exact: true }).check();
  await page.getByLabel("Other subject").fill("Maths, Science");
  await page
    .getByRole("button", { name: "Review student setup", exact: true })
    .click();
  await expect(page.getByLabel("Other subject")).toBeFocused();
  await expect(
    page.getByText("Choose one subject for this space.",{exact:true}).first(),
  ).toBeVisible();
  expect(state.bodies).toHaveLength(0);
});
for (const mode of ["uncertain", "unreadable"])
  test(
    mode +
      " student setup writes freeze details and retry the identical reviewed body and key",
    async ({ page }) => {
      const state = await setup(page, mode);
      await page.goto("/onboarding/student");await openEditor(page);
      await choose(page);
      await review(page);
      await page
        .getByRole("button", {
          name: "Confirm and save student setup",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/We couldn’t confirm whether your setup was saved/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Edit setup details", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", {
          name: "Retry saving student setup",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your student setup is saved.",
          exact: true,
        }),
      ).toBeVisible();
      expect(state.bodies).toHaveLength(2);
      expect(state.bodies[1]).toEqual(state.bodies[0]);
      expect(state.keys[1]).toBe(state.keys[0]);
    },
  );
for (const mode of ["stale", "education-stale"])
  test(
    mode +
      " changes retain the local review until explicit reload and require education review again",
    async ({ page }) => {
      await setup(page, mode);
      await page.goto("/onboarding/student");await openEditor(page);
      await choose(page);
      await page
        .getByLabel("How do you like to learn? (optional)")
        .fill("Local unsaved preference");
      await review(page);
      await page
        .getByRole("button", {
          name: "Confirm and save student setup",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("Local unsaved preference", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Confirm and save student setup",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByRole("button", {
          name: "Reload latest student setup",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("checkbox", {
          name: "These education details are correct",
          exact: true,
        }),
      ).not.toBeChecked();
      if (mode === "stale")
        await expect(
          page.getByLabel("How do you like to learn? (optional)"),
        ).toHaveValue("");
      else
        await expect(
          page.getByText("Class 9 · CBSE", { exact: true }),
        ).toBeVisible();
    },
  );
test("failed reload retains reviewed local edits and blocks saves until fresh context is available", async ({
  page,
}) => {
  const state = await setup(page, "stale");
  await page.goto("/onboarding/student");await openEditor(page);
  await choose(page);
  await page
    .getByLabel("How do you like to learn? (optional)")
    .fill("Preserve this local edit");
  await review(page);
  await page
    .getByRole("button", {
      name: "Confirm and save student setup",
      exact: true,
    })
    .click();
  state.failReads();
  await page
    .getByRole("button", { name: "Reload latest student setup", exact: true })
    .click();
  await expect(
    page.getByText("Preserve this local edit", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm and save student setup",
      exact: true,
    }),
  ).toBeDisabled();
  state.recover();
  await page
    .getByRole("button", { name: "Retry loading student setup", exact: true })
    .click();
  await expect(
    page.getByLabel("How do you like to learn? (optional)"),
  ).toHaveValue("");
});
test("failed initial reads block setup entry and can recover while guardian support stays available", async ({
  page,
}) => {
  const state = await setup(page, "load-error");
  await page.goto("/onboarding/student");await openEditor(page);
  await expect(
    page.getByText(/We couldn’t load your saved student setup/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review student setup", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "Learning preferences",
      exact: true,
    }),
  ).toHaveAttribute("href", "/onboarding/student");
  state.recover();
  await page
    .getByRole("button", { name: "Retry loading student setup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add a subject space", exact: true }),
  ).toBeVisible();
});
test("revoked permission hides the previously loaded form and offers guardian recovery", async ({
  page,
}) => {
  await setup(page, "denied");
  await page.goto("/onboarding/student");await openEditor(page);
  await choose(page);
  await review(page);
  await page
    .getByRole("button", {
      name: "Confirm and save student setup",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Your student access or guardian permission needs review/),
  ).toBeVisible();
  await expect(page.getByText("Synthetic school", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Confirm and save student setup",
      exact: true,
    }),
  ).toHaveCount(0);
});
for (const mode of ["college", "early"])
  test(
    mode +
      " education uses its real level and subjects without school-grade assumptions",
    async ({ page }) => {
      const state = await setup(page, mode);
      await page.goto("/onboarding/student");await openEditor(page);
      await expect(
        page.getByText(mode === "college" ? "BSc Physics · Year 2" : "KG2", {
          exact: true,
        }),
      ).toBeVisible();
      await choose(page);
      await page
        .getByRole("radio", {
          name: mode === "college" ? "Mechanics" : "Language",
          exact: true,
        })
        .check();
      await review(page);
      await save(page);
      expect(state.bodies[0].draft.spaces).toEqual([{subject:mode === "college" ? "Mechanics" : "Language"}]);
    },
  );
test("incomplete education cannot be confirmed and guides the student back to their guardian", async ({
  page,
}) => {
  const state = await setup(page, "incomplete");
  await page.goto("/onboarding/student");await openEditor(page);
  await expect(
    page.getByText(/Some education details are missing/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review student setup", exact: true }),
  ).toHaveCount(0);
  expect(state.bodies).toHaveLength(0);
});
test("student setup and review have accessible desktop/mobile layouts with current permissions stated", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/onboarding/student");await openEditor(page);
  await choose(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/student-setup-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width <= 640) {
      for (const button of await page
        .locator(".student-setup-form button:visible")
        .all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const actions = await page
        .locator(".student-setup-form .student-setup-actions > *")
        .evaluateAll((buttons) =>
          buttons.map((b) => b.getBoundingClientRect().width),
        );
      expect(Math.abs(actions[0] - actions[1])).toBeLessThan(1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).include(".student-welcome").analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({
    path: "test-results/student-setup-mobile.png",
    fullPage: true,
  });
  await review(page);
  await expect(page.locator(".student-setup-actions .filter-button")).toHaveCount(2);
  await expect(page.locator(".student-review-authority")).toContainText("Student leads; guardian stays involved");
  await page.setViewportSize({width:1440,height:1000});
  await page.locator(".student-setup-form").screenshot({path:"test-results/student-review-card-desktop.png"});
  await page.setViewportSize({width:390,height:844});
  expect(
    (await new AxeBuilder({ page }).include(".student-welcome").analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/student-setup-review-mobile.png",
    fullPage: true,
  });
  await expect(
    page.getByText(
      "Saving these preferences does not change who manages learning.",
      { exact: true },
    ),
  ).toBeVisible();
});

 test("Hindi complete interface — विद्यार्थी सहायता और पसंद", async ({ page }) => {
 await chooseHindi(page);
 await setup(page);
 await page.goto("/onboarding/student");await openEditor(page);
 await checkHindi(page);
 await page.setViewportSize({ width: 360, height: 800 });
 await checkHindi(page);
 });

test("existing saved subjects become individual cards and editing one retains the others",async({page})=>{
 const state=await setup(page,"legacy");await page.goto("/onboarding/student");
 await expect(page.getByRole("button",{name:"Edit Maths space",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Edit Science space",exact:true})).toBeVisible();
 await expect(page.locator(".student-subject-card")).toHaveCount(3);
 await page.getByRole("button",{name:"Edit Science space",exact:true}).click();await expect(page.getByLabel("Language you prefer (optional)")).toHaveValue("Hindi");await expect(page.getByLabel("How do you like to learn? (optional)")).toHaveValue("Existing shared notes");
 await choose(page);await page.getByLabel("Language you prefer (optional)").selectOption("English");await review(page);await save(page);
 expect(state.bodies[0]).toMatchObject({expectedVersion:3,draft:{spaces:[{subject:"Maths",language:"Hindi",learningPreferences:"Existing shared notes"},{subject:"Science",language:"English",learningPreferences:"Existing shared notes"}]}});
});
