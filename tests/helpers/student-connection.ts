import {test,expect,type Page} from "@playwright/test";
import {dashboard} from "./dashboard-redesign";
import {chooseHindi,checkHindi} from "./hindi";
import {translateText} from "../../apps/web/app/locale";
import AxeBuilder from "@axe-core/playwright";
const id="10000000-0000-4000-8000-000000000661", child="20000000-0000-4000-8000-000000000661";
async function fixture(page:Page,{signed=true,role="GUARDIAN",status="PENDING",ack=false,denied=false}={}){
 const writes:string[]=[];
 await page.route("**/api/v1/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()!=="GET")writes.push(path);
  const session={account:{id,name:"Synthetic Amit",email:"amit@example.test",role,verified:true},csrfToken:"synthetic-csrf"};
  if(path.endsWith("/dev/accounts"))return route.fulfill({json:[]});
  if(path.endsWith("/auth/session"))return route.fulfill({status:signed?200:401,json:signed?session:{code:"SESSION_REQUIRED",message:"Sign in"}});
  if(path.endsWith("/invitations/check")){expect(route.request().postDataJSON()).toEqual({token:"synthetic-code"});return route.fulfill({status:201,json:{status:"READY"}});}
  if(path.endsWith("/invitations/link-email")){expect(route.request().postDataJSON()).toEqual({token:"synthetic-code",confirmed:true});role="STUDENT";return route.fulfill({status:201,json:{...session,account:{...session.account,role}}});}
  if(path.endsWith("/otp/request"))return route.fulfill({status:201,json:{status:"SANDBOX",expiresIn:300,developmentCode:"123456"}});
  if(path.endsWith("/otp/verify")){signed=true;return route.fulfill({status:201,json:{...session,accountCreated:false}});}
  if(path.endsWith("/guardian-verification-invitations"))return route.fulfill({json:{items:status==="NONE"?[]:[{id:child,guardianName:"Synthetic Papa",learnerName:"Synthetic Amit",managementMode:"SHARED",status,studentAcknowledgedAt:ack?new Date().toISOString():null}],nextCursor:null}});
  if(path.endsWith("/onboarding/student/context"))return route.fulfill({status:denied?403:200,json:denied?{code:"GUARDIAN_REQUIRED",message:"Permission revoked"}:{learner:{id:child,alias:"Synthetic Amit",education:{stage:"SCHOOL",grade:8,board:"CBSE",institutionName:"Synthetic School",subjects:["Maths"]}},progress:{},authority:"GUARDIAN_MANAGED"}});
  if(path.endsWith("/learning-management"))return route.fulfill({json:{childId:child,mode:"SHARED",canManageLearning:true}});
  return route.fulfill({json:{items:[],nextCursor:null}});
 });
 return writes;
}
for(const item of [{status:"NONE",heading:"No linked learning profile yet"},{status:"PENDING",heading:"Confirm your guardian"},{status:"APPROVED",ack:true,heading:"Your guardian is completing setup"},{status:"REVOKED",heading:"This relationship needs attention"}])test(`student connection explains ${item.status} without granting access`,async({page})=>{
 const writes=await fixture(page,item);await page.goto("/onboarding/student?mode=together");
 await expect(page.getByText(item.heading,{exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Open dashboard",exact:true})).toHaveCount(0);
 if(item.status==="PENDING"){const review=page.locator(".student-access-request").getByRole("link",{name:"Review relationship request",exact:true});await review.hover();await expect(review).toHaveCSS("background-color","rgb(231, 195, 250)");}
 expect(writes).toEqual([]);
});
for(const denied of [false,true])test(`linked student readiness respects current access (${denied})`,async({page})=>{
 await fixture(page,{role:"STUDENT",denied});await page.goto("/onboarding/student?mode=together");
 if(denied){await expect(page.locator(".student-connection").getByRole("alert")).toBeVisible();await expect(page.getByText("Your learning profile is ready",{exact:true})).toHaveCount(0);}
 else {await expect(page.getByRole("heading",{name:"Your learning profile is ready"})).toBeVisible();await expect(page.getByText("Guardian and student manage together",{exact:false})).toBeVisible();await expect(page.getByRole("link",{name:"Open dashboard",exact:true})).toHaveAttribute("href","/dashboard");}
});
test("private invitation is code-first and links the student's verified email without guardian sign-in",async({page})=>{
 await fixture(page,{signed:false});await page.goto("/signup/student");
 await page.getByRole("link",{name:"Use a student invitation",exact:true}).click();
 await expect(page.getByLabel("Email address",{exact:true})).toHaveCount(0);
 await page.getByLabel("Invitation code",{exact:true}).fill("synthetic-code");
 await page.getByRole("button",{name:"Check my invitation",exact:true}).click();
 await page.getByLabel("Your name",{exact:true}).fill("Synthetic Amit");
 await page.getByLabel("Email address",{exact:true}).fill("amit@example.test");
 await page.getByRole("button",{name:"Send sign-in code",exact:true}).click();
 await page.getByLabel("Six-digit code",{exact:true}).fill("123456");
 await page.getByRole("button",{name:"Verify and continue",exact:true}).click();
 await page.getByRole("checkbox",{name:/My guardian gave me this code/}).check();
 await page.getByRole("button",{name:"Link my student profile",exact:true}).click();
 await expect(page).toHaveURL(/onboarding\/student\?mode=together$/);
 await expect(page.getByRole("heading",{name:"Your learning profile is ready"})).toBeVisible();
});

test("shared-management card and status are available in Hindi on mobile",async({page})=>{
 await chooseHindi(page);await page.setViewportSize({width:390,height:850});await fixture(page);
 await page.goto("/signup/student");await expect(page.getByRole("heading",{name:"मैं और मेरे अभिभावक मिलकर सँभालेंगे"})).toBeVisible();
 await page.getByRole("link",{name:"अभिभावक के साथ आगे बढ़ें"}).click();await checkHindi(page);
 await expect(page.getByText("अपने अभिभावक की पुष्टि करें",{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/student-connection-hi-phone.png",fullPage:true});
});

for(const [width,hindi] of [[1440,false],[320,true]] as const) test(`student access design is compact and keyboard accessible (${width}px)`,async({page})=>{
 if(hindi) await chooseHindi(page);await fixture(page,{status:"NONE"});await page.setViewportSize({width,height:1000});await page.goto("/onboarding/student?mode=together");
 const card=page.locator(".student-connection"),t=(text:string)=>translateText(hindi,text);
 await expect(card.locator(".student-access-empty")).toContainText(t("No linked learning profile yet"));
 await expect(card.locator(".student-access-header")).toHaveCSS("background-color","rgb(3, 79, 70)");
 await expect(card.locator(".student-access-note")).toHaveCSS("font-size","12px");
 const info=card.locator(".student-access-header .info-tooltip-trigger");await expect(info).toHaveCSS("color","rgb(240, 215, 255)");await info.scrollIntoViewIfNeeded();await info.focus();await info.press("Enter");
 await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveCount(2);await page.keyboard.press("Escape");await expect(page.getByRole("tooltip")).toHaveCount(0);
 const parent=card.getByRole("link",{name:t("My parent or guardian needs an account"),exact:true});await expect(parent).toHaveAttribute("href","/signup/guardian");await parent.hover();await expect(parent).toHaveCSS("background-color","rgb(2, 62, 55)");
 const invite=card.getByRole("link",{name:t("I have a private invitation code"),exact:true});await expect(invite).toHaveAttribute("href","/onboarding/student?mode=invitation");await invite.hover();await expect(invite).toHaveCSS("background-color","rgb(231, 195, 250)");
 const refresh=card.getByRole("button",{name:t("Refresh my access"),exact:true});expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await expect(refresh).toHaveCSS("background-color","rgb(255, 255, 255)");await refresh.hover();await expect(refresh).toHaveCSS("background-color","rgb(238, 245, 243)");
 await expect(invite).toHaveCSS("background-color","rgb(240, 215, 255)");
 await expect(card.locator(".filter-button-group")).toHaveCSS("background-color","rgb(238, 245, 243)");
 if(hindi) await checkHindi(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const a=await new AxeBuilder({page}).include(".student-connection").analyze();expect(a.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
 await card.screenshot({path:`test-results/student-access-redesign-${width}.png`,style:"nextjs-portal{display:none!important}"});
});

test("refresh discovers the student account linked after guardian setup",async({page})=>{
 await fixture(page,{status:"APPROVED",ack:true});
 await page.goto("/onboarding/student?mode=together");
 await expect(page.getByText("Your guardian is completing setup",{exact:true})).toBeVisible();
 await page.route("**/api/v1/auth/session",route=>route.fulfill({json:{account:{id,name:"Synthetic Amit",role:"STUDENT",verified:true},csrfToken:"synthetic-csrf"}}));
 await page.getByRole("button",{name:"Refresh my access",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Your learning profile is ready"})).toBeVisible();
 await expect(page.getByText("Guardian and student manage together",{exact:false})).toBeVisible();
});

test("email login preserves the guardian acknowledgment destination",async({page})=>{
 await fixture(page,{signed:false});
 await page.goto("/login?next="+encodeURIComponent("/guardian-verification?view=student"));
 await page.getByLabel("Email address",{exact:true}).fill("amit@example.test");
 await page.getByRole("button",{name:"Send sign-in code",exact:true}).click();
 await page.getByLabel("Six-digit code",{exact:true}).fill("123456");
 await page.getByRole("button",{name:"Verify and continue",exact:true}).click();
 await expect(page).toHaveURL(/guardian-verification\?view=student$/);
 await expect(page.getByRole("heading",{name:"Confirm your guardian",exact:true})).toBeVisible();
});


test("dashboard shows the student's pending relationship handoff",async({page})=>{
 await dashboard(page,"GUARDIAN");
 await page.route("**/api/v1/guardian-verification-invitations?**",route=>route.fulfill({json:{items:[{id:child,guardianName:"Synthetic Papa",learnerName:"Synthetic Amit",managementMode:"SHARED",status:"APPROVED",studentAcknowledgedAt:new Date().toISOString()}],nextCursor:null}}));
 await page.goto("/dashboard");
 await expect(page.locator(".student-connection").getByText("Your guardian is completing setup",{exact:true})).toBeVisible();
 await expect(page.locator(".student-connection").getByRole("link",{name:"Review relationship request"})).toHaveAttribute("href","/guardian-verification?view=student");
});

test("three student choices share one compact desktop row",async({page})=>{
 await fixture(page);await page.setViewportSize({width:1440,height:1000});await page.goto("/signup/student");
 const cards=page.locator(".student-registration-grid .registration-card");
 await expect(cards).toHaveCount(3);
 const boxes=await cards.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width};}));
 expect(new Set(boxes.map(box=>Math.round(box.top))).size).toBe(1);
 expect(boxes[1].left).toBeGreaterThan(boxes[0].left+boxes[0].width);
 expect(boxes[2].left).toBeGreaterThan(boxes[1].left+boxes[1].width);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/student-choices-desktop-row.png",fullPage:true});
});

test("teacher overview displays published adult-student enquiries as well as the guardian queue",async({page})=>{
 await dashboard(page,"TEACHER");
 await page.route("**/api/v1/student-opportunities**",route=>route.fulfill({json:{items:[{id:child,enquiryId:child,version:1,response:"PENDING",subject:"Maths",educationScope:{stage:"SCHOOL",grade:12,board:"CBSE"},mode:"ONLINE",language:"English",locality:"Raipur",budgetPaise:100000,preferences:{timezone:"Asia/Kolkata",weekly:[{weekday:1,startMinute:960,endMinute:1020}]}}],nextCursor:null}}));
 await page.goto("/dashboard");
 await expect(page.locator(".teacher-opportunities-panel")).toContainText("Response needed");
 await expect(page.locator(".teacher-opportunities-panel").getByRole("button",{name:"Review interest",exact:true})).toBeVisible();
 await expect(page.locator(".hiring-overview")).toBeVisible();
});

test("teacher receives direct requests immediately with collapsed learning details",async({page})=>{
 await dashboard(page,"TEACHER");
 await page.route("**/api/v1/direct-enquiries**",route=>route.fulfill({json:{items:[{id:child,kind:"GUARDIAN",sourceId:child,ownerId:id,teacherId:id,region:"Raipur",childId:child,status:"PENDING",proposal:null,arrangementId:null,version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),subject:"Maths",mode:"ONLINE",language:"English",parentName:"Synthetic Papa",teacherName:"Rohan Verma",learner:{name:"Synthetic Amit",grade:8,board:"CBSE",institution:"Synthetic School",subjects:["Maths"]},preferredTime:"Monday 5pm IST",sourceVersion:1,canReply:true,canDecide:false,sourceOpen:true}],counts:{PENDING:1},nextCursor:null}}));
 await page.goto("/dashboard");
 const inbox=page.locator(".direct-inbox"),card=inbox.locator("details");
 await expect(inbox).toContainText("Enquiries received");await expect(card).not.toHaveAttribute("open");
 await expect(card.locator("summary")).toContainText("Synthetic Papa");
 await expect(card.getByText("Monday 5pm IST",{exact:true})).not.toBeVisible();
 await card.locator("summary").click();await expect(card.getByText("Monday 5pm IST",{exact:true})).toBeVisible();
 await expect(card.getByRole("button",{name:"Accept enquiry",exact:true})).toBeVisible();
});
