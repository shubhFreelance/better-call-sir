import { test, expect } from "@playwright/test";
import { chooseHindi } from "../helpers/hindi";
import AxeBuilder from "@axe-core/playwright";

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

test("guardian chooses the learner before discovery and Class 12 cannot fall back to Class 7 or 10", async ({ page }) => {
  const state = await mock(page, "GUARDIAN");
  await page.goto("/teachers");
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(0);
  await page.getByLabel("Choose learner", { exact: true }).selectOption(kishan);
  await expect(page.getByRole("heading", { name: "No teachers match these filters right now." })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(0);
  await expect(page.getByLabel("Class", { exact: true })).toHaveCount(0);
  await page.getByLabel("Choose learner", { exact: true }).selectOption(vivek);
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(2);
  await page.getByRole("link", { name: "Maths Class 7", exact: true }).click();
  await expect(page.getByRole("link", { name: "Enquire about this teacher", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Choose a subject before enquiring", exact: true }).click();
  await page.getByLabel("Subject", { exact: true }).selectOption("Maths");
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(1);
  const accessibility = await new AxeBuilder({ page }).include(".teacher-discovery-page").analyze();
  expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
  await expect(page.getByRole("link", { name: "Maths Class 10", exact: true })).toHaveCount(0);
  await page.getByLabel("Subject", { exact: true }).selectOption("Science");
  await expect(page.getByRole("link", { name: "Science Class 7", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Maths Class 7", exact: true })).toHaveCount(0);
  await page.getByLabel("Subject", { exact: true }).selectOption("Maths");
  await page.getByRole("link", { name: "Maths Class 7", exact: true }).click();
  await expect(page.getByRole("link", { name: "Enquire about this teacher", exact: true })).toHaveAttribute("href", new RegExp(`learner=${vivek}.*subject=Maths`));
  await page.goto(`/teachers/maths-7?learner=${kishan}&subject=Maths`);
  await expect(page.getByRole("link", { name: "Enquire about this teacher", exact: true })).toHaveCount(0);
  expect(state.reads.some(url => url.searchParams.get("learnerId") === kishan)).toBe(true);
});

for (const role of ["STUDENT", "INDEPENDENT_STUDENT"]) test(`${role} discovery is bound to own Class 12 profile`, async ({ page }) => {
  const state = await mock(page, role);
  await page.goto("/teachers");
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
  await page.goto(`/teachers?learner=${vivek}`);
  await expect(page.locator(".teacher-grid .teacher-card")).toHaveCount(2);
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
