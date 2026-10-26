import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {chooseHindi,checkHindi} from '../helpers/hindi';
import {operationValidator} from '../helpers/contract';
const childId='20000000-0000-4000-8000-000000000711',otherId='20000000-0000-4000-8000-000000000712';
async function setup(page:Page,role='GUARDIAN',verified=false){
 const learners=[{id:childId,alias:'Synthetic learner',education:{stage:'SCHOOL',grade:6,board:'CBSE',institutionName:'Synthetic DPS',subjects:['Maths','Science']},version:1,enquiryEligible:true},...(role==='GUARDIAN'?[{id:otherId,alias:'Second learner',education:{stage:'SCHOOL',grade:12,board:'CBSE',institutionName:'Synthetic school',subjects:['Physics']},version:1,enquiryEligible:true}]:[])];
 const snapshots=new Map(learners.map(learner=>[learner.id,{learner,spaces:[] as any[],version:0}]));
 const saves:any[]=[],searches:URL[]=[],profileReads:URL[]=[],pings:any[]=[];
 const guardian={learnerId:childId,learnerName:'Synthetic learner',guardianName:'Synthetic sister',guardianEmail:'sister@example.test',relationship:'SIBLING',relationshipStatus:'APPROVED',verified,managementMode:'STUDENT_LED',canPing:!verified,nextPingAt:null as string|null};
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.endsWith('/auth/session'))return route.fulfill({json:{account:{id:'10000000-0000-4000-8000-000000000711',name:role==='GUARDIAN'?'Synthetic guardian':'Synthetic learner',role,verified:role==='GUARDIAN'},csrfToken:'synthetic-csrf'}});
  if(path.endsWith('/catalog'))return route.fulfill({json:{city:'Raipur',subjects:['Maths','Science','Physics'],boards:['CBSE'],grades:[6,12],educationStages:['SCHOOL'],earlyYearsLevels:[],studyYears:[],languages:['English','Hindi'],modes:['ONLINE','HOME'],localities:['Shankar Nagar'],timezone:'Asia/Kolkata',customSubjects:true,customBoards:true,customCourses:true}});
  if(path.endsWith('/independent-student/profile'))return route.fulfill({json:{accountId:'10000000-0000-4000-8000-000000000711',education:learners[0].education,version:1,editStatus:'EDITABLE'}});
  if(path.endsWith('/teachers/synthetic-explorer')){profileReads.push(url);return route.fulfill({json:{id:'30000000-0000-4000-8000-000000000711',slug:'synthetic-explorer',name:'Synthetic explorer teacher',headline:'Synthetic teacher',bio:'Synthetic coverage',subjects:['Maths'],boards:['CBSE'],grades:[url.searchParams.has('learnerId')?6:10],teachingCoverage:[{stage:'SCHOOL',subject:'Maths',board:'CBSE',grade:url.searchParams.has('learnerId')?6:10}],modes:['ONLINE'],languages:['English'],localities:[],monthlyPaise:300000,experience:5,avatarColor:'#E4E4D0',demoAvailable:false,lockInDays:0,consultationOptIn:false,capabilityLabel:'Reviewed subject coverage'}});}
  if(path.endsWith('/learner-profiles'))return route.fulfill({json:{items:learners,nextCursor:null,creationStatus:role==='GUARDIAN'?'READY':'READ_ONLY'}});
  if(path.endsWith('/learning-spaces')){
   const id=path.split('/').at(-2)!,snapshot=snapshots.get(id)!;
   if(!snapshot)return route.fulfill({status:404,json:{code:'NOT_FOUND',message:'Learner unavailable'}});
   if(req.method()==='POST'){const body=req.postDataJSON();if(body.expectedVersion!==snapshot.version)return route.fulfill({status:409,json:{code:'CONFLICT',message:'The learner or subject spaces changed. Reload and review them again.'}});saves.push(body);snapshot.spaces=body.spaces;snapshot.version++;}
   expect(operationValidator('/children/{id}/learning-spaces',req.method()==='POST'?'post':'get',req.method()==='POST'?'201':'200')(snapshot)).toBe(true);
   return route.fulfill({status:req.method()==='POST'?201:200,json:snapshot});
  }
  if(role==='STUDENT'&&!verified&&(path.endsWith('/onboarding/student/context')||path.endsWith('/dashboard/hiring')))return route.fulfill({status:401,json:{code:'STUDENT_ACCESS_REVOKED',message:'Guardian authorization is no longer active.'}});
  if(path.endsWith('/onboarding/student/context'))return route.fulfill({json:{learner:learners[0],spacesVersion:0,progress:{kind:'STUDENT',state:'ACTIVE',draft:{},version:0,completedResourceId:null},authority:'GUARDIAN_MANAGED'}});
  if(path.endsWith('/learning-management'))return route.fulfill({json:{childId:path.split('/').at(-2),mode:'STUDENT_LED',version:1,canManageLearning:true,canChangeManagement:role==='GUARDIAN'}});
  if(path.endsWith('/student/guardian'))return route.fulfill({json:guardian});
  if(path.endsWith('/student/guardian/pings')){pings.push(req.postDataJSON());guardian.canPing=false;guardian.nextPingAt='2026-10-28T10:00:00Z';return route.fulfill({status:201,json:{sent:true,nextPingAt:guardian.nextPingAt}});}
  if(path.endsWith('/teachers')){searches.push(url);return route.fulfill({json:{items:[],nextCursor:null}});}
  if(path.endsWith('/dashboard/hiring'))return route.fulfill({json:{role,definitionVersion:'hiring-v1',section:'ENQUIRIES',learners:[],learnersLimited:false,asOf:'2026-10-26T10:00:00Z',enquiries:[],arrangements:[],nextCursor:null,counts:{enquiries:0,openEnquiries:0,pendingResponses:0,termsPending:0,activeArrangements:0},gate:{verified:true,consent:true,privacyPaused:false}}});
  if(path.endsWith('/onboarding/guardian'))return route.fulfill({json:{name:'Synthetic guardian',gate:'READY',learnerCount:learners.length,enquiryStatus:'NOT_STARTED'}});
  if(path.endsWith('/inbox'))return route.fulfill({json:{items:[],tasks:[],unread:0,nextCursor:null}});
  if(path.endsWith('/direct-enquiries'))return route.fulfill({json:{items:[],nextCursor:null,counts:{ALL:0,PENDING:0,ACCEPTED:0,DECLINED:0}}});
  return route.fulfill({json:{items:[],nextCursor:null}});
 });
 return {learners,snapshots,saves,searches,profileReads,pings,guardian};
}
test('guardian creates and edits isolated spaces for each learner using the shared setup flow',async({page})=>{
 const state=await setup(page);await page.goto('/dashboard/learning-preferences?learner='+childId);
 await expect(page.locator('.dashboard-sidebar')).toBeVisible();await expect(page.getByText('Create a subject space before searching for teachers for this learner.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add a subject space',exact:true}).click();await expect(page.locator('#space-learner')).toBeDisabled();
 await page.getByRole('checkbox',{name:'These education details are correct',exact:true}).check();await page.getByRole('radio',{name:'Maths',exact:true}).check();await page.getByLabel('Language you prefer (optional)').selectOption('Hindi');
 await page.getByRole('button',{name:'Review student setup',exact:true}).click();await page.getByRole('button',{name:'Confirm and save student setup',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your student setup is saved.',exact:true})).toBeVisible();await expect(page.locator('.action-toast')).toContainText('Your student setup is saved.');
 await page.getByRole('button',{name:'Back to subject spaces',exact:true}).click();await expect(page.getByRole('button',{name:'Edit Maths space',exact:true})).toBeVisible();
 await page.locator('#space-learner').selectOption(otherId);await expect(page.getByRole('button',{name:'Edit Maths space',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Add a subject space',exact:true}).click();await expect(page.getByText('Class 12 · CBSE',{exact:true})).toBeVisible();await page.getByRole('checkbox',{name:'These education details are correct',exact:true}).check();await page.getByRole('radio',{name:'Physics',exact:true}).check();await page.getByRole('button',{name:'Review student setup',exact:true}).click();await page.getByRole('button',{name:'Confirm and save student setup',exact:true}).click();
 expect(state.snapshots.get(childId)!.spaces).toEqual([{subject:'Maths',language:'Hindi'}]);expect(state.snapshots.get(otherId)!.spaces).toEqual([{subject:'Physics'}]);await page.getByRole('button',{name:'Back to subject spaces',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await page.addStyleTag({content:'nextjs-portal {display:none}'});await page.screenshot({path:'test-results/guardian-learning-spaces.png',fullPage:true});
});
test('saved-space dropdown controls personalised search while everyone can explore all profiles',async({page})=>{
 const state=await setup(page);state.snapshots.get(childId)!.spaces=[{subject:'Maths',language:'Hindi'},{subject:'Science'}];
 await page.goto('/teachers?learner='+childId);await expect(page.locator('#search-learning-space')).toBeVisible();expect(state.searches).toHaveLength(0);
 await page.locator('#search-learning-space').selectOption('Maths');await expect.poll(()=>state.searches.some(url=>url.searchParams.get('learnerId')===childId&&url.searchParams.get('subject')==='Maths'&&url.searchParams.get('language')==='Hindi')).toBe(true);
 await page.locator('#search-learning-space').selectOption('Science');await expect.poll(()=>state.searches.some(url=>url.searchParams.get('subject')==='Science')).toBe(true);
 await page.locator('#search-learner').selectOption(otherId);await expect(page.getByText('Create a subject space before searching for teachers for this learner.',{exact:true})).toBeVisible();
 const count=state.searches.length;await page.waitForTimeout(200);expect(state.searches).toHaveLength(count);
 await page.getByRole('link',{name:'Explore all teacher profiles',exact:true}).click();await expect(page.locator('#search-learning-space')).toHaveCount(0);await page.locator('#search-subject').selectOption('Physics');await expect.poll(()=>state.searches.some(url=>!url.searchParams.has('learnerId')&&url.searchParams.get('subject')==='Physics')).toBe(true);
});
test('student dashboard highlights the linked guardian and the details page shows the recorded sibling relationship',async({page})=>{
 const state=await setup(page,'STUDENT');await page.goto('/dashboard');
 await expect(page.locator('.student-connection .student-guardian-summary')).toContainText('Synthetic sister');await expect(page.locator('.student-connection .student-guardian-summary')).toContainText('Sibling');
 await page.locator('.student-connection .student-guardian-summary').getByRole('link',{name:'View guardian details',exact:true}).click();
 await expect(page.locator('.student-guardian-card')).toContainText('sister@example.test');await expect(page.locator('.guardian-verification-badge')).toHaveText('Not verified');
 await page.getByRole('button',{name:'Ping your guardian',exact:true}).click();await expect(page.locator('.action-toast')).toContainText('Your guardian has been notified.');expect(state.pings).toEqual([{confirmed:true}]);await expect(page.getByRole('button',{name:'Ping your guardian',exact:true})).toBeDisabled();
 await expect(page.locator('.dashboard-sidebar').getByRole('link',{name:'Guardian details',exact:true})).toBeVisible();await expect(page.locator('.dashboard-sidebar').getByRole('link',{name:'Guardian verification',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:1440,height:1000});await page.addStyleTag({content:'nextjs-portal {display:none}'});await page.screenshot({path:'test-results/student-guardian-details.png',fullPage:true});
});
test('verified guardian shows the green badge and cannot be pinged; mobile details remain accessible',async({page})=>{
 const state=await setup(page,'STUDENT',true);await page.goto('/dashboard/guardian-details');
 await expect(page.locator('.guardian-verification-badge.verified')).toHaveText('Verified');await expect(page.getByRole('button',{name:'Ping your guardian',exact:true})).toBeDisabled();expect(state.pings).toHaveLength(0);
 await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.student-guardian-card').analyze()).violations).toEqual([]);
});
test('Hindi guardian spaces remain accessible',async({page})=>{
 await chooseHindi(page);await setup(page);await page.goto('/dashboard/learning-preferences?learner='+childId);await checkHindi(page);await page.setViewportSize({width:360,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).include('.student-welcome').analyze()).violations).toEqual([]);
});

test('guardian dashboard offers the create-spaces card with its sage background and correct destination',async({page})=>{
 await setup(page);await page.goto('/dashboard');const card=page.locator('.create-spaces-card');await expect(card).toContainText('Create spaces');await expect(card).toHaveCSS('background-color','rgb(228, 228, 208)');await expect(card.getByRole('link',{name:'Create spaces',exact:true})).toHaveAttribute('href','/dashboard/learning-preferences');await card.getByRole('link',{name:'Create spaces',exact:true}).click();await expect(page.getByRole('heading',{name:'Learning preferences',exact:true})).toBeVisible();
});

for(const role of ['STUDENT','INDEPENDENT_STUDENT'])test(role+' can explore an unbound public profile but must choose learning context before enquiring',async({page})=>{
 const state=await setup(page,role);await page.goto('/teachers/synthetic-explorer?explore=all');await expect(page.getByRole('heading',{name:'Synthetic explorer teacher',exact:true})).toBeVisible();await expect(page.locator('.profile-navigation a').first()).toHaveAttribute('href','/teachers?explore=all');expect(state.profileReads.length).toBeGreaterThan(0);expect(state.profileReads.every(url=>!url.searchParams.has('learnerId'))).toBe(true);await expect(page.getByRole('link',{name:'Enquire about this teacher',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Choose learner',exact:true})).toHaveAttribute('href','/teachers');
});

test('a removed subject space hides cached teacher enquiry actions after refreshing family access',async({page})=>{
 const state=await setup(page);state.snapshots.get(childId)!.spaces=[{subject:'Maths'}];await page.goto('/teachers/synthetic-explorer?learner='+childId+'&subject=Maths');await expect(page.getByRole('link',{name:'Enquire about this teacher',exact:true})).toBeVisible();state.snapshots.get(childId)!.spaces=[];await page.clock.install();await page.clock.fastForward(16000);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));Reflect.deleteProperty(document,'visibilityState');});await expect(page.getByText('Choose a saved subject space before enquiring about this teacher.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Enquire about this teacher',exact:true})).toHaveCount(0);
});

test('guardian unsaved preferences survive focus refresh and concurrent space edits require explicit reload',async({page})=>{
 const state=await setup(page);await page.goto('/dashboard/learning-preferences?learner='+childId);await page.getByRole('button',{name:'Add a subject space',exact:true}).click();await page.getByRole('checkbox',{name:'These education details are correct',exact:true}).check();await page.getByRole('radio',{name:'Maths',exact:true}).check();await page.getByLabel('How do you like to learn? (optional)').fill('Local unsaved preferences');state.snapshots.get(childId)!.spaces=[{subject:'Maths',language:'English'}];state.snapshots.get(childId)!.version=1;
 await page.clock.install();await page.clock.fastForward(16000);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));Reflect.deleteProperty(document,'visibilityState');});await expect(page.getByLabel('How do you like to learn? (optional)')).toHaveValue('Local unsaved preferences');await page.getByRole('button',{name:'Review student setup',exact:true}).click();await page.getByRole('button',{name:'Confirm and save student setup',exact:true}).click();await expect(page.getByText('Local unsaved preferences',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm and save student setup',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Reload latest student setup',exact:true})).toBeVisible();expect(state.saves).toHaveLength(0);
});

test('guardians with incomplete learner details get their own education action before adding a space',async({page})=>{
 const state=await setup(page);state.learners[0].enquiryEligible=false;await page.goto('/dashboard/learning-preferences?learner='+childId);await expect(page.getByRole('button',{name:'Add a subject space',exact:true})).toBeDisabled();await expect(page.getByRole('link',{name:'Open education profiles',exact:true})).toHaveAttribute('href','/dashboard/learners');expect(state.saves).toHaveLength(0);
});

test('guardian summary is embedded beside the education profile on desktop and stacks inside it on phones',async({page})=>{
 await setup(page,'STUDENT',true);await page.setViewportSize({width:1440,height:1000});await page.goto('/dashboard');const ready=page.locator('.student-access-ready'),summary=ready.locator('.student-guardian-summary');await expect(summary).toContainText('Synthetic sister');await expect(summary).toContainText('Sibling');await expect(summary.locator('.guardian-verification-badge')).toHaveText('Verified');await expect(page.locator('.student-guardian-card')).toHaveCount(0);
 const details=await ready.locator('.student-access-profile-details').boundingBox(),guardian=await summary.boundingBox();expect(guardian!.x).toBeGreaterThan(details!.x+details!.width);await expect(summary).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(summary).toHaveCSS('border-top-width','0px');await page.addStyleTag({content:'nextjs-portal {display:none}'});await ready.screenshot({path:'test-results/student-profile-guardian-inline.png'});
 await page.setViewportSize({width:360,height:800});const phoneDetails=await ready.locator('.student-access-profile-details').boundingBox(),phoneGuardian=await summary.boundingBox();expect(phoneGuardian!.y).toBeGreaterThan(phoneDetails!.y+phoneDetails!.height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.student-connection').analyze()).violations).toEqual([]);
});
