import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eligible,placementFee,revisionRefund,verifiedAttendance,window30} from '../apps/api/src/policies';
const request={subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:300000};
const child={grade:8,board:'CBSE'};
const teacher={status:'APPROVED',screeningComplete:true,subjects:['Maths'],modes:['HOME','ONLINE'],languages:['English'],localities:['Shankar Nagar'],monthlyPaise:300000,grades:[8],boards:['CBSE']};
test('placement fee respects paise, the 25% hypothesis and cap',()=>{assert.equal(placementFee(300000),75000);assert.equal(placementFee(1000000),150000);assert.equal(placementFee(50001),12500);});
test('every hard eligibility filter rejects independently',()=>{
 assert.equal(eligible(request,child,teacher),true);
 for(const patch of [{status:'SUSPENDED'},{screeningComplete:false},{subjects:['Science']},{modes:['ONLINE']},{languages:['Hindi']},{localities:['Mowa']},{monthlyPaise:300001},{grades:[9]},{boards:['CGBSE']}])assert.equal(eligible(request,child,{...teacher,...patch}),false,JSON.stringify(patch));
 assert.equal(eligible({...request,mode:'ONLINE',locality:'Elsewhere'},child,teacher),true);
});
test('verified class count excludes absent, cancelled, pending and disputed records',()=>{
 const completed={status:'COMPLETED',attendance:'PRESENT',disputed:false};assert.equal(verifiedAttendance(completed),true);assert.equal(verifiedAttendance({...completed,attendance:'LATE'}),true);
 for(const patch of [{status:'CANCELLED'},{status:'SCHEDULED'},{attendance:'ABSENT'},{attendance:'PENDING'},{disputed:true}])assert.equal(verifiedAttendance({...completed,...patch}),false);
});
test('six-hour refund boundary and provider non-delivery',()=>{const now=new Date('2026-10-12T06:00:00Z');assert.equal(revisionRefund(new Date('2026-10-12T12:00:00Z'),now,'GUARDIAN_CANCELLED'),true);assert.equal(revisionRefund(new Date('2026-10-12T11:59:59Z'),now,'GUARDIAN_CANCELLED'),false);assert.equal(revisionRefund(now,now,'TEACHER_NO_SHOW'),true);assert.equal(revisionRefund(now,now,'PLATFORM_UNAVAILABLE'),true);});
test('rolling metric window uses an exact instant and declares IST display',()=>{const now=new Date('2026-10-12T00:00:00Z');const w=window30(now);assert.equal(w.end,now);assert.equal(w.end.getTime()-w.start.getTime(),30*86400000);assert.equal(w.timezone,'Asia/Kolkata');});
