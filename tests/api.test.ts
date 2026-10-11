import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync,ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {ids} from '../packages/test-fixtures/src';
import {operationValidator} from './helpers/contract';
const local=parseEnv(readFileSync('.env','utf8'));
const base=new URL(local.DATABASE_URL);
assert(['127.0.0.1','localhost'].includes(base.hostname),'Integration tests require a local synthetic database.');
const name=`bcs_test_${randomUUID().replace(/-/g,'')}`;
const admin=new Pool({connectionString:base.href});base.pathname='/'+name;
const db=new PrismaClient({adapter:new PrismaPg({connectionString:base.href})});
let server:ChildProcess;
let parent:Client,other:Client,teacher:Client,student:Client,operator:Client,unverified:Client;
class Client {
 cookies=''; csrf='';
 async call(path:string,body?:unknown,opts:{key?:string;origin?:string;csrf?:string}={}) {
  const response=await fetch(`http://127.0.0.1:4100/api/v1${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:this.cookies,Origin:opts.origin||'http://localhost:3000','X-CSRF-Token':opts.csrf===undefined?this.csrf:opts.csrf,'Idempotency-Key':opts.key||randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();const cookies=response.headers.getSetCookie();if(cookies.length)this.cookies=cookies.map(x=>x.split(';')[0]).join('; ');
  if(data.csrfToken)this.csrf=data.csrfToken;
  return {status:response.status,data,headers:response.headers};
 }
}
async function login(id:string){const c=new Client();const r=await c.call('/dev/session',{accountId:id});assert.equal(r.status,201);return c;}
const future=(days=15,hour=6)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(hour,0,0,0);return d.toISOString();};
const intake=(extra={})=>({alias:'Test learner',grade:8,board:'CBSE',subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Monday after 5pm',...extra});
before(async()=>{
 await admin.query(`CREATE DATABASE "${name}"`);
 const env={...process.env,...local,DATABASE_URL:base.href,APP_MODE:'development',PORT:'4100',NODE_ENV:'test'};
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json'],{env,stdio:'pipe'});
 server=spawn(process.execPath,['apps/api/dist/main.js'],{env,stdio:'pipe'});
 let log='';server.stderr?.on('data',b=>{log+=b.toString();});
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:4100/api/v1/health/ready');if(r.ok)break;}catch{}if(server.exitCode!==null)throw new Error(`API exited: ${log}`);if(i===99)throw new Error('API readiness timed out');await new Promise(r=>setTimeout(r,100));}
 [parent,other,teacher,student,operator,unverified]=await Promise.all([ids.guardian,ids.otherGuardian,ids.teacherAccount,ids.student,ids.admin,ids.unverified].map(login));
}, {timeout:60000});
after(async()=>{if(server){server.kill('SIGTERM');await new Promise<void>(r=>{if(server.exitCode!==null)return r();server.once('exit',()=>r());});}await db.$disconnect();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();});

test('public catalog is an allowlisted projection and private API is no-store',async()=>{const r=await new Client().call('/teachers');assert.equal(r.status,200);assert.equal(r.data.items.length,4);for(const t of r.data.items){for(const field of ['accountId','phone','screeningComplete','verification','guardianId'])assert.equal(field in t,false);}const d=await parent.call('/dashboard');assert.equal(d.headers.get('cache-control'),'no-store');});
test('anonymous, role, Origin and CSRF checks reject direct requests',async()=>{assert.equal((await new Client().call('/dashboard')).status,401);assert.equal((await student.call('/requests',intake())).status,403);assert.equal((await parent.call('/requests',intake(),{origin:'https://attacker.invalid'})).status,403);assert.equal((await parent.call('/requests',intake(),{csrf:'wrong'})).status,403);});
test('unverified guardian cannot grant consent or capture child data',async()=>{assert.equal((await unverified.call('/consents',{purpose:'tuition-and-learning-records',policyVersion:'development-v1',accepted:true})).status,403);assert.equal((await unverified.call('/requests',intake())).status,403);});
test('intake is retry-safe; mismatched payload and cross-family child are rejected',async()=>{const key=randomUUID();const first=await parent.call('/requests',intake(),{key});assert.equal(first.status,201,JSON.stringify(first.data));const replay=await parent.call('/requests',intake(),{key});assert.equal(replay.data.id,first.data.id);assert.equal((await parent.call('/requests',intake({alias:'Different'}),{key})).status,409);assert.equal((await other.call(`/requests/${first.data.id}`)).status,404);assert.equal((await parent.call('/requests',intake({childId:ids.otherChild}))).status,404);});
test('mass assignment cannot set administrator or approved teacher status',async()=>{assert.equal((await parent.call('/requests',intake({role:'ADMIN'}))).status,400);assert.equal((await teacher.call(`/admin/teachers/${ids.teacher}/reviews`,{expectedVersion:1,status:'APPROVED',reason:'Self approve'})).status,403);});
test('student dashboard excludes finance, private notes, other children and purchases',async()=>{const r=await student.call('/dashboard');assert.equal(r.status,200);assert.deepEqual(r.data.children.map((x:{id:string})=>x.id),[ids.child]);for(const key of ['membership','requests','invoices','reservations','calls'])assert.equal(key in r.data,false);assert.equal((await student.call('/notes')).status,403);assert.equal((await student.call('/revision/holds',{})).status,403);assert.equal((await student.call('/pro/calls',{})).status,403);});
test('concurrent overlapping holds allow exactly one; adjacent half-open slot is accepted',async()=>{const body={teacherId:ids.teacher,startsAt:future(16),duration:40,topic:'Class 8 CBSE fractions'};const r=await Promise.all([parent.call('/revision/holds',body),other.call('/revision/holds',{...body,startsAt:new Date(new Date(body.startsAt).getTime()+20*60000).toISOString()})]);assert.deepEqual(r.map(x=>x.status).sort(),[201,409],JSON.stringify(r));const winner=r.find(x=>x.status===201)!;assert.equal((await parent.call('/revision/holds',{...body,startsAt:winner.data.endsAt,duration:20})).status,201);});
test('shared expert calendar blocks revision against an existing recurring lesson',async()=>{const start=future(18);await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,kind:'RECURRING',startsAt:new Date(start),endsAt:new Date(new Date(start).getTime()+3600000),status:'CONFIRMED'}});assert.equal((await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:start,duration:20,topic:'Maths'})).status,409);});
test('scope and exact price are prerequisites; replay captures once; early cancel creates one pending refund',async()=>{
 const r=await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:future(20),duration:20,topic:'Maths algebra'});assert.equal(r.status,201);
 const payload={providerEventId:randomUUID(),amountPaise:30000,currency:'INR'};
 assert.equal((await parent.call(`/dev/reservations/${r.data.id}/capture`,payload)).status,409);
 const scope=await teacher.call(`/reservations/${r.data.id}/scope`,{expectedVersion:1});assert.equal(scope.status,201);
 assert.equal((await parent.call(`/dev/reservations/${r.data.id}/capture`,{...payload,amountPaise:1})).status,409);
 const captured=await parent.call(`/dev/reservations/${r.data.id}/capture`,payload);assert.equal(captured.status,201,JSON.stringify(captured.data));assert.equal(captured.data.reservation.status,'CONFIRMED');
 const duplicate=await parent.call(`/dev/reservations/${r.data.id}/capture`,payload);assert.equal(duplicate.data.payment.id,captured.data.payment.id);assert.equal(await db.payment.count({where:{reservationId:r.data.id}}),1);
 const cancel=await parent.call(`/reservations/${r.data.id}/cancel`,{expectedVersion:captured.data.reservation.version,reason:'Guardian cancelled'});assert.equal(cancel.status,201);
 const refund=await db.refund.findUniqueOrThrow({where:{paymentId:captured.data.payment.id}});assert.equal(refund.amountPaise,30000);assert.equal(refund.status,'PENDING');
});
test('late capture on an expired, lost slot cannot displace the new booking',async()=>{const start=future(22);const r=await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:start,duration:20,topic:'Equations'});assert.equal(r.status,201);await teacher.call(`/reservations/${r.data.id}/scope`,{expectedVersion:1});await db.reservation.update({where:{id:r.data.id},data:{status:'EXPIRED',expiresAt:new Date(0)}});const newer=await other.call('/revision/holds',{teacherId:ids.teacher,startsAt:start,duration:20,topic:'Fractions'});assert.equal(newer.status,201);const paid=await parent.call(`/dev/reservations/${r.data.id}/capture`,{providerEventId:randomUUID(),amountPaise:30000,currency:'INR'});assert.equal(paid.status,201);assert.equal(paid.data.reservation.status,'PAID_UNALLOCATED');assert.equal((await db.reservation.findUniqueOrThrow({where:{id:newer.data.id}})).status,'HOLD');assert.equal(await db.refund.count({where:{paymentId:paid.data.payment.id}}),1);});
test('stale attendance cannot overwrite a correction; disputes are excluded from verified totals',async()=>{const id='60000000-0000-4000-8000-000000000001';const before=(await parent.call('/dashboard')).data.metrics.classesTaken;const r=await teacher.call(`/lessons/${id}/attendance`,{expectedVersion:1,attendance:'PRESENT',reason:'Confirmed'});assert.equal(r.status,201);assert.equal((await teacher.call(`/lessons/${id}/attendance`,{expectedVersion:1,attendance:'ABSENT',reason:'Stale'})).status,409);assert.equal((await other.call(`/lessons/${id}/disputes`,{reason:'Wrong family'})).status,404);assert.equal((await parent.call(`/lessons/${id}/disputes`,{reason:'This record is incorrect'})).status,201);assert.equal((await parent.call('/dashboard')).data.metrics.classesTaken,before-1);});
test('private notes require an explicit named active teacher; revocation removes access',async()=>{const n=await parent.call('/notes',{childId:ids.child,text:'Private text <script>alert(1)</script>'});assert.equal(n.status,201);assert.equal((await teacher.call('/notes')).data.items.length,0);assert.equal((await other.call(`/notes/${n.data.id}/shares`,{teacherId:ids.teacher,expectedVersion:1})).status,404);assert.equal((await parent.call(`/notes/${n.data.id}/shares`,{teacherId:ids.teacher,expectedVersion:1})).status,201);assert.equal((await teacher.call('/notes')).data.items.length,1);assert.equal((await parent.call(`/notes/${n.data.id}/shares`,{teacherId:null,expectedVersion:2})).status,201);assert.equal((await teacher.call('/notes')).data.items.length,0);});
test('free memberships and unrelated guardians cannot request Pro calls',async()=>{assert.equal((await other.call('/pro/calls',{placementId:ids.placement,startsAt:future(10,12)})).status,403);const r=await parent.call('/pro/calls',{placementId:randomUUID(),startsAt:future(10,12)});assert.equal(r.status,404);});
test('concurrent consultation acceptance cannot overspend; a failed connection releases allowance',async()=>{
 const calls=[];for(let i=0;i<5;i++){const at=new Date(future(11,12));at.setUTCMinutes(i*15);const r=await parent.call('/pro/calls',{placementId:ids.placement,startsAt:at.toISOString()});assert.equal(r.status,201);calls.push(r.data);}
 const results=await Promise.all(calls.map(c=>teacher.call(`/pro/calls/${c.id}/accept`,{expectedVersion:1})));assert.equal(results.filter(x=>x.status===201).length,4,JSON.stringify(results));assert.equal(results.filter(x=>x.status===409).length,1);
 const m=await db.membership.findUniqueOrThrow({where:{guardianId:ids.guardian}});assert.equal(m.reserved,4);
 const accepted=results.find(x=>x.status===201)!;const key=randomUUID();const failed=await teacher.call(`/dev/pro/calls/${accepted.data.id}/outcome`,{outcome:'FAILED'},{key});assert.equal(failed.status,201);await teacher.call(`/dev/pro/calls/${accepted.data.id}/outcome`,{outcome:'FAILED'},{key});const updated=await db.membership.findUniqueOrThrow({where:{guardianId:ids.guardian}});assert.equal(updated.reserved,3);assert.equal(updated.used,0);
});
test('privileged feature edits require reason/confirmation and audit is append-only',async()=>{assert.equal((await parent.call('/admin/flags/revision',{enabled:false,expectedVersion:1,reason:'test',confirmed:true})).status,403);const flag=await db.featureFlag.findUniqueOrThrow({where:{name:'revision'}});assert.equal((await operator.call('/admin/flags/revision',{enabled:false,expectedVersion:flag.version,reason:'Contain outage',confirmed:true})).status,201);assert.equal((await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:future(24),duration:20,topic:'Fractions'})).status,503);const audit=await db.audit.findFirstOrThrow({where:{action:'FEATURE_FLAG_CHANGED'}});await assert.rejects(db.audit.update({where:{id:audit.id},data:{reason:'Rewritten'}}));await db.featureFlag.update({where:{name:'revision'},data:{enabled:true}});});
test('teacher suspension removes discovery and new reservations',async()=>{const t=await db.teacher.findUniqueOrThrow({where:{id:ids.teacher}});const r=await operator.call(`/admin/teachers/${t.id}/reviews`,{expectedVersion:t.version,status:'SUSPENDED',reason:'Pending review'});assert.equal(r.status,201);assert.equal((await new Client().call('/teachers/ananya-sharma')).status,404);assert.equal((await parent.call('/revision/holds',{teacherId:t.id,startsAt:future(25),duration:20,topic:'Fractions'})).status,409);await db.teacher.update({where:{id:t.id},data:{status:'APPROVED'}});});
test('refresh replay revokes the full session family, including new access',async()=>{const c=await login(ids.otherGuardian);const old=c.cookies;const refreshed=await c.call('/auth/refresh',{});assert.equal(refreshed.status,201);const active=c.cookies;c.cookies=old;assert.equal((await c.call('/auth/refresh',{})).status,401);c.cookies=active;assert.equal((await c.call('/dashboard')).status,401);});
test('OTP expiry and wrong-code attempt limits fail; OTP cannot assign a role',async()=>{const c=new Client(),phone='+919999999991';const otp=await c.call('/auth/otp/request',{phone});assert.equal(otp.status,201);await db.otp.update({where:{phone},data:{expiresAt:new Date(0)}});assert.equal((await c.call('/auth/otp/verify',{phone,code:otp.data.developmentCode,name:'Synthetic'})).status,401);const phone2='+919999999992';const valid=await c.call('/auth/otp/request',{phone:phone2});for(let i=0;i<5;i++)assert.equal((await c.call('/auth/otp/verify',{phone:phone2,code:valid.data.developmentCode==='000000'?'111111':'000000',name:'Synthetic'})).status,401);assert.equal((await c.call('/auth/otp/verify',{phone:phone2,code:valid.data.developmentCode,name:'Synthetic'})).status,401);});
test('invitation is guardian-bound, single-use and does not inherit parent privileges',async()=>{const child=await db.child.create({data:{guardianId:ids.guardian,alias:'New learner',grade:7,board:'CBSE'}});const invite=await parent.call(`/children/${child.id}/invitations`,{});assert.equal(invite.status,201);assert.equal((await other.call('/invitations/activate',{token:invite.data.token})).status,409);const c=await login(ids.guardian);const activated=await c.call('/invitations/activate',{token:invite.data.token});assert.equal(activated.status,201);assert.equal(activated.data.account.role,'STUDENT');assert.equal((await c.call('/notes')).status,403);assert.equal((await parent.call('/invitations/activate',{token:invite.data.token})).status,409);});
async function demoRequest() {
 const request=await parent.call('/requests',intake());assert.equal(request.status,201);
 const rec=await operator.call(`/admin/requests/${request.data.id}/recommendations`,{expectedVersion:1});assert.equal(rec.status,201);
 const candidate=rec.data.items.find((c:{teacherId:string})=>c.teacherId===ids.teacher);assert(candidate);
 assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,{response:'ACCEPTED'})).status,201);
 return request.data.id as string;
}
async function confirmDemo(demo:any) {
 const a=await parent.call(`/demos/${demo.id}/acceptances`,{expectedVersion:demo.version});assert.equal(a.status,201,JSON.stringify(a.data));
 const b=await teacher.call(`/demos/${demo.id}/acceptances`,{expectedVersion:a.data.version});assert.equal(b.status,201,JSON.stringify(b.data));assert.equal(b.data.status,'CONFIRMED');return b.data;
}
async function endDemo(demo:any) {
 await db.reservation.update({where:{id:demo.reservationId},data:{startsAt:new Date(Date.now()-3600000),endsAt:new Date(Date.now()-1800000)}});
}
test('demo proposal is private, validated and retry-safe; tuition cannot skip the demo',async()=>{
 const requestId=await demoRequest(),body={requestId,teacherId:ids.teacher,startsAt:future(30),duration:30},key=randomUUID();
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher})).data.code,'DEMO_REQUIRED');
 assert.equal((await other.call('/demos',body)).status,404);assert.equal((await student.call('/demos',body)).status,403);
 assert.equal((await parent.call('/demos',{...body,duration:0})).status,400);
 assert.equal((await parent.call('/demos',{...body,startsAt:new Date().toISOString()})).status,400);
 const proposed=await parent.call('/demos',body,{key});assert.equal(proposed.status,201,JSON.stringify(proposed.data));
 assert.equal((await parent.call('/demos',body,{key})).data.id,proposed.data.id);
 assert.equal((await parent.call('/demos',{...body,duration:40},{key})).status,409);
 assert.equal((await other.call(`/demos/${proposed.data.id}/acceptances`,{expectedVersion:1})).status,404);
 assert.equal((await teacher.call(`/reservations/${proposed.data.reservationId}/scope`,{expectedVersion:1})).status,409);
 assert.equal((await parent.call(`/reservations/${proposed.data.reservationId}/cancel`,{expectedVersion:1,reason:'Bypass'})).status,404);
 assert.equal((await other.call('/demos')).data.items.some((d:any)=>d.id===proposed.data.id),false);
});
test('concurrent demo and revision proposals share one calendar; adjacent slots remain available',async()=>{
 const requestId=await demoRequest(),startsAt=future(31);
 const results=await Promise.all([parent.call('/demos',{requestId,teacherId:ids.teacher,startsAt,duration:30}),other.call('/revision/holds',{teacherId:ids.teacher,startsAt:new Date(new Date(startsAt).getTime()+10*60000).toISOString(),duration:40,topic:'Fractions'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409],JSON.stringify(results));
 const winner=results.find(r=>r.status===201)!;const end=winner.data.reservation?.endsAt||winner.data.endsAt;
 assert.equal((await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:end,duration:20,topic:'Adjacent'})).status,201);
});
test('rescheduling resets both acceptances, stale versions fail, and two outcomes unlock tuition',async()=>{
 const requestId=await demoRequest();const proposed=await parent.call('/demos',{requestId,teacherId:ids.teacher,startsAt:future(32),duration:30});assert.equal(proposed.status,201);
 let demo=await confirmDemo(proposed.data);
 assert.equal((await teacher.call(`/demos/${demo.id}/outcomes`,{expectedVersion:demo.version,outcome:'COMPLETED',reason:'Too early'})).status,409);
 const rescheduled=await teacher.call(`/demos/${demo.id}/reschedules`,{expectedVersion:demo.version,startsAt:future(33),duration:40,reason:'Schedule adjustment'});assert.equal(rescheduled.status,201,JSON.stringify(rescheduled.data));
 assert.equal(rescheduled.data.guardianAccepted,false);assert.equal(rescheduled.data.teacherAccepted,false);assert.equal(rescheduled.data.reservation.status,'HOLD');
 assert.equal((await parent.call(`/demos/${demo.id}/acceptances`,{expectedVersion:demo.version})).status,409);
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher})).status,409);
 demo=await confirmDemo(rescheduled.data);await endDemo(demo);
 const a=await parent.call(`/demos/${demo.id}/outcomes`,{expectedVersion:demo.version,outcome:'COMPLETED',reason:'Attended demo'});assert.equal(a.status,201);assert.equal(a.data.status,'CONFIRMED');
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher})).status,409);
 const b=await teacher.call(`/demos/${demo.id}/outcomes`,{expectedVersion:a.data.version,outcome:'COMPLETED',reason:'Attended demo'});assert.equal(b.status,201);assert.equal(b.data.status,'COMPLETED');
 const key=randomUUID();const placement=await parent.call('/placements',{requestId,teacherId:ids.teacher},{key});assert.equal(placement.status,201,JSON.stringify(placement.data));
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher},{key})).data.id,placement.data.id);
 assert.equal(await db.invoice.count({where:{placementId:placement.data.id}}),0);
});
test('no-show dispute blocks placement until an authorized, versioned review closes its support case',async()=>{
 const requestId=await demoRequest();const proposed=await parent.call('/demos',{requestId,teacherId:ids.teacher,startsAt:future(34),duration:30});assert.equal(proposed.status,201);
 const demo=await confirmDemo(proposed.data);await endDemo(demo);
 const body={expectedVersion:demo.version,outcome:'NO_SHOW',reason:'Teacher did not attend'},key=randomUUID();
 const disputed=await parent.call(`/demos/${demo.id}/outcomes`,body,{key});assert.equal(disputed.status,201,JSON.stringify(disputed.data));assert.equal(disputed.data.status,'DISPUTED');
 assert.equal((await parent.call(`/demos/${demo.id}/outcomes`,body,{key})).data.supportCaseId,disputed.data.supportCaseId);
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher})).status,409);
 const review={expectedVersion:disputed.data.version,resolution:'NOT_COMPLETED',reason:'Reviewed both statements; demo did not take place'};
 assert.equal((await teacher.call(`/admin/demos/${demo.id}/reviews`,review)).status,403);
 assert.equal((await operator.call(`/admin/demos/${demo.id}/reviews`,{...review,expectedVersion:1})).status,409);
 const reviewed=await operator.call(`/admin/demos/${demo.id}/reviews`,review);assert.equal(reviewed.status,201,JSON.stringify(reviewed.data));assert.equal(reviewed.data.status,'NOT_COMPLETED');
 assert.equal((await db.supportCase.findUniqueOrThrow({where:{id:disputed.data.supportCaseId}})).status,'RESOLVED');
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher})).status,409);
 assert.equal(await db.audit.count({where:{aggregateId:demo.id,action:'DEMO_DISPUTE_REVIEWED'}}),1);
});
test('expired demo cannot be accepted; cancellation releases its calendar slot',async()=>{
 const requestId=await demoRequest();const proposed=await parent.call('/demos',{requestId,teacherId:ids.teacher,startsAt:future(35),duration:30});assert.equal(proposed.status,201);
 await db.reservation.update({where:{id:proposed.data.reservationId},data:{expiresAt:new Date(0)}});
 assert.equal((await teacher.call(`/demos/${proposed.data.id}/acceptances`,{expectedVersion:1})).status,409);
 const cancelled=await parent.call(`/demos/${proposed.data.id}/cancellations`,{expectedVersion:1,reason:'Choose another time'});assert.equal(cancelled.status,201);
 assert.equal((await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:future(35),duration:20,topic:'Released slot'})).status,201);
});

test('real foundation responses match the discovery, identity and intake contract',async()=>{
 const check=(route:string,method:string,status:number,result:any)=>{assert.equal(result.status,status);const validate=operationValidator(route,method,String(status));assert(validate(result.data),JSON.stringify(validate.errors));};
 for(const route of ['/catalog','/teachers','/teachers/ananya-sharma','/auth/session','/dev/accounts','/children','/requests']) check(route==='/teachers/ananya-sharma'?'/teachers/{slug}':route,'get',200,await parent.call(route));
 const request=await parent.call('/requests',intake());check('/requests','post',201,request);check('/requests/{id}','get',200,await parent.call(`/requests/${request.data.id}`));
 check('/consents','post',201,await parent.call('/consents',{purpose:'tuition-and-learning-records',policyVersion:'development-v1',accepted:true}));
});

test('consent withdrawal blocks new intake, note sharing and student sessions',async()=>{assert.equal((await parent.call('/consents/withdraw',{})).status,201);assert.equal((await parent.call('/requests',intake())).status,403);assert.equal((await student.call('/dashboard')).status,401);assert.equal((await teacher.call('/notes')).data.items.length,0);});
