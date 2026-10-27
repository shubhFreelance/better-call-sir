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
      if (p.endsWith("/learning-spaces") && options.manual) return route.fulfill({json:{learner:profile,spaces:[{subject:"Maths"}],version:1}});
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
    rows,
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
  test("request summary shows the live proposal stage and opens its exact conversation in a nested modal",async({page})=>{
    const f=await fixture(page,{role:"STUDENT",mode:"SHARED",history:true});const conversationId="30000000-0000-4000-8000-000000000899";const source={...f.rows[0],discoveryMethod:"MANUAL",directEnquiryId:conversationId,candidates:[]};const replies:any[]=[];let denied=false;
    const item:any={id:conversationId,kind:"GUARDIAN",sourceId:enquiryId,ownerId:guardian,childId:learner,teacherId:"40000000-0000-4000-8000-000000000899",region:"Raipur",status:"PROPOSED",proposal:{format:"ONE_TO_ONE",timing:"Monday 5pm IST",message:"I am occupied at 6pm.",schedule:{timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:1020,endMinute:1080}]},timezone:"Asia/Kolkata"},arrangementId:null,version:1,createdAt:"2026-10-27T10:00:00Z",updatedAt:"2026-10-27T10:00:00Z",subject:"Maths",mode:"ONLINE",language:"English",parentName:"Synthetic guardian",teacherName:"Synthetic teacher",preferredTime:JSON.stringify({timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:1080,endMinute:1200}]}),learner:{name:"Synthetic Learner",grade:8,board:"CBSE",institution:"Synthetic School",subjects:["Maths"]},canReply:false,canDecide:true,sourceOpen:true,sourceVersion:1};
    await page.route("**/api/v1/requests/"+enquiryId,route=>route.fulfill({json:source}));
    await page.route("**/api/v1/direct-enquiries**",route=>{
      if(route.request().method()==="POST"){const body=route.request().postDataJSON();replies.push(body);Object.assign(item,{status:"PENDING",proposal:{...item.proposal,familyConfirmed:true},version:2});return route.fulfill({status:201,json:item});}
      if(denied)return route.fulfill({status:403,json:{code:"FORBIDDEN",message:"Enquiry unavailable."}});
      const target=new URL(route.request().url()).searchParams.get("id");if(!target)return route.fulfill({json:{items:[],counts:{},nextCursor:null}});expect(target).toBe(conversationId);return route.fulfill({json:{items:[item],counts:{[item.status]:1},nextCursor:null}});
    });
    await page.setViewportSize({width:1440,height:1100});await page.goto("/dashboard/learning-choices?request="+enquiryId);const summary=page.locator(".tuition-request-review"),stage=summary.locator(".direct-stage-summary"),eye=stage.getByRole("button",{name:"View current enquiry status",exact:true});await expect(stage).toContainText("Alternative proposed");await expect(summary.getByText("Awaiting reviewed teacher options",{exact:true})).toHaveCount(0);await expect(summary.getByRole("heading",{name:"Reviewed teacher options",exact:true})).toHaveCount(0);await stage.screenshot({path:"test-results/proposal-stage-summary.png",style:"nextjs-portal{display:none!important}"});
    await expect(stage).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(stage.locator('..')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(stage).toHaveCSS('border-top-width','0px');const statusBounds=await stage.boundingBox(),eyeBounds=await eye.boundingBox();expect(eyeBounds!.x).toBeGreaterThan(statusBounds!.x+statusBounds!.width/2);
    await eye.click();const statusDialog=page.getByRole("dialog",{name:"Current enquiry status",exact:true});await expect(statusDialog).toContainText("Monday 5pm IST");await expect(statusDialog).toContainText("I am occupied at 6pm.");await statusDialog.getByRole("button",{name:"Accept proposal",exact:true}).click();await expect(page.locator(".app-modal[open]")).toHaveCount(3);await page.keyboard.press("Escape");await expect(statusDialog).toBeVisible();await expect(page.locator(".app-modal[open]")).toHaveCount(2);expect(replies).toHaveLength(0);
    await page.setViewportSize({width:360,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include(".app-modal[open]").analyze()).violations).toEqual([]);await statusDialog.screenshot({path:"test-results/proposal-current-status-modal.png",style:"nextjs-portal{display:none!important}"});
    await statusDialog.getByRole("button",{name:"Accept proposal",exact:true}).click();const reply=page.getByRole("dialog",{name:"Review your reply",exact:true});await reply.getByRole("checkbox").check();await reply.getByRole("button",{name:"Confirm reply",exact:true}).click();await expect(statusDialog).toBeVisible();await expect(stage).toContainText("Proposal confirmed by family");await expect(stage).toContainText("Waiting for the teacher");expect(replies[0]).toMatchObject({action:"ACCEPT_PROPOSAL",expectedVersion:1,expectedSourceVersion:1,confirmed:true});
    await statusDialog.getByRole("button",{name:"Close",exact:true}).click();await expect(eye).toBeFocused();await expect(page.locator(".app-modal[open]")).toHaveCount(1);await expect(stage).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(stage.locator('..')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await summary.screenshot({path:'test-results/enquiry-summary-clean-mobile.png',style:'nextjs-portal{display:none!important}'});
    Object.assign(item,{status:"ACCEPTED",proposal:{...item.proposal,agreedTiming:"Monday 5pm IST"},arrangementId:"50000000-0000-4000-8000-000000000899",version:3});await summary.getByRole("button",{name:"Refresh enquiries",exact:true}).click();await expect(stage.locator(".status-badge")).toHaveText("Accepted");
    denied=true;await summary.getByRole("button",{name:"Refresh enquiries",exact:true}).click();await expect(summary.getByRole("alert")).toContainText("Current enquiry status could not be loaded.");await expect(stage).toHaveCount(0);
  });

  test("saved enquiry inbox filters statuses and opens the exact source beyond the current history page",async({page})=>{
    const f=await fixture(page,{role:"STUDENT",mode:"SHARED",history:true});
    const secondId="20000000-0000-4000-8000-000000000822", reads:string[]=[];
    const sources=[{...f.rows[0],candidates:[]},{...f.rows[0],id:secondId,subject:"Science",candidates:[]}];
    const items=sources.map((source,n)=>({id:`30000000-0000-4000-8000-00000000082${n}`,sourceId:source.id,kind:"GUARDIAN",status:n?"ACCEPTED":"PENDING",sourceOpen:true,learner:{name:"Synthetic Learner"},subject:source.subject,teacherName:"Synthetic Teacher",createdAt:"2026-10-26T10:00:00Z",canReply:false,canDecide:false,proposal:null}));
    await page.route("**/api/v1/direct-enquiries**",route=>{const status=new URL(route.request().url()).searchParams.get("status");reads.push(status||"ALL");return route.fulfill({json:{items:items.filter(item=>!status||item.status===status),counts:{PENDING:1,ACCEPTED:1},nextCursor:null}});});
    await page.route("**/api/v1/requests/"+secondId,route=>route.fulfill({json:sources[1]}));
    await page.goto("/dashboard/learning-choices");const panel=page.locator(".direct-inbox");
    await expect(panel.getByRole("button",{name:/^View enquiry /})).toHaveCount(2);
    await panel.getByRole("button",{name:"Accepted",exact:true}).click();await expect(panel.locator(".direct-enquiry-card")).toHaveCount(1);
    const eye=panel.getByRole("button",{name:"View enquiry Science",exact:true});await expect(eye).toHaveText("");await expect(eye.locator("svg")).toHaveCount(1);await eye.click();await expect(page).toHaveURL(new RegExp("request="+secondId));
    await expect(page.getByRole("dialog",{name:"View saved enquiry",exact:true})).toBeVisible();expect(await page.locator(".app-modal[open]").evaluate(node=>getComputedStyle(node,"::backdrop").backgroundColor)).toBe("rgba(0, 0, 0, 0.6)");await expect(page.locator(".tuition-request-review h2")).toContainText("Science");await page.keyboard.press("Escape");await expect(eye).toBeFocused();await eye.click();await page.reload();await expect(page.locator(".tuition-request-review h2")).toContainText("Science");await page.setViewportSize({width:360,height:850});expect((await new AxeBuilder({page}).include(".app-modal[open]").analyze()).violations).toEqual([]);await page.locator(".app-modal[open]").screenshot({path:"test-results/saved-enquiry-modal.png",style:"nextjs-portal{display:none!important}"});
    await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click();await expect(page).not.toHaveURL(/request=/);await panel.getByRole("button",{name:"All",exact:true}).click();await expect(page.locator(".direct-inbox .direct-enquiry-card")).toHaveCount(2);
    expect(reads).toContain("ACCEPTED");expect(f.writes).toHaveLength(0);
    await page.setViewportSize({width:360,height:850});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include(".direct-inbox").analyze()).violations).toEqual([]);
    await page.locator(".direct-inbox").screenshot({path:"test-results/saved-enquiry-inbox.png",style:"nextjs-portal{display:none!important}"});
    await page.route("**/api/v1/requests/"+secondId,route=>route.fulfill({status:404,json:{code:"NOT_FOUND",message:"Enquiry unavailable."}}));
    await page.goto("/dashboard/learning-choices?request="+secondId);await expect(page.getByRole("button",{name:"Reload learning choices",exact:true})).toBeVisible();await expect(page.locator(".tuition-request-review")).toHaveCount(0);
  });
  for (const hindi of [false,true]) test(`management settings use compact themed cards and accessible guidance (${hindi ? "Hindi phone" : "English desktop"})`,async({page})=>{
    if(hindi) await chooseHindi(page);
    await fixture(page,{mode:"STUDENT_LED"});await page.setViewportSize({width:hindi?320:1440,height:1000});await page.goto("/dashboard/learning-management");
    const workspace=page.locator(".learning-management-workspace");
    await expect(workspace.locator(".management-page-heading")).toHaveCSS("background-color","rgb(3, 79, 70)");
    await expect(workspace.locator(".management-current p")).toHaveCSS("font-size","13px");
    await expect(workspace.locator(".management-permission-note p")).toHaveCSS("font-size","12px");
    const info=workspace.locator(".management-current .info-tooltip-trigger");await info.focus();await info.press("Enter");await expect(page.getByRole("tooltip").locator("li")).toHaveCount(2);await page.keyboard.press("Escape");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include(".learning-management-workspace").analyze()).violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
    await workspace.screenshot({path:`test-results/management-settings-${hindi?"hi-phone":"desktop"}.png`});
    await workspace.locator(".management-review-action").click();
    await expect(workspace.locator(".care-editor .filter-button-group .filter-button")).toHaveCount(2);
  });
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
      page.getByText("We manage learning together", { exact:true }),
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
      page.getByText("Student leads; guardian stays involved", { exact:true }),
    ).toHaveCount(0);
    f.restore();
    await page
      .getByRole("button", { name: "Reload learning permissions", exact: true })
      .last()
      .click();
    await expect(
      page.getByText("Student leads; guardian stays involved", { exact:true }),
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
    await page.getByRole("combobox",{name:"Choose an enquiry",exact:true}).selectOption(enquiryId);
    await expect(
      page.getByRole("button", { name: "Ask guardian to decide", exact: true }),
    ).toBeDisabled();
    expect(f.writes).toHaveLength(0);
  });
  for(const [width,hindi] of [[1440,false],[390,false],[320,true]] as const) {
    test(`learner choices card is compact and accessible at ${width}px (${hindi ? "Hindi" : "English"})`,async({page})=>{
      if(hindi) await chooseHindi(page);
      const f=await fixture(page,{role:"STUDENT",history:true});await page.setViewportSize({width,height:1000});
      await page.goto("/dashboard/learning-choices");const card=page.locator(".learner-choice-card");
      await expect(card.locator("h2")).toHaveCSS("font-size","22px");
      await expect(card.locator(".learner-choice-guidance")).toHaveCSS("font-size","12px");
      await expect(card.locator(".status-badge")).toHaveCSS("font-size","11px");
      await expect(card.locator(".learner-choice-actions button")).toBeDisabled();
      await card.locator(".learner-choice-actions button").hover();
      await expect(card.locator(".learner-choice-actions button")).toHaveCSS("cursor","not-allowed");
      await expect(card.locator(".learner-choice-actions a")).toHaveAttribute("href","/teachers");
      await card.locator(".learner-choice-actions a").hover();
      await expect(card.locator(".learner-choice-actions a")).toHaveCSS("cursor","pointer");
      await expect(card.locator(".learner-choice-actions a")).toHaveCSS("background-color","rgb(240, 215, 255)");
      const [first,second]=await card.locator(".learner-choice-actions > *").evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
      expect(second.y>first.y+1?second.y-first.y-first.height:second.x-first.x-first.width).toBeGreaterThanOrEqual(15.5);
      await card.locator(".info-tooltip-trigger").focus();await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveCount(1);
      await page.keyboard.press("Escape");await expect(page.getByRole("tooltip")).toHaveCount(0);
      if(hindi) await checkHindi(page);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const accessibility=await new AxeBuilder({page}).include(".learner-choice-card").analyze();expect(accessibility.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
      await card.screenshot({path:`test-results/learner-choice-${width}.png`,style:"nextjs-portal{display:none!important}"});
      expect(f.writes).toHaveLength(0);
    });
  }
  test("enabled teacher-choice actions have distinct hover feedback",async({page})=>{
    await fixture(page,{role:"STUDENT",mode:"SHARED"});await page.goto("/dashboard/learning-choices");
    const action=page.locator(".learner-choice-actions button");await expect(action).toBeEnabled();await action.hover();
    await expect(action).toHaveCSS("cursor","pointer");await expect(action).toHaveCSS("background-color","rgb(2, 62, 55)");
  });
  test("a permitted student can ask a guardian to decide for one enquiry and resume without changing standing permissions", async ({
    page,
  }) => {
    const f = await fixture(page, {
      role: "STUDENT",
      mode: "SHARED",
      history: true,
    });
    await page.goto("/dashboard/learning-choices?request="+enquiryId);
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
      const summary=page.getByRole("region",{name:"Enquiry summary",exact:true});
      await expect(summary).toContainText("Maths");await expect(summary).toContainText("1,500");await expect(summary).toContainText("Monday");
      await expect(page.getByRole("spinbutton",{name:"Monthly budget (INR)",exact:true})).toHaveCount(0);
      if(failure === "none") {
        const actions=page.locator(".managed-enquiry-actions");await expect(actions.locator(".filter-button")).toHaveCount(3);await expect(actions.getByRole("button",{name:"Confirm teacher enquiry",exact:true})).toHaveAttribute("type","submit");await expect(actions.getByRole("button",{name:"Confirm teacher enquiry",exact:true})).toBeDisabled();await page.locator(".managed-enquiry-confirmation").screenshot({path:"test-results/managed-enquiry-confirmation.png"});
        await page.getByRole("button",{name:"Back to editing",exact:true}).click();
        await expect(page.getByRole("spinbutton",{name:"Monthly budget (INR)",exact:true})).toHaveValue("1500");
        await page.getByRole("button",{name:"Review teacher enquiry",exact:true}).click();
        await page.setViewportSize({width:390,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const accessibility=await new AxeBuilder({page}).include(".enquiry-summary").analyze();expect(accessibility.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
        await summary.screenshot({path:"test-results/enquiry-summary-phone.png"});
      }
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
      await expect(page.locator(".direct-inbox").getByRole("group",{name:"Filter enquiries",exact:true})).toBeVisible();
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
        page.getByRole("dialog", { name: "View saved enquiry", exact: true }),
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
    await page.goto("/teachers/synthetic-teacher?subject=Maths&learner="+learner);
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
