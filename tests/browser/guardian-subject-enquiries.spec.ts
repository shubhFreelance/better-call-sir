import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {ids,teachers} from '../../packages/test-fixtures/src';
import {chooseHindi} from '../helpers/hindi';
import {reviewGuardian} from './guardian-journey';

const scienceTeacher='30000000-0000-4000-8000-000000000082',mathsRequest=ids.request;
async function setup(page:Page,mode='completed'){
 const maths={id:mathsRequest,guardianId:ids.guardian,childId:ids.child,subject:'Maths',preferredTeacherId:ids.teacher,discoveryMethod:'MANUAL',status:'OPEN',version:1,mode:'ONLINE',language:'English',locality:'Raipur',budgetPaise:300000,schedule:'Monday 17:00',createdAt:new Date().toISOString()};
 let draft:any={kind:'ENQUIRY',state:mode==='empty'?'DRAFT':'READY',draft:{},version:mode==='empty'?0:5,completedResourceId:mode==='empty'?null:mathsRequest};
 if(mode==='active')draft={...draft,state:'DRAFT',completedResourceId:null,draft:{childId:ids.child,alias:'Karina',subject:'Maths',preferredTeacherId:ids.teacher,discoveryMethod:'MANUAL'}};
 const writes:any[]=[],keys=new Map();let submissions=0;
 let science:any=null;
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.endsWith('/auth/session'))return route.fulfill({json:{account:{id:ids.guardian,name:'Synthetic guardian',role:'GUARDIAN',verified:true},csrfToken:'synthetic-csrf'}});
  if(path.endsWith('/onboarding/parent'))return route.fulfill({json:{kind:'PARENT',state:'READY',draft:{},version:5,completedResourceId:mathsRequest}});
  if(path.endsWith('/teachers/rohan-verma'))return route.fulfill({json:{...teachers[1],id:scienceTeacher,boards:['CBSE'],grades:[6],demoAvailable:false,lockInDays:null}});
  if(path.endsWith('/children'))return route.fulfill({json:{items:[{id:ids.child,guardianId:ids.guardian,alias:'Karina',grade:6,board:'CBSE',schoolName:'DPS',schoolSubjects:['Maths','Science'],educationStage:'SCHOOL',classLevel:6,enquiryEligible:true}]}});
  if(path.endsWith('/requests/'+mathsRequest))return route.fulfill({json:maths});
  if(science&&path.endsWith('/requests/'+science.id))return route.fulfill({json:science});
  if(path.endsWith('/requests'))return route.fulfill({json:{items:science?[science,maths]:[maths],nextCursor:null}});
  if(path.endsWith('/direct-enquiries'))return route.fulfill({json:{items:[...(science?[{id:'60000000-0000-4000-8000-000000000082',kind:'GUARDIAN',sourceId:science.id,arrangementId:null,status:'PENDING',teacherName:'Rohan Verma',learner:{name:'Karina'},proposal:null}]:[]),{id:'60000000-0000-4000-8000-000000000081',kind:'GUARDIAN',sourceId:mathsRequest,arrangementId:ids.placement,status:'ACCEPTED',teacherName:'Ananya Sharma',learner:{name:'Karina'},proposal:null}],counts:{ACCEPTED:1},nextCursor:null}});
  if(path.endsWith('/tuition-bookings/PLACEMENT/'+ids.placement))return route.fulfill({json:{id:ids.placement,kind:'PLACEMENT',version:2,month:'2026-11',bookingVersion:2,monthlyPaise:300000,familyConfirmed:true,teacherConfirmed:true,confirmed:true,closed:mode==='closed',canConfirm:true,proActive:false,canMarkCompleted:false,completions:[]}});
  if(path.includes('/onboarding/enquiry')){
   if(req.method()==='POST'){
    const body=req.postDataJSON(),key=req.headers()['idempotency-key'];writes.push({path,body,key});
    if(keys.has(key))return route.fulfill({status:201,json:keys.get(key)});
    expect(body.expectedVersion).toBe(draft.version);
    if(path.endsWith('/restarts')){draft={...draft,version:draft.version+1,completedResourceId:null,state:'DRAFT',draft:{}};keys.set(key,structuredClone(draft));if(mode==='unknown')return route.abort('failed');}
    if(path.endsWith('/drafts'))draft={...draft,draft:body.draft,version:draft.version+1};
    if(path.endsWith('/completions')){submissions++;science={...maths,...draft.draft,id:'40000000-0000-4000-8000-000000000082',status:'OPEN'};draft={...draft,draft:{},version:draft.version+1,completedResourceId:science.id,state:'READY'};}
   }
   return route.fulfill({status:req.method()==='POST'?201:200,json:draft});
  }
  if(path.endsWith('/consents'))return route.fulfill({status:201,json:{accepted:true}});
  return route.fulfill({status:404,json:{code:'NOT_FOUND',message:'Synthetic route unavailable'}});
 });
 return {writes,getDraft:()=>draft,submissions:()=>submissions};
}
const url='/onboarding/parent?teacher='+scienceTeacher+'&profile=rohan-verma&learner='+ids.child+'&subject=Science';
test('Science selection is distinct from already booked Maths and continues the correct learner, subject and teacher',async({page})=>{
 const state=await setup(page);await page.goto(url);const science=page.getByRole('article',{name:'New enquiry: Science',exact:true}),maths=page.getByRole('article',{name:'Maths enquiry',exact:true});await expect(science).toContainText('Rohan Verma');await expect(science).toContainText('Not submitted');await expect(maths).toContainText('Teacher booked for November 2026');await expect(maths.getByRole('link',{name:'View enquiry'})).toHaveAttribute('href','/dashboard/requests?request='+mathsRequest);expect(state.writes).toHaveLength(0);await page.setViewportSize({width:390,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.guardian-enquiry-overview').analyze()).violations).toEqual([]);await page.locator('.guardian-enquiry-overview').screenshot({path:'test-results/subject-enquiry-overview-phone.png',style:'nextjs-portal{display:none!important}'});
 await page.setViewportSize({width:1440,height:1000});await page.locator('.guardian-enquiry-overview').screenshot({path:'test-results/subject-enquiry-overview-desktop.png',style:'nextjs-portal{display:none!important}'});await science.getByRole('button',{name:'Continue with Science',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click();await expect(page.getByLabel('Learner alias',{exact:true})).toHaveValue('Karina');await page.getByRole('button',{name:'Continue to tuition needs',exact:true}).click();await expect(page.getByLabel('Subject',{exact:true})).toHaveValue('Science');await page.getByRole('button',{name:'Continue to schedule',exact:true}).click();expect(state.getDraft().draft).toMatchObject({subject:'Science',preferredTeacherId:scienceTeacher,childId:ids.child});expect(state.submissions()).toBe(0);
});
test('an empty additional draft starts Science without requiring the generic create-another action',async({page})=>{
 const state=await setup(page,'empty');await page.goto(url);await page.getByRole('button',{name:'Continue with Science',exact:true}).click();await expect(page.getByRole('button',{name:'Agree and continue',exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
});
test('closed arrangements are not presented as current bookings in saved subject cards',async({page})=>{
 await setup(page,'closed');await page.goto(url);const maths=page.getByRole('article',{name:'Maths enquiry',exact:true});await expect(maths.locator('.status-badge')).toHaveText('Closed');await expect(maths).not.toContainText('Teacher booked');
});
test('assisted Science selection also stays separate from the completed Maths request',async({page})=>{
 const state=await setup(page);await page.goto('/onboarding/parent?discovery=ASSISTED&subject=Science&learner='+ids.child);const card=page.getByRole('article',{name:'New enquiry: Science',exact:true});await expect(card).toContainText('Let us search for you');await card.getByRole('button',{name:'Continue with Science',exact:true}).click();await expect(page.getByRole('button',{name:'Agree and continue',exact:true})).toBeVisible();expect(state.submissions()).toBe(0);
});
test('submitted Science shows awaiting reply beside booked Maths and revisiting does not start it again',async({page})=>{
 const state=await setup(page);await page.goto(url);await page.getByRole('button',{name:'Continue with Science',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Agree and continue',exact:true}).click();await page.getByRole('button',{name:'Continue to tuition needs',exact:true}).click();await reviewGuardian(page);await page.getByRole('button',{name:'Submit tuition request',exact:true}).click();const science=page.getByRole('article',{name:'Science enquiry',exact:true});await expect(science).toContainText('Awaiting teacher reply');await expect(science).toContainText('Rohan Verma');await expect(page.getByRole('article',{name:'Maths enquiry',exact:true})).toContainText('Teacher booked for November 2026');expect(state.submissions()).toBe(1);const count=state.writes.length;await page.goto(url);await expect(science).toContainText('Awaiting teacher reply');await expect(page.getByRole('button',{name:'Continue with Science',exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(count);expect(state.submissions()).toBe(1);
});
test('an unfinished Maths draft is preserved when a different subject is selected',async({page})=>{
 const state=await setup(page,'active');const before=structuredClone(state.getDraft());await page.goto(url);await expect(page.getByRole('heading',{name:'A saved enquiry is already in progress.',exact:true})).toBeVisible();expect(state.getDraft()).toEqual(before);expect(state.writes).toHaveLength(0);
});
test('uncertain Science restart keeps exact retry and never resubmits Maths',async({page})=>{
 const state=await setup(page,'unknown');await page.goto(url);const button=page.getByRole('button',{name:'Continue with Science',exact:true});await button.click();await expect(page.locator('main').getByRole('alert')).toContainText('couldn’t confirm');await button.click();await expect(page.getByRole('button',{name:'Agree and continue',exact:true})).toBeVisible();expect(state.writes).toHaveLength(2);expect(state.writes[1]).toEqual(state.writes[0]);expect(state.submissions()).toBe(0);
});
test('Hindi subject overview preserves authored names and subject context',async({page})=>{
 await chooseHindi(page);await setup(page);await page.setViewportSize({width:360,height:1000});await page.goto(url);await expect(page.getByRole('button',{name:/\u0915\u0947 \u0938\u093e\u0925 \u0906\u0917\u0947 \u092c\u0922\u093c\u0947\u0902/})).toBeVisible();await expect(page.getByText('Rohan Verma',{exact:true})).toBeVisible();expect((await new AxeBuilder({page}).include('.guardian-enquiry-overview').analyze()).violations).toEqual([]);
});
