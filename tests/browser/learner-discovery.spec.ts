import { test, expect } from "@playwright/test";
import { chooseHindi } from "../helpers/hindi";
import AxeBuilder from "@axe-core/playwright";
import { translateText } from "../../apps/web/app/locale";

const account = "10000000-0000-4000-8000-000000000291";
const kishan = "20000000-0000-4000-8000-000000000291", vivek = "20000000-0000-4000-8000-000000000292";
const teacher = (subject: string, grade: number, suffix: string) => ({ id: `30000000-0000-4000-8000-00000000029${suffix}`, slug: `${subject.toLowerCase()}-${grade}`, name: `${subject} Class ${grade}`, headline: "Synthetic teacher", bio: "Synthetic coverage", subjects: [subject], grades: [grade], boards: ["CBSE"], teachingCoverage: [{ stage: "SCHOOL", subject, grade, board: "CBSE" }], modes: ["ONLINE"], languages: ["English"], localities: [], monthlyPaise: 300000, experience: 5, avatarColor: "#E5E9DC", demoAvailable: false, lockInDays: 0, capabilityLabel: "Reviewed subject coverage" });
const teachers = [teacher("Maths", 7, "1"), teacher("Science", 7, "2"), teacher("Maths", 10, "3")];
async function mock(page: import("@playwright/test").Page, role: string) {
  const reads: URL[] = [];
  const writes: string[] = [];
  let denied = false;
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (route.request().method() !== "GET") writes.push(path);
    if (path.endsWith("/auth/session")) return route.fulfill({ json: { account: { id: account, name: "Synthetic guardian", role, verified: true }, csrfToken: "synthetic-csrf" } });
    const profiles = [{ id: kishan, alias: "Kishan", education: { stage: "SCHOOL", grade: 12, board: "CBSE", institutionName: "DPS", subjects: ["Maths", "Science"] }, version: 1, enquiryEligible: true }, { id: vivek, alias: "Vivek", education: { stage: "SCHOOL", grade: 7, board: "CBSE", institutionName: "Synthetic school", subjects: ["Maths", "Science"] }, version: 1, enquiryEligible: true }];
    if(path.endsWith("/learning-spaces")){const learner=profiles.find(row=>path.includes(row.id));return route.fulfill({json:{learner,spaces:[{subject:"Maths"},{subject:"Science"}],version:1}});}
    if (path.endsWith("/children")) return route.fulfill({ json: { items: profiles.map(row => ({ id: row.id, alias: row.alias, educationStage: "SCHOOL", grade: row.education.grade, board: "CBSE", schoolName: row.education.institutionName, schoolSubjects: row.education.subjects })) } });
    if (path.endsWith("/onboarding/parent") || path.endsWith("/onboarding/enquiry") || path.endsWith("/onboarding/parent/drafts")) return route.fulfill({ status: route.request().method() === "POST" ? 201 : 200, json: { kind: path.includes("/enquiry") ? "ENQUIRY" : "PARENT", state: "READY", draft: route.request().method() === "POST" ? route.request().postDataJSON().draft : {}, version: route.request().method() === "POST" ? 1 : 0, completedResourceId: null } });
    if (path.endsWith("/consents")) return route.fulfill({ status: 201, json: {} });
    if (path.endsWith("/learner-profiles") || path.endsWith("/independent-student/profile")) {
      if (denied) return route.fulfill({ status: 403, json: { code: "CONSENT_REQUIRED", message: "Learning access unavailable." } });
      if (path.endsWith("/independent-student/profile")) return route.fulfill({ json: { accountId: account, education: profiles[0].education, version: 1, editStatus: "EDITABLE" } });
      return route.fulfill({ json: { items: role === "STUDENT" ? [profiles[0]] : profiles, creationStatus: "READY", nextCursor: null } });
    }
    if (path === "/api/v1/teachers" || path.startsWith("/api/v1/teachers/")) {
      reads.push(url);
      const learner = url.searchParams.get("learnerId"), subject = url.searchParams.get("subject");
      const matches = teachers.filter(row => !learner || learner === vivek && (!subject || row.subjects.includes(subject)) && row.grades.includes(7));
      if (path !== "/api/v1/teachers") {
        const item = matches.find(row => path.endsWith("/" + row.slug));
        return item ? route.fulfill({ json: item }) : route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "Teacher profile is unavailable." } });
      }
      return route.fulfill({ json: { items: matches, nextCursor: null } });
    }
    return route.fulfill({ json: { items: [], nextCursor: null } });
  });
  return { reads, writes, deny: () => { denied = true; } };
}

for(const [role,count,hindi] of [['GUARDIAN',1,false],['STUDENT',2,true]] as const)test(`search shows started subject tuition for the exact learner (${role})`,async({page})=>{
 const state=await mock(page,role);if(hindi)await chooseHindi(page);const child=role==='STUDENT'?kishan:vivek;
 const placements=[...Array.from({length:count},(_,i)=>({id:'started-'+i,childId:child,requestId:'maths-'+i,status:'ACTIVE',guardianStarted:true,teacherReceiptConfirmed:true})),{id:'closed',childId:child,requestId:'closed',status:'CLOSED',guardianStarted:true,teacherReceiptConfirmed:true},{id:'other',childId:'other-child',requestId:'other',status:'ACTIVE',guardianStarted:true,teacherReceiptConfirmed:true},{id:'not-started',childId:child,requestId:'not-started',status:'ACTIVE',guardianStarted:false,teacherReceiptConfirmed:false}];
 await page.route('**/api/v1/dashboard',route=>route.fulfill({json:{placements}}));await page.route('**/api/v1/requests/*',route=>route.fulfill({json:{childId:child,subject:'Maths'}}));await page.route('**/api/v1/tuition-bookings/**',route=>route.fulfill({json:{completions:[]}}));
 await page.goto(`/teachers?learner=${child}&subject=Maths`);const card=page.locator('.ongoing-subject-tuition'),t=(s:string)=>translateText(hindi,s),message=t(count===1?'1 class is ongoing for {0}':'{1} classes are ongoing for {0}').replace('{0}',t('Maths')).replace('{1}',String(count));await expect(card).toContainText(message);await expect(card.getByRole('link')).toHaveAttribute('href','/dashboard/arrangements');
 const filter=await page.locator('.teacher-filters').count()?page.locator('.teacher-filters'):page.locator('fieldset').first();const filterBox=await filter.boundingBox(),cardBox=await card.boundingBox();expect(cardBox!.y).toBeGreaterThanOrEqual(filterBox!.y+filterBox!.height);
 await page.setViewportSize({width:hindi?320:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.ongoing-subject-tuition').analyze()).violations).toEqual([]);await card.screenshot({path:`test-results/ongoing-subject-${role}.png`,style:'nextjs-portal{display:none!important}'});
 await page.locator('#search-learning-space').selectOption('Science');await expect(card).toHaveCount(0);await page.locator('#search-learning-space').selectOption('Maths');await expect(card).toContainText(message);await page.goto('/teachers?explore=all');await expect(card).toHaveCount(0);expect(state.writes).toEqual([]);
});

test("ongoing tuition checks fail without showing a stale count and can retry",async({page})=>{
 await mock(page,'GUARDIAN');let failed=true;await page.route('**/api/v1/dashboard',route=>failed?route.fulfill({status:403,json:{code:'FORBIDDEN',message:'Unavailable'}}):route.fulfill({json:{placements:[]}}));await page.goto(`/teachers?learner=${vivek}&subject=Maths`);await expect(page.locator('.ongoing-subject-error')).toContainText('Ongoing tuition could not be checked.');await expect(page.locator('.ongoing-subject-tuition')).toHaveCount(0);failed=false;await page.getByRole('button',{name:'Retry ongoing tuition check',exact:true}).click();await expect(page.locator('.ongoing-subject-error')).toHaveCount(0);
});

for(const [role,monthly,hindi] of [['GUARDIAN',true,false],['STUDENT',false,true]] as const)test(`confirmed subject tuition stays visible without start or Pro attendance records (${role})`,async({page})=>{
 const state=await mock(page,role);if(hindi)await chooseHindi(page);const child=role==='STUDENT'?kishan:vivek;
 await page.route('**/api/v1/dashboard',route=>route.fulfill({json:{placements:[{id:'confirmed',childId:child,requestId:'confirmed-request',status:'TERMS_PENDING',guardianAccepted:!monthly,teacherAccepted:!monthly,guardianStarted:false,teacherReceiptConfirmed:false},{id:'awaiting-teacher',childId:child,requestId:'pending-request',status:'TERMS_PENDING',guardianAccepted:true,teacherAccepted:false,guardianStarted:false,teacherReceiptConfirmed:false}]}}));
 await page.route('**/api/v1/requests/*',route=>route.fulfill({json:{childId:child,subject:'Maths'}}));await page.route('**/api/v1/tuition-bookings/**',route=>route.fulfill({json:{confirmed:monthly&&route.request().url().endsWith('/confirmed'),proActive:false,completions:[]}}));await page.goto(`/teachers?learner=${child}&subject=Maths`);
 const card=page.locator('.ongoing-subject-tuition'),message=translateText(hindi,'1 tuition is already arranged for {0}').replace('{0}',translateText(hindi,'Maths'));await expect(card).toContainText(message);await expect(card).not.toContainText('class is ongoing');await expect(card.getByRole('link')).toHaveAttribute('href','/dashboard/arrangements');expect(state.writes).toEqual([]);
});

test("independent student ongoing subject counts follow all arrangement pages and recorded completions",async({page})=>{
 await mock(page,'INDEPENDENT_STUDENT');await page.route('**/api/v1/independent-student/profile',route=>route.fulfill({json:{accountId:account,version:1,education:{stage:'SCHOOL',grade:7,board:'CBSE',institutionName:'DPS',subjects:['Maths','Science']}}}));
 const pages:string[]=[];await page.route('**/api/v1/student-arrangements?*',route=>{const cursor=new URL(route.request().url()).searchParams.get('cursor')||'';if(new URL(route.request().url()).searchParams.get('limit')==='50')pages.push(cursor);return route.fulfill({json:{items:cursor?[{id:'second',status:'CONFIRMED',terms:{subject:'Maths'}},{id:'closed',status:'CLOSED',terms:{subject:'Maths'}}]:[{id:'first',status:'CONFIRMED',terms:{subject:'Maths'}},{id:'unstarted',status:'CONFIRMED',terms:{subject:'Maths'}},{id:'science',status:'CONFIRMED',terms:{subject:'Science'}}],nextCursor:cursor?null:'next'}});});
 await page.route('**/api/v1/tuition-bookings/**',route=>route.fulfill({json:{completions:route.request().url().endsWith('/unstarted')?[]:[{completed:true}]}}));await page.goto('/teachers?subject=Maths');const card=page.locator('.ongoing-subject-tuition');await expect(card).toContainText('2 classes are ongoing for Maths');await expect(card.getByRole('link')).toHaveAttribute('href','/dashboard/student-arrangements');expect(pages).toContain('next');
});

test("guardian chooses the learner before discovery and Class 12 cannot fall back to Class 7 or 10", async ({ page }) => {
  const state = await mock(page, "GUARDIAN");
  await page.goto("/teachers");
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(0);
  await page.getByLabel("Choose learner", { exact: true }).selectOption(kishan);
  await page.locator("#search-learning-space").selectOption("Maths");
  await expect(page.getByRole("heading", { name: "No teachers match these filters right now." })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(0);
  await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
  await page.getByLabel("Choose learner", { exact: true }).selectOption(vivek);
  await page.locator("#search-learning-space").selectOption("Maths");
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(1);
  const accessibility = await new AxeBuilder({ page }).include(".teacher-discovery-page").analyze();
  expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  await expect(page.getByRole("link", { name: "Maths Class 10", exact: true })).toHaveCount(0);
  await page.locator("#search-learning-space").selectOption("Science");
  await expect(page.getByRole("link", { name: "Science Class 7", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Maths Class 7", exact: true })).toHaveCount(0);
  await page.locator("#search-learning-space").selectOption("Maths");
  await page.getByRole("link", { name: "Maths Class 7", exact: true }).click();
  await expect(page.getByRole("link", { name: "Enquire about this teacher", exact: true })).toHaveAttribute("href", new RegExp(`learner=${vivek}.*subject=Maths`));
  await page.goto(`/teachers/maths-7?learner=${kishan}&subject=Maths`);
  await expect(page.getByRole("link", { name: "Enquire about this teacher", exact: true })).toHaveCount(0);
  expect(state.reads.some(url => url.searchParams.get("learnerId") === kishan)).toBe(true);
});

for (const role of ["STUDENT", "INDEPENDENT_STUDENT"]) test(`${role} discovery is bound to own Class 12 profile`, async ({ page }) => {
  const state = await mock(page, role);
  await page.goto("/teachers");
  if(role === "STUDENT") await page.locator("#search-learning-space").selectOption("Maths");
  await expect(page.getByRole("heading", { name: "No teachers match these filters right now." })).toBeVisible();
  await expect(page.locator(".teacher-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.locator(".teacher-card")).toHaveCount(0);
  state.deny(); await page.reload();
  await expect(page.locator(".learner-search-context [role=alert]")).toBeVisible();
  await expect(page.locator(".teacher-card")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open education profiles", exact: true })).toHaveAttribute("href", role === "INDEPENDENT_STUDENT" ? "/onboarding/independent-student" : "/dashboard/learners");
});

test("Hindi phone learner discovery hides results on denied profile refresh", async ({ page }) => {
  await chooseHindi(page); await page.setViewportSize({ width: 390, height: 900 });
  const state = await mock(page, "GUARDIAN");
  await page.goto(`/teachers?learner=${vivek}&subject=Maths`);
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).include(".teacher-discovery-page").analyze();
  expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  await page.locator(".learner-search-context").screenshot({ path: "test-results/learner-discovery-hi.png" });
  state.deny(); await page.reload();
  await expect(page.locator(".learner-search-context [role=alert]")).toBeVisible();
  await expect(page.locator(".teacher-card")).toHaveCount(0);
});

test("guardian enquiry handoff preselects the searched learner instead of another child", async ({ page }) => {
  const state = await mock(page, "GUARDIAN");
  await page.goto(`/onboarding/parent?teacher=${teachers[0].id}&profile=${teachers[0].slug}&learner=${vivek}&subject=Maths`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Agree and continue", exact: true }).click();
  await expect(page.getByLabel("Link an existing learner", { exact: true })).toHaveValue(vivek);
  await expect(page.getByLabel("Learner alias", { exact: true })).toHaveValue("Vivek");
  expect(state.writes.some(path => path === "/api/v1/requests" || path.endsWith("/completions"))).toBe(false);
});

test("a guardian's public profile link requires a learner before any enquiry action", async ({ page }) => {
  await mock(page, "GUARDIAN");
  await page.goto("/teachers/maths-10");
  await expect(page.getByRole("heading", { name: "Maths Class 10", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enquire about this teacher", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Choose learner", exact: true }).click();
  await expect(page.getByLabel("Choose learner", { exact: true })).toBeVisible();
  await expect(page.locator(".teacher-card")).toHaveCount(0);
});
