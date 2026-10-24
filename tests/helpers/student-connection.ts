import {test,expect,type Page} from "@playwright/test";
import {dashboard} from "./dashboard-redesign";
import {chooseHindi,checkHindi} from "./hindi";
const id="10000000-0000-4000-8000-000000000661", child="20000000-0000-4000-8000-000000000661";
async function fixture(page:Page,{signed=true,role="GUARDIAN",status="PENDING",ack=false,denied=false}={}){
 const writes:string[]=[];
 await page.route("**/api/v1/**",route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()!=="GET")writes.push(path);
  const session={account:{id,name:"Synthetic Amit",email:"amit@example.test",role,verified:true},csrfToken:"synthetic-csrf"};
  if(path.endsWith("/dev/accounts"))return route.fulfill({json:[]});
  if(path.endsWith("/auth/session"))return route.fulfill({status:signed?200:401,json:signed?session:{code:"SESSION_REQUIRED",message:"Sign in"}});
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
 expect(writes).toEqual([]);
});
for(const denied of [false,true])test(`linked student readiness respects current access (${denied})`,async({page})=>{
 await fixture(page,{role:"STUDENT",denied});await page.goto("/onboarding/student?mode=together");
 if(denied){await expect(page.getByRole("alert")).toBeVisible();await expect(page.getByText("Your learning profile is ready",{exact:true})).toHaveCount(0);}
 else {await expect(page.getByRole("heading",{name:"Your learning profile is ready"})).toBeVisible();await expect(page.getByText("Guardian and student manage together",{exact:false})).toBeVisible();await expect(page.getByRole("link",{name:"Open dashboard",exact:true})).toHaveAttribute("href","/dashboard");}
});
test("private invitation sign-in stays on the activation route",async({page})=>{
 await fixture(page,{signed:false});await page.goto("/signup/student");
 await page.getByRole("link",{name:"Use a student invitation",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Activate your student invitation"})).toBeVisible();
 await page.getByLabel("Email address",{exact:true}).fill("amit@example.test");
 await page.getByRole("button",{name:"Send sign-in code",exact:true}).click();
 await page.getByLabel("Six-digit code",{exact:true}).fill("123456");
 await page.getByRole("button",{name:"Verify and continue",exact:true}).click();
 await expect(page).toHaveURL(/onboarding\/student\?mode=invitation$/);
 await expect(page.locator("#student-token")).toBeVisible();
});
test("shared-management card and status are available in Hindi on mobile",async({page})=>{
 await chooseHindi(page);await page.setViewportSize({width:390,height:850});await fixture(page);
 await page.goto("/signup/student");await expect(page.getByRole("heading",{name:"मैं और मेरे अभिभावक मिलकर सँभालेंगे"})).toBeVisible();
 await page.getByRole("link",{name:"अभिभावक के साथ आगे बढ़ें"}).click();await checkHindi(page);
 await expect(page.getByText("अपने अभिभावक की पुष्टि करें",{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/student-connection-hi-phone.png",fullPage:true});
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
