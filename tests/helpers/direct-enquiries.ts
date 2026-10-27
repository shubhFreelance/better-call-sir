import { test, expect, type Page } from "@playwright/test";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi, checkHindi } from "./hindi";
import AxeBuilder from "@axe-core/playwright";
const requestedWeek={timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:1020,endMinute:1140}]};
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
    preferredTime: JSON.stringify(requestedWeek),
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
      if(body.action==="ACCEPT" && item.proposal?.familyConfirmed && body.confirmedTiming!==item.proposal.timing)return route.fulfill({status:409,json:{code:"TIMING_CHANGED",message:"Confirm the family-approved time exactly, or send a new proposal for family approval."}});
      Object.assign(item, {
        version: item.version + 1,
        status:
          ["PROPOSE","COUNTER_PROPOSE"].includes(body.action)
            ? "PROPOSED"
            : body.action === "ACCEPT_PROPOSAL"
              ? "PENDING"
              : body.action === "DECLINE" || body.action === "DECLINE_PROPOSAL"
              ? "DECLINED"
              : "ACCEPTED",
        proposal:
          ["PROPOSE","COUNTER_PROPOSE"].includes(body.action)
            ? {
                format: body.format,
                timing: body.schedule?.weekly ? body.schedule.weekly.map((row:any)=>`${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][row.weekday]} ${String(Math.floor(row.startMinute/60)).padStart(2,"0")}:${String(row.startMinute%60).padStart(2,"0")}\u2013${String(Math.floor(row.endMinute/60)).padStart(2,"0")}:${String(row.endMinute%60).padStart(2,"0")} IST`).join("; ") : body.timing,
                message: body.message,
                timezone: "Asia/Kolkata",
                schedule:body.schedule, proposedBy:body.action==="COUNTER_PROPOSE"?"FAMILY":"TEACHER", ...(body.action==="COUNTER_PROPOSE"?{familyConfirmed:true}:{}),
              }
            : body.action === "DECLINE_PROPOSAL" && body.message ? {...item.proposal,declineReason:body.message} : body.action === "ACCEPT_PROPOSAL" ? {...item.proposal,familyConfirmed:true,agreedSchedule:item.proposal?.schedule} : body.action === "ACCEPT" && item.proposal?.familyConfirmed ? {...item.proposal,agreedTiming:body.confirmedTiming,teacherConfirmedAt:new Date().toISOString()} : item.proposal,
      });
      return route.fulfill({ status: 201, json: item });
    }
    for(const item of items)if(item.proposal&&!item.proposal.schedule)item.proposal.schedule=structuredClone(requestedWeek);
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
  await expect(cards.first()).toContainText("Monday 17:00\u201319:00 IST");
  await expect(cards.first()).toHaveClass(/layered-summary-card/);await expect(cards.first().locator(".layered-summary-card-header")).toHaveCSS("background-color","rgb(255, 255, 235)");await expect(cards.first().locator(".layered-summary-card-footer")).toHaveCSS("background-color","rgb(248, 237, 255)");await expect(cards.first().locator(".layered-summary-card-footer .filter-button")).toHaveCount(0);await expect(cards.first().locator(".layered-summary-card-actions")).toHaveCSS("background-color","rgb(255, 255, 255)");await expect(cards.first().locator(".direct-enquiry-actions .filter-button")).toHaveCount(3);await expect(cards.first().getByRole("button",{name:"Accept enquiry",exact:true})).toHaveAttribute("data-accent","true");await cards.first().screenshot({path:"test-results/layered-enquiry-teacher.png",style:"nextjs-portal{display:none!important}"});
  await cards
    .first()
    .getByRole("button", { name: "Propose another time or group", exact: true })
    .click();
  const form = page.locator(".direct-reply-form");
  await form.getByLabel("Teaching format").selectOption("GROUP");
  await expect(form.locator('input[type=date]')).toHaveCount(0);
  await expect(form.getByLabel("Available from 1",{exact:true})).toHaveValue("17:00");
  await form.getByLabel("Available from 1",{exact:true}).fill("18:00");
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
    schedule:{timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:1080,endMinute:1140}]},
    confirmed: true,
  });
  await expect(cards.first()).toContainText("Alternative proposed");
  await expect(cards.first().getByRole("button", { name:"Accept enquiry", exact:true })).toBeDisabled();
  await expect(cards.first()).toContainText("Waiting for the family to confirm this proposal.");
  await cards.first().getByRole("button",{name:"Edit proposal",exact:true}).click();
  await expect(form.getByLabel("Available from 1",{exact:true})).toHaveValue("18:00");
  await form.getByLabel("Available from 1",{exact:true}).fill("17:00");
  await form.getByRole("checkbox").check();
  await form.getByRole("button",{name:"Confirm reply",exact:true}).click();
  expect(writes[1]).toMatchObject({action:"PROPOSE",expectedVersion:2,schedule:requestedWeek});
  await expect(cards.first().getByRole("button",{name:"Accept enquiry",exact:true})).toBeDisabled();
  items[0].status="PENDING";items[0].version=4;items[0].proposal.familyConfirmed=true;
  await panel.getByRole("button",{name:"Refresh enquiries",exact:true}).click();
  await expect(cards.first()).toContainText("The family confirmed this proposal.");
  await cards.first().getByRole("button",{name:"Accept enquiry",exact:true}).click();
  await expect(form).toContainText("17:00");await form.getByRole("checkbox").check();
  await form.getByRole("button",{name:"Confirm reply",exact:true}).click();
  expect(writes[2]).toMatchObject({action:"ACCEPT",expectedVersion:4});
  await expect(cards.first()).toContainText("The teacher has accepted this enquiry.");
  await page.screenshot({
    path: "test-results/direct-enquiries-desktop.png",
    fullPage: true,
  });
});
for(const days of [5,6])test("family and teacher edit all requested weekly ranges without adding a date ("+days+" days)",async({page})=>{
 const {items,writes}=await inbox(page,"TEACHER");const original={timezone:"Asia/Kolkata",weekly:Array.from({length:days},(_,i)=>({weekday:i+1,startMinute:960,endMinute:1200}))};items[0].preferredTime=JSON.stringify(original);
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Propose another time or group',exact:true}).click();const form=page.locator('.direct-reply-form');
 await expect(form.locator('input[type=date],input[type=datetime-local]')).toHaveCount(0);await expect(form.locator('.proposal-weekly-row')).toHaveCount(days);await expect(form.getByRole('button',{name:/Add|Remove/})).toHaveCount(0);
 await expect(form.getByLabel('Available from 1',{exact:true})).toHaveValue('16:00');await expect(form.getByLabel('Available from '+days,{exact:true})).toHaveValue('16:00');await form.getByLabel('Available from 1',{exact:true}).fill('18:00');await form.getByLabel('Message to the family').fill('Monday at 6 pm instead; other days are unchanged.');await form.getByRole('checkbox').check();
 await page.setViewportSize({width:390,height:1000});expect((await new AxeBuilder({page}).include('.app-modal[open]').analyze()).violations).toEqual([]);await page.getByRole('dialog').screenshot({path:'test-results/requested-weekly-'+days+'-days.png',style:'nextjs-portal{display:none!important}'});
 await form.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0].schedule.weekly).toHaveLength(days);expect(writes[0].schedule.weekly[0]).toMatchObject({weekday:1,startMinute:1080,endMinute:1200});expect(writes[0].schedule.weekly.slice(1)).toEqual(original.weekly.slice(1));expect(writes[0].schedule.date).toBeUndefined();
});

test("family counterproposal edits the same requested weekday and time rows",async({page})=>{
 const {items,writes}=await inbox(page,'GUARDIAN');Object.assign(items[0],{status:'PROPOSED',proposal:{format:'ONE_TO_ONE',timing:'Monday 18:00 to 19:00 IST',message:'Later time',timezone:'Asia/Kolkata',schedule:{timezone:'Asia/Kolkata',weekly:[{weekday:1,startMinute:1080,endMinute:1140}]}}});
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Suggest another time',exact:true}).click();const form=page.locator('.direct-reply-form');await expect(form.locator('input[type=date]')).toHaveCount(0);await expect(form.getByLabel('Available from 1',{exact:true})).toHaveValue('18:00');await form.getByLabel('Available from 1',{exact:true}).fill('17:30');await form.getByLabel('Message to the teacher').fill('Can we start at 5:30 instead?');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0]).toMatchObject({action:'COUNTER_PROPOSE',schedule:{timezone:'Asia/Kolkata',weekly:[{weekday:1,startMinute:1050,endMinute:1140}]}});
});

test("specific-date requests retain the family's date and allow only clock edits",async({page})=>{
 const {items,writes}=await inbox(page,'TEACHER');items[0].preferredTime=JSON.stringify({timezone:'Asia/Kolkata',slots:[{startsAt:'2099-01-01T11:30:00.000Z',endsAt:'2099-01-01T13:30:00.000Z'}]});
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Propose another time or group',exact:true}).click();const form=page.locator('.direct-reply-form');await expect(form.locator('input[type=date],input[type=datetime-local]')).toHaveCount(0);await expect(form).toContainText('Date from the family request');await form.getByLabel('Available from 1',{exact:true}).fill('18:00');await form.getByLabel('Message to the family').fill('Start one hour later on your requested date.');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0].schedule.slots).toEqual([{startsAt:'2099-01-01T12:30:00.000Z',endsAt:'2099-01-01T13:30:00.000Z'}]);
});

test("old standalone date proposal is replaced by the original weekly rows when edited",async({page})=>{
 const {items}=await inbox(page,'TEACHER');Object.assign(items[0],{status:'PROPOSED',proposal:{format:'ONE_TO_ONE',timing:'A previously saved standalone date',message:'Legacy proposal',timezone:'Asia/Kolkata',schedule:{date:'2099-01-01',startTime:'10:00',endTime:'11:00',timezone:'Asia/Kolkata'}}});
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Edit proposal',exact:true}).click();const form=page.locator('.direct-reply-form');await expect(form.locator('input[type=date],input[type=datetime-local]')).toHaveCount(0);await expect(form.getByLabel('Available from 1',{exact:true})).toHaveValue('17:00');await expect(form.getByLabel('Available until 1',{exact:true})).toHaveValue('19:00');
});

test("family weekly approval automatically shows the approved time while teacher acceptance remains pending",async({page})=>{
 const {items,writes}=await inbox(page,"GUARDIAN");Object.assign(items[0],{status:'PROPOSED',proposal:{format:'ONE_TO_ONE',timing:'Monday, 2099-11-02 17:00–18:00 IST',message:'5 pm works.',timezone:'Asia/Kolkata',proposedBy:'TEACHER',schedule:{timezone:'Asia/Kolkata',weekly:[{weekday:1,startMinute:1020,endMinute:1080}]}}});
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Accept proposal',exact:true}).click();const form=page.locator('.direct-reply-form');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0].action).toBe('ACCEPT_PROPOSAL');await expect(card).toContainText('Proposal confirmed by family');await expect(card).toContainText('Family-approved time (IST)');await expect(card).toContainText('17:00–18:00');await expect(card).toContainText('Original preferred time');
});

test("family can explain why a proposed time does not work",async({page})=>{
 const {items,writes}=await inbox(page,"GUARDIAN");Object.assign(items[0],{status:'PROPOSED',proposal:{format:'ONE_TO_ONE',timing:'Monday 5pm IST',message:'Please consider this time.',timezone:'Asia/Kolkata'}});
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Decline proposal',exact:true}).click();const form=page.locator('.direct-reply-form');await form.getByLabel('Reason for declining (optional)').fill('We have school at that time.');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0]).toMatchObject({action:'DECLINE_PROPOSAL',message:'We have school at that time.'});await expect(card).toContainText('Family response');await expect(card).toContainText('We have school at that time.');
});

test("teacher accepts a family weekly counter without retyping its agreed time",async({page})=>{
 const {items,writes}=await inbox(page,"TEACHER");Object.assign(items[0],{status:'PROPOSED',proposal:{format:'ONE_TO_ONE',timing:'Monday, 2099-11-02 15:00–16:00 IST',message:'3 pm works for us.',timezone:'Asia/Kolkata',proposedBy:'FAMILY',familyConfirmed:true,schedule:{timezone:'Asia/Kolkata',weekly:[{weekday:1,startMinute:900,endMinute:960}]}}});
 await page.goto('/dashboard/enquiries');const card=page.locator('.direct-enquiry-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'Accept enquiry',exact:true}).click();const form=page.locator('.direct-reply-form');await expect(form).toContainText('15:00');await expect(form.locator('input[type=time],input[type=date]')).toHaveCount(0);await expect(form.getByLabel('Confirm agreed time (IST)',{exact:true})).toHaveCount(0);await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0]).toMatchObject({action:'ACCEPT',confirmedTiming:'Monday, 2099-11-02 15:00–16:00 IST'});
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
  const {writes,items}=await inbox(page);const attempts:any[]=[];
  await page.route("**/api/v1/tuition-bookings/PLACEMENT/*",route=>route.fulfill({json:{id:"40000000-0000-4000-8000-000000000661",kind:"PLACEMENT",version:1,bookingVersion:0,month:"2026-11",monthlyPaise:300000,policyVersion:"pilot-v1",placementFeePaise:75000,familyConfirmed:false,teacherConfirmed:false,confirmed:false,closed:false,canConfirm:true,proActive:false,canMarkCompleted:false,completions:[]}}));
  await page.route("**/api/v1/direct-enquiries/*/responses",route=>{attempts.push({body:route.request().postDataJSON(),key:route.request().headers()["idempotency-key"]});if(attempts.length>1)Object.assign(items[0],{arrangementId:"40000000-0000-4000-8000-000000000661"});return attempts.length===1?route.abort("failed"):route.fallback();});
  await page.goto("/dashboard");const card=page.locator(".direct-inbox details").first();await card.locator("summary").click();const accept=card.getByRole("button",{name:"Accept enquiry",exact:true});await accept.click();
  const dialog=page.getByRole("dialog",{name:"Review your reply",exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText("Learner 0");await expect(dialog).toContainText("Maths");await expect(dialog).toContainText("Monday 17:00\u201319:00 IST");
  await expect(dialog.locator("input:not([type=checkbox]),select,textarea")).toHaveCount(0);await expect(dialog.locator(".filter-button-group button")).toHaveText(["Confirm reply","Cancel"]);await expect(dialog.getByRole("button",{name:"Confirm reply",exact:true})).toBeDisabled();
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();await expect(dialog).not.toBeVisible();await expect(accept).toBeFocused();expect(writes).toHaveLength(0);
  await accept.click();await page.setViewportSize({width:360,height:850});expect((await new AxeBuilder({page}).include(".app-modal").analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await dialog.screenshot({path:"test-results/reply-confirmation-modal.png",style:"nextjs-portal{display:none!important}"});
  await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"Confirm reply",exact:true}).click();await expect(dialog.getByRole("button",{name:"Cancel",exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(dialog).toBeVisible();await dialog.getByRole("button",{name:"Retry same decision",exact:true}).click();await expect(dialog).not.toBeVisible();
  expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);expect(attempts[0].body).toMatchObject({action:"ACCEPT",expectedVersion:1,expectedSourceVersion:1,confirmed:true});expect(writes).toHaveLength(1);
  const toast=page.locator(".action-toast");await expect(toast).toContainText("Enquiry reply recorded.");await expect(toast).toHaveCSS("position","fixed");await expect(page.locator(".direct-inbox").getByText("Enquiry reply recorded.",{exact:true})).toHaveCount(0);await toast.getByRole("button",{name:"Close",exact:true}).click();await expect(toast).toHaveCount(0);
  await expect(card.locator(".direct-acceptance")).toContainText("The teacher has accepted this enquiry.");await expect(card.getByRole("button",{name:"Confirm monthly tuition",exact:true})).toBeVisible();await expect(card.getByRole("link",{name:"View tuition arrangement",exact:true})).toHaveCount(0);expect((await new AxeBuilder({page}).include(".direct-acceptance").analyze()).violations).toEqual([]);await card.screenshot({path:"test-results/accepted-enquiry-card.png",style:"nextjs-portal{display:none!important}"});
});


test("teacher confirms the exact agreed weekly timetable without a new timing field",async({page})=>{
 const {items,writes}=await inbox(page);items[0].preferredTime=JSON.stringify({timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:1080,endMinute:1140}]});items[0].proposal={format:"ONE_TO_ONE",timing:"Monday 17:00\u201318:00 IST",message:"Family approved this alternative.",familyConfirmed:true,timezone:"Asia/Kolkata",schedule:{timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:1020,endMinute:1080}]}};
 await page.goto('/dashboard');const card=page.locator('.direct-inbox details').first();await card.locator('summary').click();await card.getByRole('button',{name:'Accept enquiry',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('input[type=time],input[type=date],input[type=text]')).toHaveCount(0);await expect(dialog).toContainText('17:00');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Confirm reply',exact:true}).click();expect(writes[0]).toMatchObject({action:'ACCEPT',confirmedTiming:'Monday 17:00\u201318:00 IST',confirmed:true});
});
