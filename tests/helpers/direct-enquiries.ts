import { test, expect, type Page } from "@playwright/test";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi, checkHindi } from "./hindi";
const id = "10000000-0000-4000-8000-000000000661";
async function inbox(page: Page, role = "TEACHER") {
  await dashboard(page, role);
  await page.route("**/api/v1/student-opportunities**",route=>route.fulfill({json:{items:[],nextCursor:null}}));
  const writes: any[] = [];
  const items = [0, 1, 2].map((n) => ({
    id: `20000000-0000-4000-8000-00000000066${n}`,
    kind: "GUARDIAN",
    sourceId: id,
    ownerId: id,
    childId: id,
    teacherId: id,
    region: "Raipur",
    status: "PENDING",
    proposal: null as any,
    arrangementId: null,
    version: 1,
    createdAt: new Date(Date.UTC(2026, 9, 24, 12 - n)).toISOString(),
    updatedAt: new Date().toISOString(),
    subject: "Maths",
    mode: "ONLINE",
    language: "English",
    parentName: "Parent " + n,
    teacherName: "Rohan Verma",
    learner: {
      name: "Learner " + n,
      grade: 8,
      board: "CBSE",
      institution: "Test School",
      subjects: ["Maths", "Science"],
    },
    preferredTime: "Monday 5pm IST",
    sourceVersion: 1,
    canReply: role === "TEACHER",
    canDecide: role === "GUARDIAN",
    sourceOpen: true,
  }));
  await page.route("**/api/v1/direct-enquiries**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(),
        item = items.find((i) => route.request().url().includes(i.id))!;
      writes.push(body);
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      Object.assign(item, {
        version: item.version + 1,
        status:
          body.action === "PROPOSE"
            ? "PROPOSED"
            : body.action === "DECLINE"
              ? "DECLINED"
              : "ACCEPTED",
        proposal:
          body.action === "PROPOSE"
            ? {
                format: body.format,
                timing: body.timing,
                message: body.message,
                timezone: "Asia/Kolkata",
              }
            : item.proposal,
      });
      return route.fulfill({ status: 201, json: item });
    }
    return route.fulfill({
      json: {
        items,
        counts: items.reduce(
          (m: any, i) => ((m[i.status] = (m[i.status] ?? 0) + 1), m),
          {},
        ),
        nextCursor: null,
      },
    });
  });
  return { writes, items };
}
test("teacher compact inbox, keyboard expansion, proposal and accepted arrangement", async ({
  page,
}) => {
  const { writes } = await inbox(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  const panel = page.locator(".direct-inbox"),
    cards = panel.locator("details");
  await expect(cards).toHaveCount(3);
  await expect(panel.locator(".direct-inbox-count strong")).toHaveText("3");
  expect(
    await panel
      .locator("header")
      .evaluate((n) => getComputedStyle(n).backgroundColor),
  ).toBe("rgb(228, 228, 208)");
  for (const card of await cards.all())
    await expect(card).not.toHaveAttribute("open");
  await cards.first().locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(cards.first()).toHaveAttribute("open", "");
  await expect(cards.first()).toContainText("Monday 5pm IST");
  await cards
    .first()
    .getByRole("button", { name: "Propose another time or group", exact: true })
    .click();
  const form = panel.locator("form");
  await form.getByLabel("Teaching format").selectOption("GROUP");
  await form
    .getByLabel("Suggested time (IST)", { exact: true })
    .fill("Tuesday 6pm IST");
  await form
    .getByLabel("Message to the family")
    .fill("Group tuition is available at this time.");
  await expect(
    form.getByRole("button", { name: "Confirm reply", exact: true }),
  ).toBeDisabled();
  await form.getByRole("checkbox").check();
  await form
    .getByRole("button", { name: "Confirm reply", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(writes[0]).toMatchObject({
    action: "PROPOSE",
    expectedVersion: 1,
    format: "GROUP",
    timing: "Tuesday 6pm IST",
    confirmed: true,
  });
  await expect(cards.first()).toContainText("Alternative proposed");
  await page.screenshot({
    path: "test-results/direct-enquiries-desktop.png",
    fullPage: true,
  });
});
test("guardian accepts an alternative directly while staff is read only", async ({
  page,
}) => {
  const { writes, items } = await inbox(page, "GUARDIAN");
  Object.assign(items[0], {
    status: "PROPOSED",
    proposal: {
      format: "GROUP",
      timing: "Tuesday 6pm IST",
      message: "A group place is available.",
      timezone: "Asia/Kolkata",
    },
  });
  await page.goto("/dashboard");
  const panel = page.locator(".direct-inbox");
  await panel.locator("summary").first().click();
  await panel
    .getByRole("button", { name: "Accept proposal", exact: true })
    .click();
  await panel.locator("form").getByRole("checkbox").check();
  await panel
    .getByRole("button", { name: "Confirm reply", exact: true })
    .click();
  await expect(panel.locator("form")).toHaveCount(0);
  expect(writes[0].action).toBe("ACCEPT_PROPOSAL");
});
test("Hindi mobile inbox keeps details collapsed and fits the viewport", async ({
  page,
}) => {
  await chooseHindi(page);
  await inbox(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await checkHindi(page);
  const panel = page.locator(".direct-inbox");
  await expect(panel).toContainText("प्राप्त अनुरोध");
  await panel.locator("summary").first().click();
  await expect(
    panel.getByRole("button", { name: "अनुरोध स्वीकारें", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/direct-enquiries-hindi-mobile.png",
    fullPage: true,
  });
});
test("staff can inspect direct enquiries without reply controls; failed reads never show zero", async ({
  page,
}) => {
  await inbox(page, "ADMIN");
  await page.goto("/dashboard");
  const panel = page.locator(".direct-inbox");
  await panel.locator("summary").first().click();
  await expect(panel).toContainText("Direct enquiry oversight");
  await expect(panel.locator(".direct-enquiry-body button")).toHaveCount(0);
  await page.route("**/api/v1/direct-enquiries**", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "UNAVAILABLE", message: "Unavailable" },
    }),
  );
  await panel
    .getByRole("button", { name: "Refresh enquiries", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.locator(".direct-inbox-count strong")).toHaveText("—");
});

test('notification deep link opens the selected enquiry and retains access to the full inbox',async({page})=>{
 const {items}=await inbox(page);await page.goto('/dashboard/enquiries?conversation='+items[1].id);const cards=page.locator('.direct-inbox details');await expect(cards).toHaveCount(3);await expect(cards.nth(1)).toHaveAttribute('open','');await expect(cards.first()).not.toHaveAttribute('open');await page.locator('.direct-inbox').getByRole('link',{name:'All enquiries',exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/enquiries$/);
});
