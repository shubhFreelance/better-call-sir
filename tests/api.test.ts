import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync,ChildProcess} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
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
const evidenceDir=mkdtempSync(path.join(tmpdir(),"bcs-private-evidence-"));
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
 const env={...process.env,...local,DATABASE_URL:base.href,APP_MODE:'development',PORT:'4100',NODE_ENV:'test',EVIDENCE_DIRECTORY:evidenceDir};
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json'],{env,stdio:'pipe'});
 server=spawn(process.execPath,['apps/api/dist/main.js'],{env,stdio:'pipe'});
 let log='';server.stderr?.on('data',b=>{log+=b.toString();});
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:4100/api/v1/health/ready');if(r.ok)break;}catch{}if(server.exitCode!==null)throw new Error(`API exited: ${log}`);if(i===99)throw new Error('API readiness timed out');await new Promise(r=>setTimeout(r,100));}
 [parent,other,teacher,student,operator,unverified]=await Promise.all([ids.guardian,ids.otherGuardian,ids.teacherAccount,ids.student,ids.admin,ids.unverified].map(login));
}, {timeout:60000});
after(async()=>{if(server){server.kill('SIGTERM');await new Promise<void>(r=>{if(server.exitCode!==null)return r();server.once('exit',()=>r());});}await db.$disconnect();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();rmSync(evidenceDir,{recursive:true,force:true});});

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
test('teacher suspension removes discovery and new reservations',async()=>{const t=await db.teacher.findUniqueOrThrow({where:{id:ids.teacher}});const r=await operator.call(`/admin/teachers/${t.id}/reviews`,{expectedVersion:t.version,status:'SUSPENDED',reason:'Pending review'});assert.equal(r.status,201);assert.equal((await new Client().call('/teachers/ananya-sharma')).status,404);assert.equal((await parent.call('/revision/holds',{teacherId:t.id,startsAt:future(25),duration:20,topic:'Fractions'})).status,409);await db.teacher.update({where:{id:t.id},data:{status:'APPROVED',screeningComplete:t.screeningComplete,screeningValidUntil:t.screeningValidUntil}});});
test('refresh replay revokes the full session family, including new access',async()=>{const c=await login(ids.otherGuardian);const old=c.cookies,oldCsrf=c.csrf;const refreshed=await c.call('/auth/refresh',{});assert.equal(refreshed.status,201);const active=c.cookies;c.cookies=old;c.csrf=oldCsrf;assert.equal((await c.call('/auth/refresh',{})).status,401);c.cookies=active;assert.equal((await c.call('/dashboard')).status,401);});
test('concurrent refresh replay revokes every replacement session in the same family',async()=>{
 const first=await login(ids.otherGuardian),second=new Client();second.cookies=first.cookies;second.csrf=first.csrf;
 const old=await db.session.findUniqueOrThrow({where:{accessHash:createHash('sha256').update(first.cookies.split('bcs_access=')[1].split(';')[0]).digest('hex')}});
 assert.match(old.familyId,/^[0-9a-f-]{36}$/);
 const barrierPool=new Pool({connectionString:base.href}),barrier=await barrierPool.connect();const barrierKey=81234567;
 // Delay only this test's replacement insertion to make the replay/issuance race deterministic.
 await db.$executeRawUnsafe(`CREATE FUNCTION refresh_insert_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."familyId"='${old.familyId}'::uuid THEN PERFORM pg_advisory_xact_lock(${barrierKey}::bigint); END IF; RETURN NEW; END $$`);
 await db.$executeRawUnsafe('CREATE TRIGGER refresh_insert_barrier BEFORE INSERT ON "Session" FOR EACH ROW EXECUTE FUNCTION refresh_insert_barrier()');
 let pending:Promise<any>[]=[];
 try{
  await barrier.query('SELECT pg_advisory_lock($1::bigint)',[barrierKey]);
  pending.push(first.call('/auth/refresh',{}));
  let blocked=false;
  for(let i=0;i<100;i++){const locks=await barrier.query('SELECT 1 FROM pg_locks WHERE locktype=\'advisory\' AND objid=$1 AND NOT granted',[barrierKey]);if(locks.rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}
  assert(blocked,'Replacement insertion must reach the barrier.');
  let replayFinished=false;pending.push(second.call('/auth/refresh',{}).then(r=>{replayFinished=true;return r;}));
  for(let i=0;i<100;i++){const locks=await barrier.query('SELECT count(*) AS count FROM pg_locks WHERE locktype=\'advisory\' AND NOT granted');if(replayFinished||Number(locks.rows[0].count)>=2)break;await new Promise(r=>setTimeout(r,20));}
  await barrier.query('SELECT pg_advisory_unlock($1::bigint)',[barrierKey]);
  const results=await Promise.all(pending);assert.deepEqual(results.map(r=>r.status).sort(),[201,401]);
  const family=await db.session.findMany({where:{familyId:old.familyId}});assert.equal(family.length,2);assert(family.every(s=>s.revoked),'Replay must revoke the replacement, even if issuance overlaps the replay.');
  const active=results[0].status===201?first:second;assert.equal((await active.call('/dashboard')).status,401);
 }finally{
  await barrier.query('SELECT pg_advisory_unlock($1::bigint)',[barrierKey]);await Promise.allSettled(pending);
  await db.$executeRawUnsafe('DROP TRIGGER refresh_insert_barrier ON "Session"');await db.$executeRawUnsafe('DROP FUNCTION refresh_insert_barrier()');barrier.release();await barrierPool.end();
 }
});
test('refresh preserves the absolute family expiry and invalid CSRF cannot revoke the replacement',async()=>{
 const c=await login(ids.otherGuardian),oldCookie=c.cookies,oldCsrf=c.csrf;
 const access=oldCookie.split('bcs_access=')[1].split(';')[0];const original=await db.session.findUniqueOrThrow({where:{accessHash:createHash('sha256').update(access).digest('hex')}});
 const refreshed=await c.call('/auth/refresh',{});assert.equal(refreshed.status,201);
 const family=await db.session.findMany({where:{familyId:original.familyId}});assert.equal(family.length,2);assert(family.every(s=>s.expiresAt.getTime()===original.expiresAt.getTime()));
 const activeCookie=c.cookies;c.cookies=oldCookie;c.csrf='wrong';assert.equal((await c.call('/auth/refresh',{})).status,403);
 c.cookies=activeCookie;c.csrf=refreshed.data.csrfToken;assert.equal((await c.call('/dashboard')).status,200);
 c.cookies=oldCookie;c.csrf=oldCsrf;assert.equal((await c.call('/auth/refresh',{})).status,401);
 const malformed=new Client();malformed.cookies='bcs_refresh=j:%7B%7D';assert.equal((await malformed.call('/auth/refresh',{})).status,401);
});
test('production authentication and worker startup stay blocked before provider and MFA qualification',()=>{
 for(const env of [{APP_MODE:'production',NODE_ENV:'development'},{APP_MODE:'development',NODE_ENV:'production'}]){
  const result=spawnSync(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,...local,...env,PORT:'4199'},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Live mode is blocked/);
  const worker=spawnSync(process.execPath,['--import','tsx','apps/worker/src/main.ts'],{env:{...process.env,...local,...env},encoding:'utf8'});assert.equal(worker.status,1);assert.match(worker.stderr,/No live delivery adapters configured/);
 }
});
test('valid sandbox OTP creates only an unverified guardian, is single-use and stores hashed session credentials',async()=>{
 const client=new Client(),phone='+919999999993';const requested=await client.call('/auth/otp/request',{phone});assert.equal(requested.status,201);
 const body={phone,code:requested.data.developmentCode,name:'Synthetic OTP guardian'};
 const verified=await client.call('/auth/otp/verify',body);assert.equal(verified.status,201);assert.equal(verified.data.account.role,'GUARDIAN');assert.equal(verified.data.account.verified,false);
 for(const cookie of verified.headers.getSetCookie()){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i);}
 const access=client.cookies.split('bcs_access=')[1].split(';')[0];const persisted=await db.session.findUniqueOrThrow({where:{accessHash:createHash('sha256').update(access).digest('hex')}});assert.notEqual(persisted.accessHash,access);
 assert.equal((await client.call('/auth/otp/verify',body)).status,401);assert.equal((await client.call('/consents',{purpose:'tuition-and-learning-records',policyVersion:'development-v1',accepted:true})).status,403);assert.equal((await client.call('/requests',intake())).status,403);
});
test('OTP expiry and wrong-code attempt limits fail; OTP cannot assign a role',async()=>{const c=new Client(),phone='+919999999991';const otp=await c.call('/auth/otp/request',{phone});assert.equal(otp.status,201);await db.otp.update({where:{phone},data:{expiresAt:new Date(0)}});assert.equal((await c.call('/auth/otp/verify',{phone,code:otp.data.developmentCode,name:'Synthetic'})).status,401);const phone2='+919999999992';const valid=await c.call('/auth/otp/request',{phone:phone2});for(let i=0;i<5;i++)assert.equal((await c.call('/auth/otp/verify',{phone:phone2,code:valid.data.developmentCode==='000000'?'111111':'000000',name:'Synthetic'})).status,401);assert.equal((await c.call('/auth/otp/verify',{phone:phone2,code:valid.data.developmentCode,name:'Synthetic'})).status,401);});
test('invitation is guardian-bound, single-use and does not inherit parent privileges',async()=>{const child=await db.child.create({data:{guardianId:ids.guardian,alias:'New learner',grade:7,board:'CBSE'}});const invite=await parent.call(`/children/${child.id}/invitations`,{});assert.equal(invite.status,201);assert.equal((await other.call('/invitations/activate',{token:invite.data.token})).status,409);const c=await login(ids.guardian);const activated=await c.call('/invitations/activate',{token:invite.data.token});assert.equal(activated.status,201);assert.equal(activated.data.account.role,'STUDENT');assert.equal((await c.call('/notes')).status,403);assert.equal((await parent.call('/invitations/activate',{token:invite.data.token})).status,409);});
async function demoRequest() {
 const scheduleStart=future(44),scheduleEnd=new Date(new Date(scheduleStart).getTime()+3600000).toISOString();
 const request=await parent.call('/requests',intake({preferences:{timezone:'Asia/Kolkata',slots:[{startsAt:scheduleStart,endsAt:scheduleEnd}]}}));assert.equal(request.status,201);
 const rec=await operator.call(`/admin/requests/${request.data.id}/recommendations`,{expectedVersion:1});assert.equal(rec.status,201);
 const candidate=rec.data.items.find((c:{teacherId:string})=>c.teacherId===ids.teacher);assert(candidate);
 assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,{response:'ACCEPTED',expectedVersion:candidate.version})).status,201);
 const published=await operator.call(`/admin/requests/${request.data.id}/presentations`,{expectedVersion:rec.data.requestVersion,runId:rec.data.runId,candidateIds:[candidate.id],reason:'Reviewed eligible candidate for guardian'});assert.equal(published.status,201,JSON.stringify(published.data));
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
 assert.equal((await teacher.call(`/reservations/${proposed.data.reservationId}/scope`,{expectedVersion:1})).status,404);
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

function runEvidenceWorker(available=true) {
 const env={...process.env,...local,DATABASE_URL:base.href,APP_MODE:'development',NODE_ENV:'test',EVIDENCE_DIRECTORY:evidenceDir,CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:available?'3310':'3311',WORKER_ONCE:'1'};
 const result=spawnSync(process.execPath,['--import','tsx','apps/worker/src/main.ts'],{env,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
}
test('private evidence quarantines, uses a real scanner, enforces ownership and gates current-revision screening',async()=>{
 const account=await db.account.create({data:{phone:'+910000008801',name:'Synthetic applicant',role:'TEACHER',verified:true}}),applicant=await login(account.id);
 const profile={name:'Synthetic applicant',headline:'Class 8 Maths',bio:'Synthetic screening fixture only',subjects:['Maths'],boards:['CBSE'],grades:[8],languages:['English'],modes:['HOME'],localities:['Shankar Nagar'],monthlyPaise:250000,experience:3,consultationOptIn:false,feeTermsAccepted:true};
 const applied=await applicant.call('/teacher-applications',profile);assert.equal(applied.status,201,JSON.stringify(applied.data));const id=applied.data.id;
 assert(applied.data.feeTermsAcceptedAt);assert.equal(applied.data.feePolicyVersion,'pilot-v1');
 assert.equal((await operator.call(`/admin/teachers/${id}/reviews`,{expectedVersion:1,status:'APPROVED',reason:'Missing screening'})).status,409);
 const clean=Buffer.from('%PDF-1.4\nSynthetic evidence document\n%%EOF').toString('base64');
 const payload={expectedVersion:1,kind:'IDENTITY',mediaType:'application/pdf',contentBase64:clean};const key=randomUUID();
 assert.equal((await parent.call(`/teachers/${id}/evidence`,payload)).status,403);assert.equal((await teacher.call(`/teachers/${id}/evidence`,payload)).status,404);
 assert.equal((await applicant.call(`/teachers/${id}/evidence`,{...payload,status:'CLEAN'})).status,400);
 assert.equal((await applicant.call(`/teachers/${id}/evidence`,{...payload,contentBase64:Buffer.from('<script>bad</script>').toString('base64')})).status,400);
 const upload=await applicant.call(`/teachers/${id}/evidence`,payload,{key});assert.equal(upload.status,201);assert.equal(upload.data.status,'QUARANTINED');
 const regional=await db.account.create({data:{phone:'+910000008802',name:'Synthetic regional reviewer',role:'REVIEWER',region:'Delhi'}}),regionalReviewer=await login(regional.id);assert.equal((await regionalReviewer.call(`/teachers/${id}/evidence`)).status,404);
assert.equal((await applicant.call(`/teachers/${id}/evidence`,payload,{key})).data.id,upload.data.id);
 const read=async(client:Client)=>fetch(`http://127.0.0.1:4100/api/v1/evidence/${upload.data.id}/content`,{headers:{Cookie:client.cookies}});
 assert.equal((await read(applicant)).status,409);assert.equal((await read(parent)).status,403);assert.equal((await read(teacher)).status,404);
 const listing=await applicant.call(`/teachers/${id}/evidence`);assert.equal(listing.headers.get('cache-control'),'no-store');assert.equal(listing.data.items[0].id,upload.data.id);
 runEvidenceWorker(false);assert.equal((await db.evidence.findUniqueOrThrow({where:{id:upload.data.id}})).status,'QUARANTINED');
 runEvidenceWorker();assert.equal((await db.evidence.findUniqueOrThrow({where:{id:upload.data.id}})).status,'CLEAN');
 const download=await read(applicant);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store');assert.match(download.headers.get('content-disposition')!,/attachment/);assert.equal(Buffer.from(await download.arrayBuffer()).toString('base64'),clean);
 const validUntil=new Date(Date.now()+90*86400000).toISOString();let teacherVersion=1;
 for(const kind of ['IDENTITY','QUALIFICATIONS','CAPABILITY','REFERENCES']){
  const evidence=kind==='IDENTITY'?upload:await applicant.call(`/teachers/${id}/evidence`,{...payload,kind,expectedVersion:teacherVersion});if(kind!=='IDENTITY'){assert.equal(evidence.status,201);runEvidenceWorker();}
  const checked=await operator.call(`/admin/teachers/${id}/checks`,{expectedVersion:teacherVersion,kind,evidenceId:evidence.data.id,result:'PASSED',reason:'Synthetic reviewer assessment',validUntil,...(kind==='CAPABILITY'?{coverage:{subjects:['Maths'],boards:['CBSE'],grades:[8]}}:{})});assert.equal(checked.status,201,JSON.stringify(checked.data));teacherVersion++;
  if(kind!=='REFERENCES')assert.equal((await operator.call(`/admin/teachers/${id}/reviews`,{expectedVersion:teacherVersion,status:'APPROVED',reason:'Incomplete checks'})).status,409);
  const row=await db.verificationCheck.findUniqueOrThrow({where:{id:checked.data.id}});await assert.rejects(db.verificationCheck.update({where:{id:row.id},data:{reason:'Rewritten'}}));
 }
 const approved=await operator.call(`/admin/teachers/${id}/reviews`,{expectedVersion:teacherVersion,status:'APPROVED',reason:'All current screening checks passed'});assert.equal(approved.status,201,JSON.stringify(approved.data));
 assert((await new Client().call('/teachers')).data.items.some((t:any)=>t.id===id));
 const revised=await applicant.call(`/teacher-applications/${id}/revisions`,{...profile,expectedVersion:approved.data.version,subjects:['Science']});assert.equal(revised.status,201);assert.equal(revised.data.screeningComplete,false);assert.equal(revised.data.profileRevision,2);
 assert.equal((await new Client().call('/teachers')).data.items.some((t:any)=>t.id===id),false);assert.equal((await operator.call(`/admin/teachers/${id}/reviews`,{expectedVersion:revised.data.version,status:'APPROVED',reason:'Old revision checks'})).status,409);
 assert.equal((await applicant.call(`/teacher-applications/${id}/revisions`,{...profile,expectedVersion:approved.data.version})).status,409);
 const infected=await applicant.call(`/teachers/${id}/evidence`,{...payload,expectedVersion:revised.data.version,contentBase64:Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.from('58354f2150254041505b345c505a58353428505e2937434329377d2445494341522d5354414e444152442d414e544956495255532d544553542d46494c452124482b482a','hex')]).toString('base64')});assert.equal(infected.status,201);runEvidenceWorker();assert.equal((await db.evidence.findUniqueOrThrow({where:{id:infected.data.id}})).status,'INFECTED');
 assert.equal((await applicant.call(`/admin/teachers/${id}/checks`,{expectedVersion:revised.data.version,kind:'IDENTITY',evidenceId:infected.data.id,result:'PASSED',reason:'Self review',validUntil})).status,403);
 assert.equal((await operator.call(`/admin/teachers/${id}/checks`,{expectedVersion:revised.data.version,kind:'IDENTITY',evidenceId:infected.data.id,result:'PASSED',reason:'Infected evidence',validUntil})).status,409);
 await db.account.update({where:{id:account.id},data:{role:'REVIEWER'}});assert.equal((await applicant.call(`/admin/teachers/${id}/checks`,{expectedVersion:revised.data.version,kind:'IDENTITY',evidenceId:upload.data.id,result:'PASSED',reason:'Self reviewer',validUntil})).status,403);
 await assert.rejects(db.verificationCheck.create({data:{teacherId:ids.teacher,reviewerId:ids.admin,profileRevision:2,kind:'IDENTITY',evidenceId:upload.data.id,result:'PASSED',reason:'Foreign evidence',validUntil:new Date(validUntil)}}));
});

test('public discovery paginates stable approved projections with bounded cursors',async()=>{
 const first=await new Client().call('/teachers?limit=2');assert.equal(first.status,200);assert.equal(first.data.items.length,2);assert(first.data.nextCursor);
 const second=await new Client().call('/teachers?limit=2&cursor='+first.data.nextCursor);assert.equal(second.status,200);assert.equal(second.data.items.length,2);assert.equal(new Set([...first.data.items,...second.data.items].map((t:any)=>t.id)).size,4);assert.equal(second.data.nextCursor,null);
 assert.equal((await new Client().call('/teachers?limit=51')).status,400);assert.equal((await new Client().call('/teachers?cursor=bad')).status,400);
});
test('weekly IST availability, leave and shared-calendar occupancy produce private-free public slots',async()=>{
 const t=await db.teacher.findUniqueOrThrow({where:{id:ids.teacher}}),start=new Date(future(38)),end=new Date(start.getTime()+2*3600000);
 const query=`/teachers/${ids.teacher}/availability?kind=REVISION&startsAt=${encodeURIComponent(start.toISOString())}&endsAt=${encodeURIComponent(end.toISOString())}&limit=2`;
 const first=await new Client().call(query);assert.equal(first.status,200);assert.equal(first.data.items.length,2);assert(first.data.nextCursor);const validate=operationValidator('/teachers/{id}/availability','get','200');assert(validate(first.data),JSON.stringify(validate.errors));
 for(const slot of first.data.items)for(const field of ['guardianId','childId','reservationId','reason','accountId'])assert.equal(field in slot,false);
 const next=await new Client().call(query+'&cursor='+encodeURIComponent(first.data.nextCursor));assert.equal(next.status,200);assert(next.data.items[0].startsAt>first.data.items[1].startsAt);
 const leaveBody={expectedVersion:t.version,startsAt:start.toISOString(),endsAt:new Date(start.getTime()+40*60000).toISOString(),reason:'Synthetic personal leave'};
 assert.equal((await parent.call(`/teachers/${ids.teacher}/leave`,leaveBody)).status,403);
 const otherTeacher=await db.teacher.findFirstOrThrow({where:{id:{not:ids.teacher}}});assert.equal((await teacher.call(`/teachers/${otherTeacher.id}/leave`,leaveBody)).status,404);
 const key=randomUUID(),leave=await teacher.call(`/teachers/${ids.teacher}/leave`,leaveBody,{key});assert.equal(leave.status,201,JSON.stringify(leave.data));assert.equal((await teacher.call(`/teachers/${ids.teacher}/leave`,leaveBody,{key})).data.id,leave.data.id);
 const blocked=await new Client().call(query);assert(blocked.data.items.every((s:any)=>new Date(s.startsAt)>=new Date(leaveBody.endsAt)));
 assert.equal((await teacher.call(`/leave/${leave.data.id}/cancellations`,{expectedVersion:99,reason:'Stale'})).status,409);
 assert.equal((await teacher.call(`/leave/${leave.data.id}/cancellations`,{expectedVersion:1,reason:'Leave cancelled'})).status,201);
 const reserved=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,kind:'DEMO',startsAt:start,endsAt:new Date(start.getTime()+40*60000),status:'CONFIRMED'}});
 assert.equal((await teacher.call(`/teachers/${ids.teacher}/leave`,leaveBody)).status,409);assert((await new Client().call(query)).data.items.every((s:any)=>new Date(s.startsAt)>=reserved.endsAt));
 const day=new Date(start.getTime()+330*60000).getUTCDay(),pattern=await db.availabilityPattern.findFirstOrThrow({where:{teacherId:ids.teacher,kind:'REVISION',weekday:day}});
 const changed=await teacher.call(`/availability/${pattern.id}/changes`,{expectedVersion:pattern.version,active:false,reason:'Close unbooked slots'});assert.equal(changed.status,201);assert.equal((await new Client().call(query)).data.items.length,0);assert.equal((await db.reservation.findUniqueOrThrow({where:{id:reserved.id}})).status,'CONFIRMED');
 assert.equal((await teacher.call(`/availability/${pattern.id}/changes`,{expectedVersion:pattern.version,active:true,reason:'Stale'})).status,409);
 await db.availabilityPattern.update({where:{id:pattern.id},data:{active:true}});
 assert.equal((await teacher.call(`/teachers/${ids.teacher}/availability`,{expectedVersion:t.version,kind:'REVISION',weekday:day,startMinute:10*60,endMinute:12*60,timezone:'Asia/Kolkata',validFrom:new Date().toISOString().slice(0,10),validUntil:new Date(Date.now()+30*86400000).toISOString().slice(0,10)})).status,409);
 assert.equal((await teacher.call(`/teachers/${ids.teacher}/capacity`,{expectedVersion:t.version,maxActiveStudents:1,travelAccepted:true})).status,409);
 const settings=await teacher.call(`/teachers/${ids.teacher}/capacity`,{expectedVersion:t.version,maxActiveStudents:2,travelAccepted:true});assert.equal(settings.status,201);assert.equal((await teacher.call(`/teachers/${ids.teacher}/capacity`,{expectedVersion:t.version,maxActiveStudents:2,travelAccepted:true})).status,409);
 await db.teacher.update({where:{id:ids.teacher},data:{maxActiveStudents:t.maxActiveStudents}});
});

test('structured schedule preferences validate time and ownership while legacy text remains unconfirmed',async()=>{
 const legacy=await parent.call('/requests',intake());assert.equal(legacy.status,201);assert.equal(legacy.data.scheduleStatus,'UNCONFIRMED');
 const startsAt=future(45),endsAt=new Date(new Date(startsAt).getTime()+3600000).toISOString(),body={expectedVersion:1,timezone:'Asia/Kolkata',slots:[{startsAt,endsAt}]};
 assert.equal((await other.call(`/requests/${legacy.data.id}/schedules`,body)).status,404);assert.equal((await student.call(`/requests/${legacy.data.id}/schedules`,body)).status,403);
 assert.equal((await parent.call(`/requests/${legacy.data.id}/schedules`,{...body,slots:[{startsAt,endsAt:startsAt}]})).status,400);
 assert.equal((await parent.call(`/requests/${legacy.data.id}/schedules`,{...body,slots:[{startsAt,endsAt},{startsAt,endsAt}]})).status,400);
 const key=randomUUID(),confirmed=await parent.call(`/requests/${legacy.data.id}/schedules`,body,{key});assert.equal(confirmed.status,201);assert.equal(confirmed.data.scheduleStatus,'CONFIRMED');assert.equal(confirmed.data.version,2);assert.equal((await parent.call(`/requests/${legacy.data.id}/schedules`,body,{key})).data.version,2);
 assert.equal((await parent.call(`/requests/${legacy.data.id}/schedules`,body)).status,409);
 const direct=await parent.call('/requests',intake({preferences:{timezone:'Asia/Kolkata',slots:body.slots}}));assert.equal(direct.status,201);assert.equal(direct.data.scheduleStatus,'CONFIRMED');
 assert.equal((await parent.call('/requests',intake({childId:ids.child,grade:9}))).status,409);
 const account=await db.account.create({data:{phone:'+910000008803',name:'Synthetic regional operator',role:'OPERATOR',region:'Delhi'}}),regional=await login(account.id);assert.equal((await regional.call(`/requests/${legacy.data.id}`)).status,404);assert.equal((await regional.call('/requests')).data.items.length,0);
});
test('unsupported scope waitlist is retry-safe, private and does not create a child or a booking',async()=>{
 const children=await db.child.count({where:{guardianId:ids.guardian}}),body={grade:11,board:'CBSE',subject:'Physics',language:'English',mode:'ONLINE',region:'Raipur'},key=randomUUID();
 assert.equal((await student.call('/waitlist',body)).status,403);const created=await parent.call('/waitlist',body,{key});assert.equal(created.status,201);const validate=operationValidator('/waitlist','post','201');assert(validate(created.data),JSON.stringify(validate.errors));assert.equal(created.data.status,'PENDING');assert.equal((await parent.call('/waitlist',body,{key})).data.id,created.data.id);assert.equal((await parent.call('/waitlist',{...body,subject:'Chemistry'},{key})).status,409);assert.equal(await db.child.count({where:{guardianId:ids.guardian}}),children);assert.equal((await other.call('/waitlist')).data.items.some((x:any)=>x.id===created.data.id),false);
 assert.equal((await parent.call('/waitlist',{...body,grade:8,subject:'Maths'})).status,409);
 assert.equal((await parent.call('/waitlist',{...body,alias:'Unnecessary child data'})).status,400);
});

test('matching requires confirmed schedules and preserves immutable run, publication, exposure and decision evidence',async()=>{
 const legacy=await parent.call('/requests',intake()),needs=await operator.call(`/admin/requests/${legacy.data.id}/recommendations`,{expectedVersion:1});assert.equal(needs.status,201);assert.equal(needs.data.matchStatus,'NEEDS_SCHEDULE');assert.equal(needs.data.items.length,0);
 const startsAt=future(46),endsAt=new Date(new Date(startsAt).getTime()+3600000).toISOString();const request=await parent.call('/requests',intake({preferences:{timezone:'Asia/Kolkata',slots:[{startsAt,endsAt}]}}));assert.equal(request.status,201);
 const body={expectedVersion:1},key=randomUUID();assert.equal((await parent.call(`/admin/requests/${request.data.id}/recommendations`,body)).status,403);
 const run=await operator.call(`/admin/requests/${request.data.id}/recommendations`,body,{key});assert.equal(run.status,201,JSON.stringify(run.data));assert.equal(run.data.matchStatus,'MATCHED');const validate=operationValidator('/admin/requests/{id}/recommendations','post','201');assert(validate(run.data),JSON.stringify(validate.errors));
 assert.equal((await operator.call(`/admin/requests/${request.data.id}/recommendations`,body,{key})).data.runId,run.data.runId);assert.equal((await operator.call(`/admin/requests/${request.data.id}/recommendations`,body)).status,409);
 const candidate=run.data.items.find((c:any)=>c.teacherId===ids.teacher);assert(candidate);assert.equal((await parent.call(`/requests/${request.data.id}`)).data.candidates.length,0);
 const stored=await db.recommendationRun.findUniqueOrThrow({where:{id:run.data.runId}});assert.equal((stored.requestFeatures as any).grade,8);assert.equal('alias' in (stored.requestFeatures as any),false);await assert.rejects(db.recommendationRun.update({where:{id:stored.id},data:{result:'FAKE'}}));
 const publish={expectedVersion:run.data.requestVersion,runId:run.data.runId,candidateIds:[candidate.id],reason:'Reviewed public shortlist'};assert.equal((await parent.call(`/admin/requests/${request.data.id}/presentations`,publish)).status,403);const shown=await operator.call(`/admin/requests/${request.data.id}/presentations`,publish);assert.equal(shown.status,201);assert.equal((await parent.call(`/requests/${request.data.id}`)).data.candidates.length,1);
 assert.equal((await other.call(`/requests/${request.data.id}/presentations`,{runId:run.data.runId,candidateIds:[candidate.id]})).status,404);const exposure=await parent.call(`/requests/${request.data.id}/presentations`,{runId:run.data.runId,candidateIds:[candidate.id]});assert.equal(exposure.status,201);assert.equal(exposure.data.kind,'GUARDIAN_SHOWN');
 const responseBody={expectedVersion:shown.data.items[0].version,response:'ACCEPTED'},responseKey=randomUUID();const accepted=await teacher.call(`/candidates/${candidate.id}/responses`,responseBody,{key:responseKey});assert.equal(accepted.status,201);assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,responseBody,{key:responseKey})).data.version,accepted.data.version);assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,responseBody)).status,409);
 const selection=await parent.call(`/requests/${request.data.id}/selections`,{expectedVersion:run.data.requestVersion,candidateId:candidate.id,candidateVersion:accepted.data.version});assert.equal(selection.status,201);assert.equal(selection.data.action,'GUARDIAN_SELECTED');assert.equal(await db.placement.count({where:{requestId:request.data.id}}),0);assert.equal((await db.tuitionRequest.findUniqueOrThrow({where:{id:request.data.id}})).selectedCandidateId,candidate.id);
 const schedule=await parent.call(`/requests/${request.data.id}/schedules`,{expectedVersion:selection.data.requestVersion,timezone:'Asia/Kolkata',slots:[{startsAt:future(47),endsAt:new Date(new Date(future(47)).getTime()+3600000).toISOString()}]});assert.equal(schedule.status,201);assert.equal(schedule.data.selectedCandidateId,null);assert.equal((await parent.call(`/requests/${request.data.id}`)).data.candidates.length,0);assert.equal((await parent.call(`/requests/${request.data.id}/presentations`,{runId:run.data.runId,candidateIds:[candidate.id]})).status,409);
});
test('matching rechecks capacity, travel, calendar and suspension before presenting or accepting',async()=>{
 const startsAt=future(48),endsAt=new Date(new Date(startsAt).getTime()+3600000).toISOString(),preferences={timezone:'Asia/Kolkata',slots:[{startsAt,endsAt}]};
 const request=await parent.call('/requests',intake({preferences})),t=await db.teacher.findUniqueOrThrow({where:{id:ids.teacher}});
 await db.teacher.update({where:{id:t.id},data:{maxActiveStudents:1}});const capped=await operator.call(`/admin/requests/${request.data.id}/recommendations`,{expectedVersion:1});assert.equal(capped.status,201);assert.equal(capped.data.items.some((c:any)=>c.teacherId===t.id),false);
 await db.teacher.update({where:{id:t.id},data:{maxActiveStudents:10,travelAccepted:false}});const travel=await operator.call(`/admin/requests/${request.data.id}/recommendations`,{expectedVersion:capped.data.requestVersion});assert.equal(travel.data.items.some((c:any)=>c.teacherId===t.id),false);
 await db.teacher.update({where:{id:t.id},data:{travelAccepted:true}});const run=await operator.call(`/admin/requests/${request.data.id}/recommendations`,{expectedVersion:travel.data.requestVersion});assert.equal(run.status,201);const candidate=run.data.items.find((c:any)=>c.teacherId===t.id);assert(candidate);
 const collision=await db.reservation.create({data:{teacherId:t.id,guardianId:ids.otherGuardian,kind:'RECURRING',startsAt:new Date(startsAt),endsAt:new Date(endsAt),status:'CONFIRMED'}});
 const publish={expectedVersion:run.data.requestVersion,runId:run.data.runId,candidateIds:[candidate.id],reason:'Recheck before presentation'};assert.equal((await operator.call(`/admin/requests/${request.data.id}/presentations`,publish)).status,409);assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,{expectedVersion:candidate.version,response:'ACCEPTED'})).status,409);
 await db.reservation.update({where:{id:collision.id},data:{status:'CANCELLED'}});const published=await operator.call(`/admin/requests/${request.data.id}/presentations`,publish);assert.equal(published.status,201);
 await db.teacher.update({where:{id:t.id},data:{status:'SUSPENDED'}});assert.equal((await parent.call(`/requests/${request.data.id}`)).data.candidates.some((c:any)=>c.id===candidate.id),false);assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,{expectedVersion:published.data.items[0].version,response:'ACCEPTED'})).status,409);
 await db.teacher.update({where:{id:t.id},data:{status:t.status,maxActiveStudents:t.maxActiveStudents,travelAccepted:t.travelAccepted}});
 await db.recommendation.update({where:{id:candidate.id},data:{expiresAt:new Date(0)}});assert.equal((await teacher.call(`/candidates/${candidate.id}/responses`,{expectedVersion:published.data.items[0].version,response:'ACCEPTED'})).status,409);
});

test('suspending an expert flags paid future bookings without cancelling or fabricating a refund',async()=>{
 const t=await db.teacher.findUniqueOrThrow({where:{id:ids.teacher}});
 const hold=await parent.call('/revision/holds',{teacherId:t.id,startsAt:future(48),duration:20,topic:'Maths'});assert.equal(hold.status,201);
 await teacher.call(`/reservations/${hold.data.id}/scope`,{expectedVersion:1});
 const capture=await parent.call(`/dev/reservations/${hold.data.id}/capture`,{providerEventId:randomUUID(),amountPaise:30000,currency:'INR'});assert.equal(capture.data.reservation.status,'CONFIRMED');
 const review=await operator.call(`/admin/teachers/${t.id}/reviews`,{expectedVersion:t.version,status:'SUSPENDED',reason:'Screening issue requires review'});assert.equal(review.status,201);
 const support=await db.supportCase.findFirstOrThrow({where:{category:'PAID_BOOKING_REVIEW',description:{contains:hold.data.id}}});assert.equal(support.status,'OPEN');
 assert.equal((await db.reservation.findUniqueOrThrow({where:{id:hold.data.id}})).status,'CONFIRMED');
 assert.equal(await db.refund.count({where:{paymentId:capture.data.payment.id}}),0);
 await db.teacher.update({where:{id:t.id},data:{status:t.status,screeningComplete:t.screeningComplete,screeningValidUntil:t.screeningValidUntil}});
});
test('database ownership constraints reject cross-family learning and financial links',async()=>{
 const req=await parent.call('/requests',intake());assert.equal(req.status,201);
 await assert.rejects(db.tuitionRequest.update({where:{id:req.data.id},data:{childId:ids.otherChild}}));
 await assert.rejects(db.invitation.create({data:{childId:ids.otherChild,guardianId:ids.guardian,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000)}}));
 await assert.rejects(db.note.create({data:{childId:ids.otherChild,guardianId:ids.guardian,text:'Cross-family forbidden'}}));
 await assert.rejects(db.placement.create({data:{requestId:req.data.id,guardianId:ids.otherGuardian,childId:req.data.childId,teacherId:ids.teacher,monthlyPaise:300000}}));
 const payment=await db.payment.findFirstOrThrow();
 await assert.rejects(db.refund.create({data:{paymentId:payment.id,amountPaise:payment.amountPaise+1,reason:'Exceeds capture'}}));
 await assert.rejects(db.session.create({data:{accountId:randomUUID(),familyId:randomUUID(),accessHash:randomUUID(),refreshHash:randomUUID(),csrf:randomUUID(),accessExpiresAt:new Date(),expiresAt:new Date()}}));
});
test('reservation authorization follows declared availability, leave, expiry and concurrent cancellation',async()=>{
 const t=await db.teacher.findUniqueOrThrow({where:{id:ids.teacher}}),start=new Date(future(49)),end=new Date(start.getTime()+1200000);
 const leave=await db.availabilityException.create({data:{teacherId:t.id,startsAt:start,endsAt:end,reason:'Private leave'}});
 assert.equal((await parent.call('/revision/holds',{teacherId:t.id,startsAt:start.toISOString(),duration:20,topic:'Maths'})).status,409);
 await db.availabilityException.update({where:{id:leave.id},data:{active:false}});
 const hold=await parent.call('/revision/holds',{teacherId:t.id,startsAt:start.toISOString(),duration:20,topic:'Maths'});assert.equal(hold.status,201);
 const scope=await teacher.call(`/reservations/${hold.data.id}/scope`,{expectedVersion:1});assert.equal(scope.status,201);
 await db.teacher.update({where:{id:t.id},data:{screeningValidUntil:new Date(0)}});
 const capture=await parent.call(`/dev/reservations/${hold.data.id}/capture`,{providerEventId:randomUUID(),amountPaise:30000,currency:'INR'});assert.equal(capture.status,201);assert.equal(capture.data.reservation.status,'PAID_UNALLOCATED');
 assert.equal(await db.refund.count({where:{paymentId:capture.data.payment.id,status:'PENDING'}}),1);
 await db.teacher.update({where:{id:t.id},data:{screeningValidUntil:t.screeningValidUntil}});
 const next=await parent.call('/revision/holds',{teacherId:t.id,startsAt:future(50),duration:20,topic:'Maths'});assert.equal(next.status,201);
 const cancel={expectedVersion:1,reason:'Cancel once'};
 const outcomes=await Promise.all([parent.call(`/reservations/${next.data.id}/cancel`,cancel),parent.call(`/reservations/${next.data.id}/cancel`,cancel)]);
 assert.deepEqual(outcomes.map(x=>x.status).sort(),[201,409]);
 const account=await db.account.findUniqueOrThrow({where:{id:t.accountId}});await db.account.update({where:{id:account.id},data:{disabled:true}});
 assert.equal((await new Client().call(`/teachers/${t.id}/availability?startsAt=${future(51)}&endsAt=${future(52)}&kind=REVISION`)).status,404);
 await db.account.update({where:{id:account.id},data:{disabled:false}});
});
test('consent withdrawal blocks new intake, note sharing and student sessions',async()=>{assert.equal((await parent.call('/consents/withdraw',{})).status,201);assert.equal((await parent.call('/requests',intake())).status,403);assert.equal((await student.call('/dashboard')).status,401);assert.equal((await student.call('/auth/refresh',{})).status,401);assert.equal((await teacher.call('/notes')).data.items.length,0);});
