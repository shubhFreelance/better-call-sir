import { test, expect, type Page } from "@playwright/test";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi, checkHindi } from "./hindi";
import AxeBuilder from "@axe-core/playwright";
const id = "10000000-0000-4000-8000-000000000661";
async function inbox(page: Page, role = "TEACHER", pageSize = 10) {
  await dashboard(page, role);
  await page.route("**/api/v1/student-opportunities**",route=>route.fulfill({json:{items:[],nextCursor:null}}));
  const writes: any[] = [];
  const reads: string[] = [];
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
      if(body.expectedVersion !== item.version) return route.fulfill({status:409,json:{code:"CONFLICT",message:"Enquiry changed or is already answered. Refresh before continuing."}});
      Object.assign(item, {
        version: item.version + 1,
        status:
          body.action === "PROPOSE"
            ? "PROPOSED"
            : body.action === "ACCEPT_PROPOSAL"
              ? "PENDING"
              : body.action === "DECLINE" || body.action === "DECLINE_PROPOSAL"
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
    const url = new URL(route.request().url());
    reads.push(url.search);
    const filtered = items.filter(item => !url.searchParams.has("status") || item.status === url.searchParams.get("status") && (item.status !== "PENDING" || item.sourceOpen));
    const offset = url.searchParams.has("cursor") ? filtered.findIndex(item => item.id === url.searchParams.get("cursor")) + 1 : 0;
    const pageItems = filtered.slice(offset, offset + pageSize);
    return route.fulfill({
      json: {
        items: pageItems,
        counts: items.reduce(
          (m: any, i) => ((m[i.status] = (m[i.status] ?? 0) + 1), m),
          {},
        ),
        nextCursor: offset + pageSize < filtered.length ? pageItems.at(-1)!.id : null,
      },
    });
  });
  return { writes, items, reads };
}
for (const role of ["GUARDIAN", "TEACHER", "STUDENT", "INDEPENDENT_STUDENT", "ADMIN", "OPERATOR"]) {
  test(`shared enquiry filters and status badges work for ${role}`, async ({ page }) => {
    const { items } = await inbox(page, role);
    const hindi = role === "GUARDIAN";
    if (hindi) { await chooseHindi(page); await page.setViewportSize({ width: 320, height: 1000 }); }
    items[1].status = "ACCEPTED";
    items[2].status = "DECLINED";
    items.push({ ...items[0], id: "20000000-0000-4000-8000-000000000669", status: "PROPOSED" });
    items.push({ ...items[0], id: "20000000-0000-4000-8000-000000000668", sourceOpen: false });
    await page.goto(role === "OPERATOR" ? "/dashboard" : "/dashboard/enquiries");
    const panel = page.locator(".direct-inbox"), filters = panel.getByRole("group", { name: hindi ? "अनुरोध छाँटें" : "Filter enquiries" });
    await expect(filters).toHaveCSS("background-color","rgb(238, 245, 243)");
    await expect(filters.locator("button")).toHaveText(hindi ? ["सभी","शिक्षक के जवाब की प्रतीक्षा","मना किया","स्वीकार किया"] : ["All","Awaiting teacher reply","Declined","Accepted"]);
    await expect(filters.locator("svg")).toHaveCount(0);
    await expect(panel.locator("details")).toHaveCount(5);
    const labels = hindi ? ["सभी", "शिक्षक के जवाब की प्रतीक्षा", "स्वीकार किया", "मना किया"] : ["All", "Awaiting teacher reply", "Accepted", "Declined"];
    for (const [index, tone] of [[1, "warning"], [2, "success"], [3, "danger"]] as const) {
      const button = filters.getByRole("button", { name: labels[index], exact: true });
      await button.focus(); await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await button.hover();await expect(button).toHaveCSS("background-color","rgb(240, 215, 255)");
      await expect(filters.locator('[aria-pressed="true"]')).toHaveCount(1);
      await expect(panel.locator("details")).toHaveCount(1);
      await expect(panel.locator(`summary .status-badge.status-tone-${tone}`)).toHaveCount(1);
      await expect(panel.locator("summary .status-badge svg")).toHaveCount(1);
      await expect(panel.locator("summary .status-badge")).toHaveCSS("font-size", "11px");
    }
    await filters.getByRole("button", { name: labels[0], exact: true }).click();
    await expect(panel.locator("details")).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (hindi) await checkHindi(page);
    const accessibility = await new AxeBuilder({ page }).include(".direct-inbox").analyze();
    expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
    await panel.screenshot({ path: `test-results/enquiry-filters-${role}.png` });
  });
}

test("changing enquiry filters resets pagination and empty filters are explicit", async ({ page }) => {
  const { items, reads } = await inbox(page, "TEACHER", 1);
  items[1].status = "ACCEPTED"; items[2].status = "ACCEPTED";
  await page.goto("/dashboard/enquiries");
  const panel = page.locator(".direct-inbox"), filters = panel.getByRole("group", { name: "Filter enquiries" });
  await filters.getByRole("button", { name: "Accepted", exact: true }).click();
  await expect(panel.locator("details").first()).toContainText("Learner 1");
  await panel.getByRole("button", { name: "Older enquiries", exact: true }).click();
  await expect(panel.locator("details").first()).toContainText("Learner 2");
  await filters.getByRole("button", { name: "Declined", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("No enquiries match this filter.");
  expect(reads.at(-1)).toContain("status=DECLINED"); expect(reads.at(-1)).not.toContain("cursor=");
  await filters.getByRole("button", { name: "Accepted", exact: true }).click();
  await expect(panel.locator("details").first()).toContainText("Learner 1");
});

test("teacher compact inbox, keyboard expansion, proposal and accepted arrangement", async ({
  page,
}) => {
  const { writes, items } = await inbox(page);
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
  await expect(cards.first()).toHaveClass(/layered-summary-card/);await expect(cards.first().locator(".layered-summary-card-header")).toHaveCSS("background-color","rgb(255, 255, 235)");await expect(cards.first().locator(".layered-summary-card-footer")).toHaveCSS("background-color","rgb(248, 237, 255)");await expect(cards.first().locator(".layered-summary-card-footer .filter-button")).toHaveCount(0);await expect(cards.first().locator(".layered-summary-card-actions")).toHaveCSS("background-color","rgb(255, 255, 255)");await expect(cards.first().locator(".direct-enquiry-actions .filter-button")).toHaveCount(3);await expect(cards.first().getByRole("button",{name:"Accept enquiry",exact:true})).toHaveAttribute("data-accent","true");await cards.first().screenshot({path:"test-results/layered-enquiry-teacher.png",style:"nextjs-portal{display:none!important}"});
  await cards
    .first()
    .getByRole("button", { name: "Propose another time or group", exact: true })
    .click();
  const form = page.locator(".direct-reply-form");
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
  await expect(cards.first().getByRole("button", { name:"Accept enquiry", exact:true })).toBeDisabled();
  await expect(cards.first()).toContainText("Waiting for the family to confirm this proposal.");
  await cards.first().getByRole("button",{name:"Edit proposal",exact:true}).click();
  await expect(form.getByLabel("Suggested time (IST)",{exact:true})).toHaveValue("Tuesday 6pm IST");
  await form.getByLabel("Suggested time (IST)",{exact:true}).fill("Original Monday 5pm IST");
  await form.getByRole("checkbox").check();
  await form.getByRole("button",{name:"Confirm reply",exact:true}).click();
  expect(writes[1]).toMatchObject({action:"PROPOSE",expectedVersion:2,timing:"Original Monday 5pm IST"});
  await expect(cards.first().getByRole("button",{name:"Accept enquiry",exact:true})).toBeDisabled();
  items[0].status="PENDING";items[0].version=4;items[0].proposal.familyConfirmed=true;
  await panel.getByRole("button",{name:"Refresh enquiries",exact:true}).click();
  await expect(cards.first()).toContainText("The family confirmed this proposal.");
  await cards.first().getByRole("button",{name:"Accept enquiry",exact:true}).click();
  await expect(form).toContainText("Original Monday 5pm IST");await form.getByRole("checkbox").check();
  await form.getByRole("button",{name:"Confirm reply",exact:true}).click();
  expect(writes[2]).toMatchObject({action:"ACCEPT",expectedVersion:4});
  await expect(cards.first()).toContainText("The teacher has accepted this enquiry.");
  await page.screenshot({
    path: "test-results/direct-enquiries-desktop.png",
    fullPage: true,
  });
});
test("guardian confirms an alternative and waits for teacher acceptance", async ({
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
  await page.locator(".direct-reply-form").getByRole("checkbox").check();
  await page.getByRole("dialog")
    .getByRole("button", { name: "Confirm reply", exact: true })
    .click();
  await expect(page.locator(".direct-reply-form")).toHaveCount(0);
  expect(writes[0].action).toBe("ACCEPT_PROPOSAL");
  await expect(panel).toContainText("The family confirmed this proposal. The teacher can now accept the enquiry.");
  await expect(panel.getByRole("link",{name:"View tuition arrangement"})).toHaveCount(0);
});
test("a changed proposal requires refresh and fresh family confirmation",async({page})=>{
 const {items,writes}=await inbox(page,"GUARDIAN");Object.assign(items[0],{status:"PROPOSED",proposal:{format:"GROUP",timing:"Monday 5pm IST",message:"Original proposal",timezone:"Asia/Kolkata"}});
 await page.goto("/dashboard/enquiries");const panel=page.locator(".direct-inbox");await panel.locator("summary").first().click();
 await panel.getByRole("button",{name:"Accept proposal",exact:true}).click();await page.locator(".direct-reply-form").getByRole("checkbox").check();
 items[0].version=2;items[0].proposal.timing="Tuesday 6pm IST";
 await page.getByRole("dialog").getByRole("button",{name:"Confirm reply",exact:true}).click();await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Enquiry changed");
 await page.getByRole("dialog").getByRole("button",{name:"Refresh enquiries",exact:true}).click();await expect(page.locator(".direct-reply-form")).toHaveCount(0);
 await expect(panel.locator("details").first()).toContainText("Tuesday 6pm IST");
 await panel.getByRole("button",{name:"Accept proposal",exact:true}).click();await expect(page.locator(".direct-reply-form")).toContainText("Tuesday 6pm IST");
 await expect(page.getByRole("dialog").getByRole("button",{name:"Confirm reply",exact:true})).toBeDisabled();
 await page.locator(".direct-reply-form").getByRole("checkbox").check();await page.getByRole("dialog").getByRole("button",{name:"Confirm reply",exact:true}).click();expect(writes.map(w=>w.expectedVersion)).toEqual([1,2]);
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


test("accept enquiry uses a compact modal with acknowledgement, cancellation and exact retry recovery",async({page})=>{
  const {writes}=await inbox(page);const attempts:any[]=[];
  await page.route("**/api/v1/direct-enquiries/*/responses",route=>{attempts.push({body:route.request().postDataJSON(),key:route.request().headers()["idempotency-key"]});return attempts.length===1?route.abort("failed"):route.fallback();});
  await page.goto("/dashboard");const card=page.locator(".direct-inbox details").first();await card.locator("summary").click();const accept=card.getByRole("button",{name:"Accept enquiry",exact:true});await accept.click();
  const dialog=page.getByRole("dialog",{name:"Review your reply",exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText("Learner 0");await expect(dialog).toContainText("Maths");await expect(dialog).toContainText("Monday 5pm IST");
  await expect(dialog.locator("input:not([type=checkbox]),select,textarea")).toHaveCount(0);await expect(dialog.locator(".filter-button-group button")).toHaveText(["Confirm reply","Cancel"]);await expect(dialog.getByRole("button",{name:"Confirm reply",exact:true})).toBeDisabled();
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(dialog).not.toBeVisible();await expect(accept).toBeFocused();expect(writes).toHaveLength(0);
  await accept.click();await page.setViewportSize({width:360,height:850});expect((await new AxeBuilder({page}).include(".app-modal").analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await dialog.screenshot({path:"test-results/reply-confirmation-modal.png",style:"nextjs-portal{display:none!important}"});
  await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"Confirm reply",exact:true}).click();await expect(dialog.getByRole("button",{name:"Cancel",exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:"Retry same decision",exact:true}).click();await expect(dialog).not.toBeVisible();
  expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);expect(attempts[0].body).toMatchObject({action:"ACCEPT",expectedVersion:1,expectedSourceVersion:1,confirmed:true});expect(writes).toHaveLength(1);
});
