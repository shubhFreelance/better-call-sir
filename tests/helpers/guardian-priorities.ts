import {test,expect} from "@playwright/test";
import {dashboard} from "./dashboard-redesign";
import {chooseHindi} from "./hindi";
import {translateText} from "../../apps/web/app/locale";
import AxeBuilder from "@axe-core/playwright";
const first="30000000-0000-4000-8000-000000000801",second="30000000-0000-4000-8000-000000000802";
for(const mode of ["pending","complete","error","pending-phone-hi"])test(`guardian overview remaining steps are authoritative (${mode})`,async({page})=>{
 const hi=mode==="pending-phone-hi",t=(text:string)=>translateText(hi,text);
 if(hi){await chooseHindi(page);await page.setViewportSize({width:390,height:850});}
 await dashboard(page,"GUARDIAN");
 const reads:string[]=[];
 await page.route("**/api/v1/onboarding/guardian",route=>route.fulfill({json:{gate:"READY",learnerCount:1,enquiryStatus:null}}));
 await page.route("**/api/v1/guardian-verifications?limit=50*",route=>{
  reads.push(route.request().url());
  if(mode==="error")return route.fulfill({status:503,json:{code:"UNAVAILABLE",message:"Unavailable"}});
  const later=new URL(route.request().url()).searchParams.has("cursor");
  return route.fulfill({json:{items:later?[{id:second,learnerName:"Amit",status:"APPROVED",learnerId:mode==="complete"?first:null}]:[{id:first,learnerName:"Anshuman",status:mode==="complete"?"APPROVED":"PENDING",learnerId:mode==="complete"?second:null}],nextCursor:later?null:first}});
 });
 await page.goto("/dashboard");
 const card=page.locator(".guardian-priorities"),badge=page.locator(hi?".dashboard-mobile-nav .guardian-priority-dot":".dashboard-desktop-nav .guardian-priority-dot");
 if(mode==="complete"){await expect(card).toHaveCount(0);await expect(badge).toHaveCount(0);return;}
 await expect(card).toHaveCSS("background-color","rgb(3, 79, 70)");
 await expect(card.locator(".guardian-priorities-note")).toHaveCSS("font-size","12px");
 await expect(card).toContainText(t("Pending staff review does not need another submission."));
 const info=card.locator(".info-tooltip-trigger");await info.scrollIntoViewIfNeeded();await info.focus();await info.press("Enter");await expect(page.getByRole("tooltip")).toContainText(t("Complete these steps for each child. Pending staff review does not need another submission."));await page.keyboard.press("Escape");
 const refresh=card.getByRole("button",{name:t("Refresh remaining steps"),exact:true});await expect(refresh).toHaveCSS("background-color","rgb(255, 255, 235)");await refresh.hover();await expect(refresh).toHaveCSS("background-color","rgb(240, 215, 255)");
 const a=await new AxeBuilder({page}).include(".guardian-priorities").analyze();expect(a.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await card.screenshot({path:`test-results/guardian-priorities-${mode}.png`,style:"nextjs-portal{display:none!important}"});
 if(mode==="error"){await expect(card.getByRole("alert")).toBeVisible();await expect(badge).toHaveText("!");return;}
 await expect(card).toContainText(t("Your verification is pending"));await expect(card).toContainText(t("Child profile setup is remaining — step 6"));
 if(hi)await page.locator(".dashboard-mobile-trigger").click();
 await expect(badge).toHaveText("2");await expect(badge).toHaveAttribute("title",/Anshuman[\s\S]*Amit[\s\S]*6/);
 await badge.focus();await page.keyboard.press("Enter");await expect(badge).toHaveAttribute("aria-expanded","true");
 await expect(page.locator(".guardian-priority-popover").getByRole("link",{name:t("Continue setup")})).toHaveAttribute("href","/guardian-verification?request="+second);
 await page.locator(".guardian-priority-popover").getByRole("link",{name:t("Continue setup")}).click({trial:true});
 expect(reads.some(url=>url.includes("cursor="))).toBe(true);
 await page.screenshot({path:hi?"test-results/guardian-overview-priorities-hi-phone.png":"test-results/guardian-overview-priorities.png",fullPage:true});
});
