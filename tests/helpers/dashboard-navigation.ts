import { test, expect } from "@playwright/test";
import { dashboard } from "./dashboard-redesign";
import { chooseHindi } from "./hindi";
import { translateText } from "../../apps/web/app/locale";

export function dashboardNavigationChecks() {
  for (const hi of [false, true]) test(`dashboard sidebar persists through sections and browser history (${hi ? "Hindi mobile" : "English desktop"})`, async ({ page }) => {
    test.setTimeout(90000);
    if (hi) { await chooseHindi(page); await page.setViewportSize({ width:390, height:850 }); }
    else await page.setViewportSize({ width:1440, height:1000 });
    const f = await dashboard(page, "GUARDIAN");
    await page.route("**/api/v1/notifications**", route => route.fulfill({ json:{items:[],nextCursor:null} }));
    await page.route("**/api/v1/learner-profiles**", route => route.fulfill({ json:{items:[],creationStatus:"READY",nextCursor:null} }));
    const t = (s:string) => translateText(hi,s);
    await page.goto("/dashboard");
    await expect(page.locator(".dashboard-sidebar")).toBeVisible();
    await expect(page.getByRole("heading", {name:t("Parent or Guardian Dashboard"),exact:true})).toBeVisible();
    const sidebar = await page.locator(".dashboard-sidebar").elementHandle();
    const header = await page.locator("header.header").elementHandle();
    const initialSessionReads = f.reads.filter(p=>p==="/api/v1/auth/session").length;
    const documents:string[]=[];
    page.on("request", req => { if(req.isNavigationRequest() && req.resourceType()==="document") documents.push(req.url()); });
    const nav = async () => {
      if(hi && await page.locator(".dashboard-mobile-trigger").getAttribute("aria-expanded") !== "true") await page.locator(".dashboard-mobile-trigger").click();
      return page.locator(hi ? ".dashboard-mobile-nav nav" : ".dashboard-desktop-nav");
    };
    const initialNav = await nav();
    const overview = initialNav.locator('.dashboard-nav-item').filter({has:page.locator('a[href="/dashboard"]')});
    await overview.getByRole("button").click();
    const alive = async () => {
      expect(await sidebar!.evaluate(el=>el.isConnected)).toBe(true);
      expect(await page.locator(".dashboard-sidebar").evaluate((el,old)=>el===old,sidebar)).toBe(true);
      if(header) expect(await header.evaluate(el=>el.isConnected)).toBe(true);
    };
    await initialNav.getByRole("link",{name:t("Notifications"),exact:true}).click();
    await expect(page).toHaveURL(/dashboard\/notifications$/);
    await expect(page.locator(".delivery-workspace")).toBeVisible();
    await alive();
    await expect((await nav()).getByRole("link",{name:t("Notifications"),exact:true})).toHaveAttribute("aria-current","page");
    await expect((await nav()).locator('.dashboard-nav-item').filter({has:page.locator('a[href="/dashboard"]')}).getByRole("button")).toHaveAttribute("aria-expanded","true");
    await (await nav()).getByRole("link",{name:t("Manage children & learners"),exact:true}).click();
    await expect(page).toHaveURL(/dashboard\/learners$/);
    await expect(page.locator(".learner-profiles")).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await alive();
    await page.goBack();
    await expect(page.locator(".delivery-workspace")).toBeVisible();
    await alive();
    await page.goBack();
    await expect(page.locator(".hiring-overview")).toBeVisible();
    await alive();
    await page.goForward();
    await expect(page.locator(".delivery-workspace")).toBeVisible();
    await alive();
    expect(documents).toEqual([]);
    expect(f.reads.filter(p=>p==="/api/v1/auth/session")).toHaveLength(initialSessionReads);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.reload();
    await expect(page.locator(".delivery-workspace")).toBeVisible();
    await expect(page.locator(".dashboard-sidebar")).toBeVisible();
    await expect(page.locator(".returning-account-notice a")).toHaveCount(5);
    await expect(page.locator('.returning-account-notice a[href="/onboarding/guardian"]')).toBeVisible();
    await expect(page.locator('.returning-account-notice a[href="/support"]')).toBeVisible();
    await expect(page.locator(".returning-account-notice")).toBeVisible();
    await expect(page.locator(".returning-account-notice")).not.toContainText("This email is already registered");
  });
}
