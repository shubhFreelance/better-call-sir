import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync,ChildProcess} from 'node:child_process';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {ids} from '../packages/test-fixtures/src';
import {operationValidator,contract} from './helpers/contract';
import {AppService,privileged} from '../apps/api/src/shared';
import {totp,newMfaSecret,encryptMfa,decryptMfa} from '../apps/api/src/modules/identity/totp';
import {otpDigest} from '../apps/api/src/modules/identity/email-otp';
import {completeCheckout} from '../apps/api/src/modules/payments/checkout';
process.env.MFA_ENCRYPTION_KEY=randomBytes(32).toString('base64');
process.env.OTP_HASH_KEY=randomBytes(32).toString('base64');
const mfaRecovery=new Map<string,string[]>();
const local=parseEnv(readFileSync('.env','utf8'));
const base=new URL(local.DATABASE_URL);
assert(['127.0.0.1','localhost'].includes(base.hostname),'Integration tests require a local synthetic database.');
const name=`bcs_test_${randomUUID().replace(/-/g,'')}`;
const admin=new Pool({connectionString:base.href});base.pathname='/'+name;
const db=new PrismaClient({adapter:new PrismaPg({connectionString:base.href})});
let server:ChildProcess;
const runtimeRoles:string[]=[];
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
async function login(id:string,verifyMfa=true){const c=new Client();const r=await c.call('/dev/session',{accountId:id});assert.equal(r.status,201);if(verifyMfa&&privileged(r.data.account.role)){let code=mfaRecovery.get(id)?.pop();if(!code){const enrollment=await c.call('/auth/mfa/enrollment',{});assert.equal(enrollment.status,201);code=totp(enrollment.data.secret,BigInt(Math.floor(Date.now()/30000)));}const verified=await c.call('/auth/mfa/verification',{code});assert.equal(verified.status,201,JSON.stringify(verified.data));if(verified.data.recoveryCodes.length)mfaRecovery.set(id,verified.data.recoveryCodes);}return c;}
const future=(days=15,hour=6)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(hour,0,0,0);return d.toISOString();};
const intake=(extra={})=>({alias:'Test learner',grade:8,board:'CBSE',subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Monday after 5pm',...extra});
before(async()=>{
 await admin.query(`CREATE DATABASE "${name}"`);
 const env={...process.env,...local,MFA_ENCRYPTION_KEY:process.env.MFA_ENCRYPTION_KEY,OTP_HASH_KEY:process.env.OTP_HASH_KEY,DATABASE_URL:base.href,MIGRATION_DATABASE_URL:base.href,APP_MODE:'development',PORT:'4100',NODE_ENV:'test',EMAIL_DELIVERY_MODE:'sandbox',RAZORPAY_KEY_ID:'rzp_test_synthetic_public',RAZORPAY_WEBHOOK_SECRET:['synthetic','webhook','key'].join('-'),EVIDENCE_DIRECTORY:evidenceDir};
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json'],{env,stdio:'pipe'});
 server=spawn(process.execPath,['apps/api/dist/main.js'],{env,stdio:'pipe'});
 let log='';server.stderr?.on('data',b=>{log+=b.toString();});
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:4100/api/v1/health/ready');if(r.ok)break;}catch{}if(server.exitCode!==null)throw new Error(`API exited: ${log}`);if(i===99)throw new Error('API readiness timed out');await new Promise(r=>setTimeout(r,100));}
 [parent,other,teacher,student,operator,unverified]=await Promise.all([ids.guardian,ids.otherGuardian,ids.teacherAccount,ids.student,ids.admin,ids.unverified].map(login));
}, {timeout:60000});
after(async()=>{if(server){server.kill('SIGTERM');await new Promise<void>(r=>{if(server.exitCode!==null)return r();server.once('exit',()=>r());});}await db.$disconnect();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);for(const role of runtimeRoles)await admin.query(`DROP ROLE IF EXISTS "${role}"`);await admin.end();rmSync(evidenceDir,{recursive:true,force:true});});
afterEach(async()=>{await db.reservation.updateMany({where:{kind:'REVISION',status:'HOLD'},data:{status:'EXPIRED',expiresAt:new Date(0)}});});

test('public catalog is an allowlisted projection and private API is no-store',async()=>{const r=await new Client().call('/teachers');assert.equal(r.status,200);assert.equal(r.data.items.length,4);for(const t of r.data.items){for(const field of ['accountId','phone','screeningComplete','verification','guardianId'])assert.equal(field in t,false);}const d=await parent.call('/dashboard');assert.equal(d.headers.get('cache-control'),'no-store');});
test('synthetic account picker excludes disabled and non-fixture identities',async()=>{const hidden=await db.account.create({data:{phone:'+91000000'+randomUUID().slice(0,8),name:'Disabled synthetic account',disabled:true}}),real=await db.account.create({data:{email:'non-fixture@example.test',name:'Not a public development identity'}}),result=await new Client().call('/dev/accounts');assert.equal(result.status,200);assert(!result.data.some((x:any)=>[hidden.id,real.id].includes(x.id)));assert(result.data.length<=50);});
test('direct teacher search and assisted requests preserve distinct discovery paths',async()=>{
 const results=await student.call('/teachers?board=CBSE&grade=8&language=English&mode=HOME&locality=Shankar%20Nagar&maxMonthlyPaise=300000');assert.equal(results.status,200);assert(results.data.items.length);for(const t of results.data.items)assert(t.monthlyPaise<=300000&&t.boards.includes('CBSE')&&t.grades.includes(8)&&t.localities.includes('Shankar Nagar'));
 assert.equal((await parent.call('/teachers?grade=11')).status,400);
 assert.equal((await parent.call('/requests',intake({discoveryMethod:'MANUAL'}))).status,400);
 assert.equal((await parent.call('/requests',intake({preferredTeacherId:ids.teacher}))).status,400);
 const start=future(43),body=intake({childId:ids.child,discoveryMethod:'MANUAL',preferredTeacherId:ids.teacher,preferences:{timezone:'Asia/Kolkata',slots:[{startsAt:start,endsAt:new Date(new Date(start).getTime()+3600000).toISOString()}]}}),key=randomUUID();
 const direct=await parent.call('/requests',body,{key});assert.equal(direct.status,201,JSON.stringify(direct.data));assert.equal(direct.data.discoveryMethod,'MANUAL');assert.equal((await parent.call('/requests',body,{key})).data.id,direct.data.id);
 const recommendations=await operator.call(`/admin/requests/${direct.data.id}/recommendations`,{expectedVersion:1});assert.equal(recommendations.status,201);assert.deepEqual(recommendations.data.items.map((x:any)=>x.teacherId),[ids.teacher]);
 const assisted=await parent.call('/requests',intake({childId:ids.child}));assert.equal(assisted.status,201);assert.equal(assisted.data.discoveryMethod,'ASSISTED');assert.equal(assisted.data.preferredTeacherId,null);assert.equal((await student.call('/requests',body)).status,403);
});
test('anonymous, role, Origin and CSRF checks reject direct requests',async()=>{assert.equal((await new Client().call('/dashboard')).status,401);assert.equal((await student.call('/requests',intake())).status,403);assert.equal((await parent.call('/requests',intake(),{origin:'https://attacker.invalid'})).status,403);assert.equal((await parent.call('/requests',intake(),{csrf:'wrong'})).status,403);});
test('every declared cookie-protected endpoint denies anonymous direct access',async()=>{
 let checked=0;for(const [route,methods] of Object.entries(contract.paths) as [string,Record<string,any>][])for(const [method,operation] of Object.entries(methods)){
  if(!(operation.security||contract.security||[]).some((x:any)=>'cookieSession' in x))continue;
  const endpoint=route.replace(/\{(\w+)\}/g,(_,name)=>name==='kind'?'parent':name==='name'?'revision':ids.child),response=await new Client().call(endpoint,method==='post'?{}:undefined);assert.equal(response.status,401,method+' '+route+' must deny anonymous access');checked++;
 }assert(checked>=70);
});
test('profileless teachers cannot read other teachers financial payables',async()=>{
 const account=await db.account.create({data:{phone:'+91000000'+randomUUID().slice(0,8),name:'Synthetic profileless teacher',role:'TEACHER'}}),client=await login(account.id);
 assert.equal((await client.call('/payables')).status,404);assert.equal((await client.call('/payables?status=ELIGIBLE')).status,404);
});
test('rate limits are atomic across instances, survive recreation and store no raw identifiers',async()=>{
 const first=new AppService(),second=new AppService();first.db=db;second.db=db;const key='synthetic-email:'+randomUUID(),attempts=await Promise.allSettled([first.limit(key,2),second.limit(key,2),first.limit(key,2),second.limit(key,2)]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,2);assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.getStatus()===429).length,2);
 const recreated=new AppService();recreated.db=db;await assert.rejects(recreated.limit(key,2),(e:any)=>e.getStatus()===429);
 const stored=await db.rateBucket.findUniqueOrThrow({where:{key:createHash('sha256').update(key).digest('hex')}});assert.equal(stored.count,5);assert(!stored.key.includes(key));
 await db.rateBucket.update({where:{key:stored.key},data:{resetsAt:new Date(0)}});await recreated.limit(key,2);assert.equal((await db.rateBucket.findUniqueOrThrow({where:{key:stored.key}})).count,1);
});
test('runtime database role can serve app data but cannot own schema, alter privileges, edit audit or read migration records',async()=>{
 const role='bcs_runtime_test_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:base.href}),client=await pool.connect();runtimeRoles.push(role);
 try{await client.query("SELECT set_config('bcs.runtime_role',$1,false)",[role]);await client.query(readFileSync('infra/sql/runtime-permissions.sql','utf8'));const authority=await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname=$1',[role]);assert(Object.values(authority.rows[0]).every(x=>x===false));await client.query(`SET ROLE "${role}"`);assert.equal((await client.query('SELECT count(*) FROM "Teacher"')).rows[0].count,'4');
  for(const sql of ['CREATE TABLE forbidden_table(id int)','ALTER TABLE "Account" ADD COLUMN forbidden_column int','TRUNCATE "Account" CASCADE','DELETE FROM "Audit"','SELECT * FROM "_prisma_migrations"','CREATE ROLE forbidden_role'])await assert.rejects(client.query(sql),(e:any)=>e.code==='42501');
  const inserted=await client.query('INSERT INTO "SupportCase" (id,"accountId",category,description,"updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP) RETURNING id',[randomUUID(),ids.guardian,'GENERAL','Synthetic runtime permission check']);assert(inserted.rows[0].id);
 }finally{await client.query('RESET ROLE');client.release();await pool.end();}
});
test('encrypted database/media backup restores into a new target and rejects wrong keys, tampering and existing data',async()=>{
 const suffix=randomUUID().replaceAll('-',''),sourceName='bcs_backup_'+suffix,targetName='bcs_restore_'+suffix,sourceUrl=new URL(base.href),targetUrl=new URL(base.href);sourceUrl.pathname='/'+sourceName;targetUrl.pathname='/'+targetName;
 const dir=mkdtempSync(path.join(tmpdir(),'bcs-restore-drill-')),media=path.join(dir,'source-media'),destination=path.join(dir,'restored-media'),archive=path.join(dir,'backup.bcs'),backupKey=randomBytes(32).toString('base64');mkdirSync(media,{mode:0o700});
 let source:Pool|undefined,target:Pool|undefined;
 try{await admin.query(`CREATE DATABASE "${sourceName}"`);await admin.query(`CREATE DATABASE "${targetName}"`);const env={...process.env,...local,DATABASE_URL:sourceUrl.href,MIGRATION_DATABASE_URL:sourceUrl.href,APP_MODE:'development',NODE_ENV:'test',EVIDENCE_DIRECTORY:media,BACKUP_ENCRYPTION_KEY:backupKey,PG_TOOLS_CONTAINER:process.env.PG_TOOLS_CONTAINER||'better-call-sir-dev-db-1'};
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,stdio:'pipe'});execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});source=new Pool({connectionString:sourceUrl.href});target=new Pool({connectionString:targetUrl.href});const fileId=randomUUID(),bytes=Buffer.from('%PDF-1.7\nSynthetic private restoration evidence'),note='Synthetic private note requiring backup confidentiality',secret=newMfaSecret(),encrypted=encryptMfa(secret,ids.admin);
  writeFileSync(path.join(media,fileId),bytes,{mode:0o600});await source.query('INSERT INTO "Evidence" (id,"teacherId",kind,"mediaType",size,sha256) VALUES ($1,$2,$3,$4,$5,$6)',[fileId,ids.teacher,'IDENTITY','application/pdf',bytes.length,createHash('sha256').update(bytes).digest('hex')]);await source.query('INSERT INTO "Note" (id,"guardianId","childId",text) VALUES ($1,$2,$3,$4)',[randomUUID(),ids.guardian,ids.child,note]);await source.query('INSERT INTO "MfaCredential" ("accountId","encryptedSecret") VALUES ($1,$2)',[ids.admin,encrypted]);
  const run=(args:string[],override:Record<string,string>={})=>spawnSync(process.execPath,['scripts/backup.mjs',...args],{env:{...env,...override},encoding:'utf8',timeout:60000});const saved=run(['create',archive]);assert.equal(saved.status,0,saved.stderr);assert.equal(statSync(archive).mode&0o777,0o600);const content=readFileSync(archive);assert(!content.includes(Buffer.from(note)));assert(!content.includes(bytes));assert(!content.includes(Buffer.from(secret)));const restoreEnv={DATABASE_URL:targetUrl.href,RESTORE_CONFIRM_DATABASE:targetName};
  assert.equal(run(['restore',archive,destination],{...restoreEnv,BACKUP_ENCRYPTION_KEY:randomBytes(32).toString('base64')}).status,1);assert(!existsSync(destination));assert.equal((await target.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count,'0');
  const corrupt=Buffer.from(content);corrupt[40]^=1;const bad=path.join(dir,'corrupt.bcs');writeFileSync(bad,corrupt);assert.equal(run(['restore',bad,destination],restoreEnv).status,1);assert(!existsSync(destination));
  const restored=run(['restore',archive,destination],restoreEnv);assert.equal(restored.status,0,restored.stderr);assert.equal((await target.query('SELECT text FROM "Note"')).rows[0].text,note);assert.deepEqual(readFileSync(path.join(destination,fileId)),bytes);assert.equal(decryptMfa((await target.query('SELECT "encryptedSecret" FROM "MfaCredential"')).rows[0].encryptedSecret,ids.admin),secret);
  assert.equal(run(['restore',archive,path.join(dir,'must-not-create')],restoreEnv).status,1);assert(!existsSync(path.join(dir,'must-not-create')));assert.equal((await target.query('SELECT text FROM "Note"')).rows[0].text,note);assert.equal(run(['create',archive]).status,1);assert.deepEqual(readFileSync(archive),content);
 }finally{await source?.end();await target?.end();await admin.query(`DROP DATABASE IF EXISTS "${sourceName}" WITH (FORCE)`);await admin.query(`DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`);rmSync(dir,{recursive:true,force:true});}
});
test('malformed JSON, oversized normal bodies and non-ASCII credentials fail safely with no-store headers',async()=>{
 const send=(body:string)=>fetch('http://127.0.0.1:4100/api/v1/auth/otp/request',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body});
 const malformed=await send('{"email":');assert.equal(malformed.status,400);assert.equal(malformed.headers.get('cache-control'),'no-store');assert.equal((await malformed.json()).code,'INVALID_JSON');
 const large=await send(JSON.stringify({email:'x'.repeat(70000)}));assert.equal(large.status,413);assert.equal(large.headers.get('cache-control'),'no-store');assert.equal((await large.json()).code,'UPLOAD_TOO_LARGE');
 assert.equal((await parent.call('/requests',intake(),{csrf:'é'.repeat(43)})).status,403);
 const result=await fetch('http://127.0.0.1:4100/api/v1/billing/webhooks/razorpay',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-event-id':randomUUID(),'x-razorpay-signature':'é'.repeat(64)},body:'{}'});assert.equal(result.status,401);assert.equal((await result.json()).code,'INVALID_SIGNATURE');
});
test('unverified guardian cannot grant consent or capture child data',async()=>{assert.equal((await unverified.call('/consents',{purpose:'tuition-and-learning-records',policyVersion:'development-v1',accepted:true})).status,403);assert.equal((await unverified.call('/requests',intake())).status,403);});
test('intake is retry-safe; mismatched payload and cross-family child are rejected',async()=>{const key=randomUUID();const first=await parent.call('/requests',intake(),{key});assert.equal(first.status,201,JSON.stringify(first.data));const replay=await parent.call('/requests',intake(),{key});assert.equal(replay.data.id,first.data.id);assert.equal((await parent.call('/requests',intake({alias:'Different'}),{key})).status,409);assert.equal((await other.call(`/requests/${first.data.id}`)).status,404);assert.equal((await parent.call('/requests',intake({childId:ids.otherChild}))).status,404);});
test('mass assignment cannot set administrator or approved teacher status',async()=>{assert.equal((await parent.call('/requests',intake({role:'ADMIN'}))).status,400);assert.equal((await teacher.call(`/admin/teachers/${ids.teacher}/reviews`,{expectedVersion:1,status:'APPROVED',reason:'Self approve'})).status,403);});
test('staff MFA blocks direct APIs, encrypts enrollment, rejects TOTP replay and consumes recovery codes once',async()=>{
 const account=await db.account.create({data:{phone:'+91000000'+randomUUID().slice(0,8),name:'Synthetic MFA staff',role:'ADMIN'}}),client=await login(account.id,false);
 for(const path of ['/dashboard','/requests','/admin/jobs',`/teachers/${ids.teacher}/evidence`]){const denied=await client.call(path);assert.equal(denied.status,403);assert.equal(denied.data.code,'MFA_REQUIRED');}
 assert.equal((await parent.call('/auth/mfa')).status,403);assert.equal((await client.call('/auth/mfa/enrollment',{role:'ADMIN'})).status,400);
 const enrollment=await client.call('/auth/mfa/enrollment',{});assert.equal(enrollment.status,201);const credential=await db.mfaCredential.findUniqueOrThrow({where:{accountId:account.id}});assert(!credential.encryptedSecret.includes(enrollment.data.secret));
 const stranger=await login(account.id,false);assert.equal((await stranger.call('/auth/mfa/enrollment',{})).status,409);
 const code=totp(enrollment.data.secret,BigInt(Math.floor(Date.now()/30000))),verified=await client.call('/auth/mfa/verification',{code});assert.equal(verified.status,201);assert.equal(verified.data.recoveryCodes.length,8);assert.equal((await client.call('/dashboard')).status,200);
 assert.equal((await client.call('/auth/mfa/verification',{code})).status,401);assert.equal((await client.call('/auth/mfa/enrollment',{})).status,409);
 const stored=await db.mfaCredential.findUniqueOrThrow({where:{accountId:account.id}});assert(stored.recoveryHashes.every(hash=>!verified.data.recoveryCodes.includes(hash)));
 const second=await login(account.id,false),third=await login(account.id,false),recovery=verified.data.recoveryCodes[0],results=await Promise.all([second.call('/auth/mfa/verification',{code:recovery}),third.call('/auth/mfa/verification',{code:recovery})]);assert.deepEqual(results.map(x=>x.status).sort(),[201,401]);assert.equal((await client.call('/dashboard')).status,401);assert.equal((await db.mfaCredential.findUniqueOrThrow({where:{accountId:account.id}})).recoveryHashes.length,7);
 const audit=await db.audit.findMany({where:{actorId:account.id}});assert(audit.some(x=>x.action==='MFA_RECOVERY_USED'));assert(!JSON.stringify(audit).includes(enrollment.data.secret));assert(!JSON.stringify(audit).includes(recovery));
});
test('staff step-up expires, refresh preserves its timestamp and idle sessions cannot refresh',async()=>{
 const account=await db.account.create({data:{phone:'+91000000'+randomUUID().slice(0,8),name:'Synthetic short staff session',role:'FINANCE'}}),client=await login(account.id),access=client.cookies.split('bcs_access=')[1].split(';')[0],session=await db.session.findUniqueOrThrow({where:{accessHash:createHash('sha256').update(access).digest('hex')}});
 assert(session.expiresAt.getTime()<=Date.now()+8*3600000);const old=new Date(Date.now()-660000);await db.session.update({where:{id:session.id},data:{mfaVerifiedAt:old}});assert.equal((await client.call('/payables')).status,403);
 assert.equal((await client.call('/auth/refresh',{})).status,201);const refreshed=await db.session.findUniqueOrThrow({where:{accessHash:createHash('sha256').update(client.cookies.split('bcs_access=')[1].split(';')[0]).digest('hex')}});assert.equal(refreshed.mfaVerifiedAt?.getTime(),old.getTime());assert.equal(refreshed.createdAt.getTime(),session.createdAt.getTime());assert.equal((await client.call('/payables')).status,403);
 await db.session.update({where:{id:refreshed.id},data:{lastSeenAt:new Date(Date.now()-960000)}});assert.equal((await client.call('/auth/session')).status,401);assert.equal((await client.call('/auth/refresh',{})).status,401);
});
test('staff enrollment expiry and repeated invalid MFA fail closed before any privilege is granted',async()=>{
 const account=await db.account.create({data:{phone:'+91000000'+randomUUID().slice(0,8),name:'Synthetic MFA limits',role:'REVIEWER'}}),client=await login(account.id,false),enrollment=await client.call('/auth/mfa/enrollment',{});assert.equal(enrollment.status,201);await db.mfaCredential.update({where:{accountId:account.id},data:{enrollmentExpiresAt:new Date(0)}});
 for(let i=0;i<5;i++)assert.equal((await client.call('/auth/mfa/verification',{code:'000000'})).status,401);
 assert.equal((await client.call('/auth/mfa/verification',{code:totp(enrollment.data.secret,BigInt(Math.floor(Date.now()/30000)))})).status,429);assert.equal((await client.call('/dashboard')).status,403);assert.equal((await db.mfaCredential.findUniqueOrThrow({where:{accountId:account.id}})).enabledAt,null);
 const access=client.cookies.split('bcs_access=')[1].split(';')[0];await db.session.update({where:{accessHash:createHash('sha256').update(access).digest('hex')},data:{createdAt:new Date(Date.now()-360000)}});assert.equal((await client.call('/auth/mfa/enrollment',{})).status,401);
});
test('student dashboard excludes finance, private notes, other children and purchases',async()=>{const r=await student.call('/dashboard');assert.equal(r.status,200);assert.deepEqual(r.data.children.map((x:{id:string})=>x.id),[ids.child]);for(const key of ['membership','requests','invoices','reservations','calls'])assert.equal(key in r.data,false);assert.equal((await student.call('/notes')).status,403);assert.equal((await student.call('/revision/holds',{})).status,403);assert.equal((await student.call('/pro/calls',{})).status,403);});
test('concurrent overlapping holds allow exactly one; adjacent half-open slot is accepted',async()=>{const body={teacherId:ids.teacher,startsAt:future(16),duration:40,topic:'Class 8 CBSE fractions'};const r=await Promise.all([parent.call('/revision/holds',body),other.call('/revision/holds',{...body,startsAt:new Date(new Date(body.startsAt).getTime()+20*60000).toISOString()})]);assert.deepEqual(r.map(x=>x.status).sort(),[201,409],JSON.stringify(r));const winner=r.find(x=>x.status===201)!;assert.equal((await parent.call('/revision/holds',{...body,startsAt:winner.data.endsAt,duration:20})).status,201);});
test('concurrent revision requests cannot exceed the guardian unpaid-hold quota',async()=>{for(let i=0;i<4;i++)assert.equal((await parent.call('/revision/holds',{childId:ids.child,teacherId:ids.teacher,startsAt:future(37+i),duration:20,topic:'Synthetic quota fixture'})).status,201);const results=await Promise.all([41,42].map(day=>parent.call('/revision/holds',{childId:ids.child,teacherId:ids.teacher,startsAt:future(day),duration:20,topic:'Concurrent quota fixture'})));assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);assert.equal(results.find(x=>x.status===409)!.data.code,'HOLD_LIMIT');assert.equal(await db.reservation.count({where:{guardianId:ids.guardian,kind:'REVISION',status:'HOLD'}}),5);});
test('learning-history cursors are owned objects rather than cross-family pagination hints',async()=>{const query=`/lessons?from=${encodeURIComponent(new Date(Date.now()-30*86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now()+60*86400000).toISOString())}&cursor=60000000-0000-4000-8000-000000000001`;assert.equal((await other.call(query)).status,404);assert.equal((await parent.call(query)).status,200);});
test('shared expert calendar blocks revision against an existing recurring lesson',async()=>{const start=future(18);await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,kind:'RECURRING',startsAt:new Date(start),endsAt:new Date(new Date(start).getTime()+3600000),status:'CONFIRMED'}});assert.equal((await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:start,duration:20,topic:'Maths'})).status,409);});
test('scope and exact price are prerequisites; replay captures once; early cancel creates one pending refund',async()=>{
 const r=await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:future(20),duration:20,topic:'Maths algebra'});assert.equal(r.status,201);
 const payload={providerEventId:randomUUID(),amountPaise:30000,currency:'INR'};
 assert.equal((await parent.call(`/dev/reservations/${r.data.id}/capture`,payload)).status,409);
 const scope=await teacher.call(`/reservations/${r.data.id}/scope`,{expectedVersion:1});assert.equal(scope.status,201);
 assert.equal((await parent.call(`/dev/reservations/${r.data.id}/capture`,{...payload,amountPaise:1})).status,409);
 const captured=await parent.call(`/dev/reservations/${r.data.id}/capture`,payload);assert.equal(captured.status,201,JSON.stringify(captured.data));assert.equal(captured.data.reservation.status,'CONFIRMED');
 const lesson=await db.lesson.findUniqueOrThrow({where:{reservationId:r.data.id}}),payable=await db.teacherPayable.findUniqueOrThrow({where:{lessonId:lesson.id}});assert.equal(lesson.childId,ids.child);assert.equal(lesson.kind,'REVISION');assert.equal(payable.status,'HELD_SERVICE');assert.equal(payable.amountPaise,captured.data.payment.amountPaise);
 const duplicate=await parent.call(`/dev/reservations/${r.data.id}/capture`,payload);assert.equal(duplicate.data.payment.id,captured.data.payment.id);assert.equal(await db.payment.count({where:{reservationId:r.data.id}}),1);
 const cancel=await parent.call(`/reservations/${r.data.id}/cancel`,{expectedVersion:captured.data.reservation.version,reason:'Guardian cancelled'});assert.equal(cancel.status,201);
 const refund=await db.refund.findUniqueOrThrow({where:{paymentId:captured.data.payment.id}});assert.equal(refund.amountPaise,30000);assert.equal(refund.status,'PENDING');
 assert.equal((await db.lesson.findUniqueOrThrow({where:{id:lesson.id}})).status,'CANCELLED');assert.equal((await db.teacherPayable.findUniqueOrThrow({where:{id:payable.id}})).status,'REFUND_PENDING');
});
test('late capture on an expired, lost slot cannot displace the new booking',async()=>{const start=future(22);const r=await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:start,duration:20,topic:'Equations'});assert.equal(r.status,201);await teacher.call(`/reservations/${r.data.id}/scope`,{expectedVersion:1});await db.reservation.update({where:{id:r.data.id},data:{status:'EXPIRED',expiresAt:new Date(0)}});const newer=await other.call('/revision/holds',{teacherId:ids.teacher,startsAt:start,duration:20,topic:'Fractions'});assert.equal(newer.status,201);const paid=await parent.call(`/dev/reservations/${r.data.id}/capture`,{providerEventId:randomUUID(),amountPaise:30000,currency:'INR'});assert.equal(paid.status,201);assert.equal(paid.data.reservation.status,'PAID_UNALLOCATED');assert.equal((await db.reservation.findUniqueOrThrow({where:{id:newer.data.id}})).status,'HOLD');assert.equal(await db.refund.count({where:{paymentId:paid.data.payment.id}}),1);});
test('stale attendance cannot overwrite a correction; disputes are excluded from verified totals',async()=>{const id='60000000-0000-4000-8000-000000000001';const before=(await parent.call('/dashboard')).data.metrics.classesTaken;const r=await teacher.call(`/lessons/${id}/attendance`,{expectedVersion:1,attendance:'PRESENT',reason:'Confirmed'});assert.equal(r.status,201);assert.equal((await teacher.call(`/lessons/${id}/attendance`,{expectedVersion:1,attendance:'ABSENT',reason:'Stale'})).status,409);assert.equal((await other.call(`/lessons/${id}/disputes`,{reason:'Wrong family'})).status,404);assert.equal((await parent.call(`/lessons/${id}/disputes`,{reason:'This record is incorrect'})).status,201);assert.equal((await parent.call('/dashboard')).data.metrics.classesTaken,before-1);});
test('private notes require an explicit named active teacher; revocation removes access',async()=>{const n=await parent.call('/notes',{childId:ids.child,text:'Private text <script>alert(1)</script>'});assert.equal(n.status,201);assert.equal((await teacher.call('/notes')).data.items.length,0);assert.equal((await other.call(`/notes/${n.data.id}/shares`,{teacherId:ids.teacher,expectedVersion:1})).status,404);assert.equal((await parent.call(`/notes/${n.data.id}/shares`,{teacherId:ids.teacher,expectedVersion:1})).status,201);assert.equal((await teacher.call('/notes')).data.items.length,1);assert.equal((await parent.call(`/notes/${n.data.id}/shares`,{teacherId:null,expectedVersion:2})).status,201);assert.equal((await teacher.call('/notes')).data.items.length,0);});
test('masked consultation calls are disabled for the MVP',async()=>{assert.equal((await parent.call('/pro/calls',{placementId:ids.placement,startsAt:future(10,12)})).status,503);await db.featureFlag.update({where:{name:'proCalls'},data:{enabled:true}});});
test('free memberships and unrelated guardians cannot request Pro calls',async()=>{assert.equal((await other.call('/pro/calls',{placementId:ids.placement,startsAt:future(10,12)})).status,403);const r=await parent.call('/pro/calls',{placementId:randomUUID(),startsAt:future(10,12)});assert.equal(r.status,404);});
test('concurrent consultation acceptance cannot overspend; a failed connection releases allowance',async()=>{
 const calls=[];for(let i=0;i<5;i++){const at=new Date(future(11,12));at.setUTCMinutes(i*15);const r=await parent.call('/pro/calls',{placementId:ids.placement,startsAt:at.toISOString()});assert.equal(r.status,201);calls.push(r.data);}
 const results=await Promise.all(calls.map(c=>teacher.call(`/pro/calls/${c.id}/accept`,{expectedVersion:1})));assert.equal(results.filter(x=>x.status===201).length,4,JSON.stringify(results));assert.equal(results.filter(x=>x.status===409).length,1);
 const m=await db.membership.findUniqueOrThrow({where:{guardianId:ids.guardian}});assert.equal(m.reserved,4);
 const accepted=results.find(x=>x.status===201)!;const key=randomUUID();const failed=await teacher.call(`/dev/pro/calls/${accepted.data.id}/outcome`,{outcome:'FAILED'},{key});assert.equal(failed.status,201);await teacher.call(`/dev/pro/calls/${accepted.data.id}/outcome`,{outcome:'FAILED'},{key});const updated=await db.membership.findUniqueOrThrow({where:{guardianId:ids.guardian}});assert.equal(updated.reserved,3);assert.equal(updated.used,0);
 await db.featureFlag.update({where:{name:'proCalls'},data:{enabled:false}});
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
test('valid sandbox email OTP creates only an unverified guardian, is single-use and stores hashed session credentials',async()=>{
 const client=new Client();assert.equal((await client.call('/auth/otp/request',{phone:'+919999999993'})).status,400);const email='otp3@example.test';const requested=await client.call('/auth/otp/request',{email});assert.equal(requested.status,201);
 const storedOtp=await db.otp.findUniqueOrThrow({where:{address:email}});assert.equal(storedOtp.hash,otpDigest(email,requested.data.developmentCode));assert.notEqual(storedOtp.hash,createHash('sha256').update(requested.data.developmentCode).digest('hex'));
 const body={email,code:requested.data.developmentCode,name:'Synthetic OTP guardian'};
 const verified=await client.call('/auth/otp/verify',body);assert.equal(verified.status,201);assert.equal(verified.data.account.role,'GUARDIAN');assert.equal(verified.data.account.verified,false);
 for(const cookie of verified.headers.getSetCookie()){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Lax/i);}
 const access=client.cookies.split('bcs_access=')[1].split(';')[0];const persisted=await db.session.findUniqueOrThrow({where:{accessHash:createHash('sha256').update(access).digest('hex')}});assert.notEqual(persisted.accessHash,access);
 assert.equal((await client.call('/auth/otp/verify',body)).status,401);assert.equal((await client.call('/consents',{purpose:'tuition-and-learning-records',policyVersion:'development-v1',accepted:true})).status,403);assert.equal((await client.call('/requests',intake())).status,403);
});
test('OTP expiry and wrong-code attempt limits fail; OTP cannot assign a role',async()=>{const c=new Client(),email='otp1@example.test';const otp=await c.call('/auth/otp/request',{email});assert.equal(otp.status,201);await db.otp.update({where:{address:email},data:{expiresAt:new Date(0)}});assert.equal((await c.call('/auth/otp/verify',{email,code:otp.data.developmentCode,name:'Synthetic'})).status,401);const email2='otp2@example.test';const valid=await c.call('/auth/otp/request',{email:email2});for(let i=0;i<5;i++)assert.equal((await c.call('/auth/otp/verify',{email:email2,code:valid.data.developmentCode==='000000'?'111111':'000000',name:'Synthetic'})).status,401);assert.equal((await c.call('/auth/otp/verify',{email:email2,code:valid.data.developmentCode,name:'Synthetic'})).status,401);});
test('private note edits are owned, versioned and retry-safe; new text revokes sharing and teacher reads respect privacy pauses',async()=>{
 const created=await parent.call('/notes',{childId:ids.child,text:'Synthetic learning preference'});assert.equal(created.status,201);const id=created.data.id;
 const share=await parent.call(`/notes/${id}/shares`,{expectedVersion:1,teacherId:ids.teacher});assert.equal(share.status,201);await teacher.call(`/notes/${id}/acknowledgements`,{expectedVersion:2});
 const read=await parent.call('/notes'),valid=operationValidator('/notes','get','200');assert(valid(read.data),JSON.stringify(valid.errors));const owned=read.data.items.find((n:any)=>n.id===id);assert.equal(owned.learner.alias,'Aarav');assert.equal(owned.sharedTeacher.name,'Ananya Sharma');assert.equal(owned.sharingActive,true);assert(!('guardianId' in owned));
 assert.equal((await other.call(`/notes/${id}/updates`,{expectedVersion:3,text:'Wrong owner'})).status,404);assert.equal((await teacher.call(`/notes/${id}/updates`,{expectedVersion:3,text:'Wrong role'})).status,403);assert.equal((await parent.call(`/notes/${id}/updates`,{expectedVersion:2,text:'Stale edit'})).status,409);
 const key=randomUUID(),body={expectedVersion:3,text:'New private content'},edited=await parent.call(`/notes/${id}/updates`,body,{key});assert.equal(edited.status,201);assert.equal(edited.data.sharedTeacherId,null);assert.equal(edited.data.acknowledgedAt,null);assert.equal(edited.data.version,4);assert.equal((await parent.call(`/notes/${id}/updates`,body,{key})).data.version,4);assert.equal((await teacher.call('/notes')).data.items.some((n:any)=>n.id===id),false);assert.equal((await teacher.call(`/notes/${id}/acknowledgements`,{expectedVersion:4})).status,404);
 await parent.call(`/notes/${id}/shares`,{expectedVersion:4,teacherId:ids.teacher});
 const pause=await db.privacyRequest.create({data:{accountId:ids.guardian,kind:'DELETION',scope:'CHILD',resourceId:ids.child,reason:'Synthetic privacy pause'}});try{assert.equal((await teacher.call('/notes')).data.items.some((n:any)=>n.id===id),false);assert.equal((await parent.call('/notes')).data.items.find((n:any)=>n.id===id).sharingActive,false);assert.equal((await parent.call(`/notes/${id}/updates`,{expectedVersion:5,text:'Blocked processing'})).status,403);}finally{await db.privacyRequest.delete({where:{id:pause.id}});}
 assert(await db.audit.findFirst({where:{aggregateId:id,action:'NOTE_UPDATED_PRIVATE'}}));
});
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
 assert.equal((await operator.call(`/admin/cases/${disputed.data.supportCaseId}/triage`,{expectedVersion:1,status:'RESOLVED',reason:'Skip outcome review'})).data.code,'DISPUTE_PENDING');
 assert.equal((await parent.call('/placements',{requestId,teacherId:ids.teacher})).status,409);
 const review={expectedVersion:disputed.data.version,resolution:'NOT_COMPLETED',reason:'Reviewed both statements; demo did not take place'};
 assert.equal((await teacher.call(`/admin/demos/${demo.id}/reviews`,review)).status,403);
 assert.equal((await operator.call(`/admin/demos/${demo.id}/reviews`,{...review,expectedVersion:1})).status,409);
 const reviewed=await operator.call(`/admin/demos/${demo.id}/reviews`,review);assert.equal(reviewed.status,201,JSON.stringify(reviewed.data));assert.equal(reviewed.data.status,'NOT_COMPLETED');
 assert.equal((await db.supportCase.findUniqueOrThrow({where:{id:disputed.data.supportCaseId}})).status,'RESOLVED');const closedCase=await db.supportCase.findUniqueOrThrow({where:{id:disputed.data.supportCaseId}});assert.equal(closedCase.version,2);assert.equal(closedCase.resolution,review.reason);assert.equal(await db.caseUpdate.count({where:{caseId:closedCase.id,message:review.reason,internal:false}}),1);assert.equal((await operator.call(`/admin/cases/${closedCase.id}/triage`,{expectedVersion:1,status:'OPEN',reason:'Stale case view'})).status,409);
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

function runEvidenceWorker(available=true,extra:Record<string,string>={}) {
 const env={...process.env,...local,DATABASE_URL:base.href,APP_MODE:'development',NODE_ENV:'test',EMAIL_DELIVERY_MODE:'sandbox',EVIDENCE_DIRECTORY:evidenceDir,CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:available?'3310':'3311',WORKER_ONCE:'1',...extra};
 const result=spawnSync(process.execPath,['--import','tsx','apps/worker/src/main.ts'],{env,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
}
test('concurrent distinct checkout keys reuse one order per resource and preserve price review',async()=>{
 const r=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:new Date(future(59)),endsAt:new Date(new Date(future(59)).getTime()+1200000),status:'HOLD',scopeAccepted:true,expiresAt:new Date(Date.now()+600000),amountPaise:30000}});
 await db.featureFlag.update({where:{name:'checkout'},data:{enabled:true}});
 const body={kind:'REVISION',resourceId:r.id,expectedVersion:1};
 const results=await Promise.all([parent.call('/checkout-orders',body,{key:randomUUID()}),parent.call('/checkout-orders',body,{key:randomUUID()})]);
 assert.deepEqual(results.map(x=>x.status),[201,201]);assert.equal(results[0].data.id,results[1].data.id);assert.equal(await db.checkoutOrder.count({where:{resourceId:r.id}}),1);
 const later=await parent.call('/checkout-orders',body,{key:randomUUID()});assert.equal(later.data.id,results[0].data.id);
 await db.checkoutOrder.update({where:{id:later.data.id},data:{status:'FAILED'}});assert.equal((await parent.call('/checkout-orders',body,{key:randomUUID()})).data.id,later.data.id);
 await db.reservation.update({where:{id:r.id},data:{amountPaise:40000}});assert.equal((await parent.call('/checkout-orders',body,{key:randomUUID()})).status,409);assert.equal(await db.checkoutOrder.count({where:{resourceId:r.id}}),1);
 await db.featureFlag.update({where:{name:'checkout'},data:{enabled:false}});
});
test('durable checkout claims prevent duplicate provider calls after concurrency, failure and a crash',async()=>{
 let fixture=0;const create=async()=>{const start=new Date(Date.now()+61*86400000+(fixture++)*3600000),r=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:start,endsAt:new Date(start.getTime()+1200000),status:'HOLD',scopeAccepted:true,expiresAt:new Date(Date.now()+600000),amountPaise:30000}});return db.checkoutOrder.create({data:{accountId:ids.guardian,kind:'REVISION',resourceId:r.id,amountPaise:30000,providerMode:'SANDBOX'}});};
 const order=await create();let calls=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve),provider=async(id:string,amount:number)=>{calls++;await barrier;return {id:'order_claim_'+id,amount,currency:'INR' as const,status:'created',receipt:id};};
 const first=completeCheckout(db,order.id,provider);for(let i=0;i<100;i++){if(await db.checkoutAttempt.findUnique({where:{orderId:order.id}}))break;await new Promise(r=>setTimeout(r,10));}
 const second=await completeCheckout(db,order.id,provider);assert.equal(second.status,'CREATING');release();assert.equal((await first).status,'CREATED');assert.equal(calls,1);assert.equal(await db.checkoutAttempt.count({where:{orderId:order.id}}),1);
 const failed=await create();let failures=0;const unavailable=async()=>{failures++;throw new Error('Synthetic timeout after unknown provider outcome');};await assert.rejects(completeCheckout(db,failed.id,unavailable));assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:failed.id}})).status,'FAILED');assert.equal((await completeCheckout(db,failed.id,unavailable)).status,'FAILED');assert.equal(failures,1);
 const interrupted=await create();await db.checkoutAttempt.create({data:{orderId:interrupted.id}});assert.equal((await completeCheckout(db,interrupted.id,unavailable)).status,'CREATING');assert.equal(failures,1);assert.equal(await db.checkoutOrder.count({where:{resourceId:interrupted.resourceId}}),1);
});
test('paused checkout removes the public gateway key from an existing live order',async()=>{
 const r=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:new Date(future(58,8)),endsAt:new Date(new Date(future(58,8)).getTime()+1200000),status:'HOLD',expiresAt:new Date(Date.now()+600000),scopeAccepted:true,amountPaise:30000}});
 const order=await db.checkoutOrder.create({data:{accountId:ids.guardian,kind:'REVISION',resourceId:r.id,amountPaise:30000,providerMode:'LIVE',status:'CREATED',providerOrderId:'order_gate_'+randomUUID()}}),url=`/checkout-orders?kind=REVISION&resourceId=${r.id}`;
 await db.featureFlag.update({where:{name:'checkout'},data:{enabled:true}});assert.equal((await parent.call(url)).data.publicKeyId,'rzp_test_synthetic_public');await db.featureFlag.update({where:{name:'checkout'},data:{enabled:false}});const paused=await parent.call(url);assert.equal(paused.data.order.id,order.id);assert.equal(paused.data.publicKeyId,null);
});
test('withdrawn consent blocks revision checkout and a saved creating replay before provider I/O',async()=>{
 const r=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:new Date(future(27)),endsAt:new Date(new Date(future(27)).getTime()+1200000),status:'HOLD',expiresAt:new Date(Date.now()+600000),scopeAccepted:true,amountPaise:30000}}),body={kind:'REVISION',resourceId:r.id,expectedVersion:1};
 await db.featureFlag.update({where:{name:'checkout'},data:{enabled:true}});await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:new Date()}});assert.equal((await parent.call('/checkout-orders',body)).status,403);assert.equal(await db.checkoutOrder.count({where:{resourceId:r.id}}),0);
 const order=await db.checkoutOrder.create({data:{accountId:ids.guardian,kind:'REVISION',resourceId:r.id,amountPaise:30000,providerMode:'SANDBOX'}}),key=randomUUID();await db.idempotency.create({data:{accountId:ids.guardian,operation:'checkout.create:/api/v1/checkout-orders',key,hash:createHash('sha256').update(JSON.stringify(body)).digest('hex'),result:JSON.parse(JSON.stringify(order))}});assert.equal((await parent.call('/checkout-orders',body,{key})).status,403);assert.equal(await db.checkoutAttempt.count({where:{orderId:order.id}}),0);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:order.id}})).status,'CREATING');await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:null}});await db.featureFlag.update({where:{name:'checkout'},data:{enabled:false}});
});
test('owned checkout recovery survives reload, prefers captured orders and never exposes a secret',async()=>{
 const r=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:new Date(future(58)),endsAt:new Date(new Date(future(58)).getTime()+1200000),status:'HOLD',scopeAccepted:true,expiresAt:new Date(Date.now()+600000),amountPaise:30000}});
 const path=`/checkout-orders?kind=REVISION&resourceId=${r.id}`;
 assert.equal((await parent.call(path)).data.order,null);
 assert.equal((await other.call(path)).status,404);assert.equal((await teacher.call(path)).status,403);assert.equal((await student.call(path)).status,403);assert.equal((await new Client().call(path)).status,401);
 const order=await db.checkoutOrder.create({data:{accountId:ids.guardian,kind:'REVISION',resourceId:r.id,amountPaise:30000,providerMode:'SANDBOX',status:'CREATED',providerOrderId:'order_synthetic_recovery'}});
 assert.equal((await parent.call(path)).data.order.id,order.id);
 const failed=await db.checkoutOrder.create({data:{accountId:ids.guardian,kind:'REVISION',resourceId:r.id,amountPaise:30000,providerMode:'SANDBOX',status:'FAILED',createdAt:new Date(Date.now()+1000)}});
 assert.equal((await parent.call(path)).data.order.id,failed.id);
 await db.checkoutOrder.update({where:{id:order.id},data:{status:'PAID'}});
 const recovered=await parent.call(path);assert.equal(recovered.data.order.id,order.id);assert.equal(recovered.data.publicKeyId,null);assert(!JSON.stringify(recovered.data).includes('KEY_SECRET'));
 const valid=operationValidator('/checkout-orders','get','200');assert(valid(recovered.data),JSON.stringify(valid.errors));
 assert.equal((await parent.call(`/checkout-orders?kind=REVISION&resourceId=${r.id}&accountId=${ids.otherGuardian}`)).status,400);
});
test('private meetings are delivered, ownership-scoped, time-gated and manually retryable',async()=>{
 const start=new Date(Date.now()+2*3600000),reservation=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'DEMO',startsAt:start,endsAt:new Date(start.getTime()+40*60000),status:'CONFIRMED'}});
 assert.deepEqual((await parent.call(`/reservations/${reservation.id}/meeting`)).data,{meeting:null});assert.equal((await other.call(`/reservations/${reservation.id}/meeting`)).status,404);
 const meeting=await db.meeting.create({data:{reservationId:reservation.id,providerMode:'SANDBOX'}});await db.outbox.create({data:{type:'meeting.create_requested',aggregateId:meeting.id,payload:{version:meeting.version}}});
 runEvidenceWorker(true,{MEETING_PROVIDER_MODE:'sandbox'});
 const ready=await db.meeting.findUniqueOrThrow({where:{id:meeting.id}});assert.equal(ready.status,'READY');assert.match(ready.joinUrl!,/^https:\/\/meet\.invalid\//);
 for(const client of [parent,teacher,student]){const result=await client.call(`/meetings/${meeting.id}`);assert.equal(result.status,200);assert.equal(result.data.joinUrl,null);assert.equal(result.data.canJoin,false);}
 assert.equal((await other.call(`/meetings/${meeting.id}`)).status,404);
 for(const client of [parent,teacher,student]){const found=await client.call(`/reservations/${reservation.id}/meeting`);assert.equal(found.status,200);assert.equal(found.data.meeting.id,meeting.id);assert.equal(found.data.meeting.joinUrl,null);assert.equal(found.data.meeting.providerMode,'SANDBOX');const valid=operationValidator('/reservations/{id}/meeting','get','200');assert(valid(found.data),JSON.stringify(valid.errors));}
 const joinStart=new Date(Date.now()+5*60000);await db.reservation.update({where:{id:reservation.id},data:{startsAt:joinStart,endsAt:new Date(joinStart.getTime()+40*60000)}});
 const viaBooking=await student.call(`/reservations/${reservation.id}/meeting`);assert.equal(viaBooking.data.meeting.canJoin,true);
 const visible=await student.call(`/meetings/${meeting.id}`);assert.equal(visible.status,200);assert.equal(visible.data.canJoin,true);assert.match(visible.data.joinUrl,/^https:\/\/meet\.invalid\//);

 const failedReservation=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:new Date(Date.now()+3*3600000),endsAt:new Date(Date.now()+3*3600000+20*60000),status:'CONFIRMED'}});
 const failing=await db.meeting.create({data:{reservationId:failedReservation.id,providerMode:'LIVE'}});
 for(let attempt=0;attempt<5;attempt++){if(attempt)await db.meeting.update({where:{id:failing.id},data:{retryAt:new Date(0)}});runEvidenceWorker(true,{MEETING_PROVIDER_MODE:'google-meet',GOOGLE_MEET_ACCESS_TOKEN:''});}
 const exhausted=await db.meeting.findUniqueOrThrow({where:{id:failing.id}});assert.equal(exhausted.status,'FAILED');assert.equal(exhausted.attempts,5);assert.equal(await db.supportCase.count({where:{category:'MEETING_DELIVERY',description:{contains:failing.id}}}),1);
 const retried=await operator.call(`/admin/meetings/${failing.id}/retries`,{expectedVersion:exhausted.version,reason:'Provider access restored'});assert.equal(retried.status,201,JSON.stringify(retried.data));assert.equal(retried.data.status,'PENDING');assert.equal(retried.data.attempts,0);
});
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
 await db.account.update({where:{id:account.id},data:{role:'REVIEWER'}});const selfReviewer=await login(account.id),selfReview=await selfReviewer.call(`/admin/teachers/${id}/checks`,{expectedVersion:revised.data.version,kind:'IDENTITY',evidenceId:upload.data.id,result:'PASSED',reason:'Self reviewer',validUntil});assert.equal(selfReview.status,403);assert.equal(selfReview.data.code,'SELF_REVIEW');
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
 const preview=await operator.call(`/admin/requests/${request.data.id}/recommendations`);assert.equal(preview.status,200);assert.equal(preview.data.runId,run.data.runId);assert(preview.data.items.some((c:any)=>c.id===candidate.id&&c.eligibleNow&&c.teacherName==='Ananya Sharma'));assert.equal((await parent.call(`/admin/requests/${request.data.id}/recommendations`)).status,403);const pv=operationValidator('/admin/requests/{id}/recommendations','get','200');assert(pv(preview.data),JSON.stringify(pv.errors));for(const c of preview.data.items)for(const field of ['accountId','phone','email','guardianId','childId'])assert.equal(field in c,false);const regionalAccount=await db.account.create({data:{phone:'+910000009996',name:'Synthetic matching regional operator',role:'OPERATOR',region:'Delhi',verified:true}}),regionalClient=await login(regionalAccount.id);assert.equal((await regionalClient.call(`/admin/requests/${request.data.id}/recommendations`)).status,404);
 const stored=await db.recommendationRun.findUniqueOrThrow({where:{id:run.data.runId}});assert.equal((stored.requestFeatures as any).grade,8);assert.equal('alias' in (stored.requestFeatures as any),false);await assert.rejects(db.recommendationRun.update({where:{id:stored.id},data:{result:'FAKE'}}));
 const publish={expectedVersion:run.data.requestVersion,runId:run.data.runId,candidateIds:[candidate.id],reason:'Reviewed public shortlist'};assert.equal((await parent.call(`/admin/requests/${request.data.id}/presentations`,publish)).status,403);const second=run.data.items.find((c:any)=>c.id!==candidate.id);assert(second);let shown=await operator.call(`/admin/requests/${request.data.id}/presentations`,{...publish,candidateIds:[candidate.id,second.id]});assert.equal(shown.status,201);assert.equal((await parent.call(`/requests/${request.data.id}`)).data.candidates.length,2);shown=await operator.call(`/admin/requests/${request.data.id}/presentations`,publish);assert.equal(shown.status,201);const currentShown=(await parent.call(`/requests/${request.data.id}`)).data.candidates;assert.equal(currentShown.length,1);assert.equal(currentShown[0].id,candidate.id);assert.equal((await db.recommendation.findUniqueOrThrow({where:{id:second.id}})).presentedAt,null);
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
test('Razorpay checkout verifies raw webhooks, exact money, ownership, replay and final booking eligibility',async()=>{
 await db.featureFlag.update({where:{name:'checkout'},data:{enabled:true}});
 const invoice=await db.invoice.upsert({where:{placementId:ids.placement},create:{placementId:ids.placement,payerId:ids.teacherAccount,amountPaise:75000,policyVersion:'pilot-v1'},update:{status:'DUE',version:{increment:1}}});
 assert.equal((await parent.call('/checkout-orders',{kind:'INVOICE',resourceId:invoice.id,expectedVersion:invoice.version})).status,404);
 const key=randomUUID(),order=await teacher.call('/checkout-orders',{kind:'INVOICE',resourceId:invoice.id,expectedVersion:invoice.version},{key});assert.equal(order.status,201,JSON.stringify(order.data));assert.equal(order.data.provider,'RAZORPAY');assert.equal(order.data.providerMode,'SANDBOX');assert.equal(order.data.status,'CREATED');
 assert.equal((await teacher.call('/checkout-orders',{kind:'INVOICE',resourceId:invoice.id,expectedVersion:invoice.version},{key})).data.id,order.data.id);
 const webhook=async(eventId:string,providerOrderId:string,amount:number,signatureValid=true)=>{
  const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_'+eventId,order_id:providerOrderId,amount,currency:'INR',status:'captured'}}}}),signature=createHmac('sha256',['synthetic','webhook','key'].join('-')).update(raw).digest('hex');
  const response=await fetch('http://127.0.0.1:4100/api/v1/billing/webhooks/razorpay',{method:'POST',headers:{'Content-Type':'application/json','x-razorpay-event-id':eventId,'x-razorpay-signature':signatureValid?signature:'0'.repeat(64)},body:raw});return {status:response.status,data:await response.json()};
 };
 assert.equal((await webhook('evt_bad_signature',order.data.providerOrderId,invoice.amountPaise,false)).status,401);
 const captured=await webhook('evt_invoice_paid',order.data.providerOrderId,invoice.amountPaise);assert.equal(captured.status,201);assert.equal(captured.data.status,'PAID');
 assert.equal((await webhook('evt_invoice_paid',order.data.providerOrderId,invoice.amountPaise)).data.status,'PAID');assert.equal((await db.invoice.findUniqueOrThrow({where:{id:invoice.id}})).status,'PAID');assert.equal(await db.payment.count({where:{invoiceId:invoice.id}}),1);
 const resumed=await teacher.call(`/checkout-orders?kind=INVOICE&resourceId=${invoice.id}`);assert.equal(resumed.data.order.id,order.data.id);assert.equal(resumed.data.order.status,'PAID');assert.equal((await parent.call(`/checkout-orders?kind=INVOICE&resourceId=${invoice.id}`)).status,404);
 assert.equal((await webhook('evt_invoice_duplicate',order.data.providerOrderId,invoice.amountPaise)).data.status,'ALREADY_PAID');assert.equal(await db.payment.count({where:{invoiceId:invoice.id}}),1);
 const reconciliation=await operator.call(`/admin/checkout-orders/${order.data.id}/reconciliations`,{expectedVersion:3,reason:'Verify synthetic order'});assert.equal(reconciliation.status,201);assert.equal(reconciliation.data.status,'LOCAL_SANDBOX_ONLY');
 const hold=await parent.call('/revision/holds',{teacherId:ids.teacher,startsAt:future(54),duration:20,topic:'Razorpay revision'});assert.equal(hold.status,201);const scoped=await teacher.call(`/reservations/${hold.data.id}/scope`,{expectedVersion:1});assert.equal(scoped.status,201);
 const revisionOrder=await parent.call('/checkout-orders',{kind:'REVISION',resourceId:hold.data.id,expectedVersion:scoped.data.version});assert.equal(revisionOrder.status,201);
 const concurrent=await Promise.all([webhook('evt_revision_paid_a',revisionOrder.data.providerOrderId,hold.data.amountPaise),webhook('evt_revision_paid_b',revisionOrder.data.providerOrderId,hold.data.amountPaise)]);assert.deepEqual(concurrent.map(x=>x.data.status).sort(),['ALREADY_PAID','PAID']);assert.equal((await db.reservation.findUniqueOrThrow({where:{id:hold.data.id}})).status,'CONFIRMED');assert.equal(await db.payment.count({where:{reservationId:hold.data.id}}),1);
 const revisionLesson=await db.lesson.findUniqueOrThrow({where:{reservationId:hold.data.id}}),revisionPayable=await db.teacherPayable.findUniqueOrThrow({where:{lessonId:revisionLesson.id}});assert.equal(revisionPayable.status,'HELD_SERVICE');
 await db.lesson.update({where:{id:revisionLesson.id},data:{startsAt:new Date(Date.now()-3600000),endsAt:new Date(Date.now()-1800000)}});
 assert.equal((await teacher.call(`/lessons/${revisionLesson.id}/attendance`,{expectedVersion:1,attendance:'PRESENT',reason:'Delivered paid revision'})).status,400);
 const completed=await teacher.call(`/lessons/${revisionLesson.id}/attendance`,{expectedVersion:1,attendance:'PRESENT',reason:'Delivered paid revision',recap:'Practised linear equations; revisit sign changes before the next lesson.'});assert.equal(completed.status,201,JSON.stringify(completed.data));assert.match(completed.data.recap,/linear equations/);
 const studentConfirmed=await student.call(`/lessons/${revisionLesson.id}/confirmations`,{expectedVersion:2,action:'CONFIRMED',reason:'Attended'});assert.equal(studentConfirmed.status,201);assert.equal((await db.teacherPayable.findUniqueOrThrow({where:{id:revisionPayable.id}})).status,'HELD_CONFIRMATION');
 const guardianConfirmed=await parent.call(`/lessons/${revisionLesson.id}/confirmations`,{expectedVersion:2,action:'CONFIRMED',reason:'Service confirmed'});assert.equal(guardianConfirmed.status,201);assert.equal((await db.teacherPayable.findUniqueOrThrow({where:{id:revisionPayable.id}})).status,'ELIGIBLE');
 const ownPayables=await teacher.call('/payables');assert.equal(ownPayables.status,200);assert(ownPayables.data.items.some((item:any)=>item.id===revisionPayable.id));assert.equal((await parent.call('/payables')).status,403);
 await assert.rejects(db.teacherPayable.update({where:{id:revisionPayable.id},data:{amountPaise:hold.data.amountPaise+1}}));
 const absence=await parent.call('/revision/holds',{childId:ids.child,teacherId:ids.teacher,startsAt:future(56),duration:20,topic:'Absent revision evidence'});assert.equal(absence.status,201);await teacher.call(`/reservations/${absence.data.id}/scope`,{expectedVersion:1});const absenceCapture=await parent.call(`/dev/reservations/${absence.data.id}/capture`,{providerEventId:randomUUID(),amountPaise:absence.data.amountPaise,currency:'INR'});assert.equal(absenceCapture.status,201);const absentLesson=await db.lesson.findUniqueOrThrow({where:{reservationId:absence.data.id}});await db.lesson.update({where:{id:absentLesson.id},data:{startsAt:new Date(Date.now()-3600000),endsAt:new Date(Date.now()-2400000)}});assert.equal((await teacher.call(`/lessons/${absentLesson.id}/attendance`,{expectedVersion:1,attendance:'ABSENT',reason:'No learner attendance'})).status,201);assert.equal((await parent.call(`/lessons/${absentLesson.id}/confirmations`,{expectedVersion:2,action:'CONFIRMED',reason:'Absence record is accurate'})).status,201);const absentPayable=await db.teacherPayable.findUniqueOrThrow({where:{lessonId:absentLesson.id}});assert.equal(absentPayable.status,'REVIEW_REQUIRED');assert.equal(absentPayable.eligibleAt,null);await assert.rejects(db.teacherPayable.update({where:{id:absentPayable.id},data:{status:'ELIGIBLE'}}));assert.equal((await parent.call(`/lessons/${absentLesson.id}/feedback`,{expectedVersion:2,rating:5,comment:'Absent lessons do not qualify for feedback'})).status,409);
 const withdrawn=await parent.call('/revision/holds',{childId:ids.child,teacherId:ids.teacher,startsAt:future(55),duration:20,topic:'Consent capture boundary'});assert.equal(withdrawn.status,201);const withdrawnScope=await teacher.call(`/reservations/${withdrawn.data.id}/scope`,{expectedVersion:1});assert.equal(withdrawnScope.status,201);const withdrawnOrder=await parent.call('/checkout-orders',{kind:'REVISION',resourceId:withdrawn.data.id,expectedVersion:withdrawnScope.data.version});assert.equal(withdrawnOrder.status,201);await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:new Date()}});
 const withdrawnCapture=await webhook('evt_withdrawn_consent',withdrawnOrder.data.providerOrderId,withdrawn.data.amountPaise);assert.equal(withdrawnCapture.status,201);assert.equal(withdrawnCapture.data.status,'PAID_UNALLOCATED');assert.equal(await db.lesson.count({where:{reservationId:withdrawn.data.id}}),0);const withdrawalPayment=await db.payment.findUniqueOrThrow({where:{reservationId:withdrawn.data.id}});assert.equal(await db.refund.count({where:{paymentId:withdrawalPayment.id}}),1);await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:null}});
 const mismatchInvoice=await db.invoice.create({data:{placementId:(await db.placement.create({data:{guardianId:ids.otherGuardian,teacherId:ids.teacher,childId:ids.otherChild,requestId:(await db.tuitionRequest.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,subject:'Maths',mode:'ONLINE',language:'English',locality:'Raipur',budgetPaise:300000,schedule:'Synthetic'}})).id,monthlyPaise:300000}})).id,payerId:ids.teacherAccount,amountPaise:50000,policyVersion:'pilot-v1'}});
 const mismatchOrder=await teacher.call('/checkout-orders',{kind:'INVOICE',resourceId:mismatchInvoice.id,expectedVersion:1});assert.equal(mismatchOrder.status,201);assert.equal((await webhook('evt_amount_mismatch',mismatchOrder.data.providerOrderId,49999)).data.status,'AMOUNT_MISMATCH');assert.equal(await db.payment.count({where:{invoiceId:mismatchInvoice.id}}),0);assert(await db.supportCase.findFirst({where:{category:'PAYMENT',description:{contains:mismatchOrder.data.id}}}));
 await assert.rejects(db.checkoutOrder.create({data:{accountId:ids.otherGuardian,kind:'INVOICE',resourceId:invoice.id,amountPaise:invoice.amountPaise,providerMode:'SANDBOX'}}));
 const validate=operationValidator('/checkout-orders','post','201');assert(validate(order.data),JSON.stringify(validate.errors));await db.featureFlag.update({where:{name:'checkout'},data:{enabled:false}});
});
test('mutually accepted recurring schedules materialize real shared reservations and preserve commitments on failed reschedule',async()=>{
 const p=await db.placement.findUniqueOrThrow({where:{id:ids.placement}}),from=new Date(future(3)),weekday=new Date(from.getTime()+330*60000).getUTCDay();
 const body={expectedVersion:p.version,timezone:'Asia/Kolkata',slots:[{weekday,startMinute:780,endMinute:840}],validFrom:from.toISOString().slice(0,10),validUntil:future(90).slice(0,10),reason:'Agreed weekly tuition'};
 assert.equal((await other.call(`/placements/${p.id}/schedules`,body)).status,404);
 assert.equal((await parent.call(`/placements/${p.id}/schedules`,{...body,slots:[{weekday,startMinute:780,endMinute:800},{weekday,startMinute:790,endMinute:820}]})).status,400);
 const proposed=await parent.call(`/placements/${p.id}/schedules`,body);assert.equal(proposed.status,201,JSON.stringify(proposed.data));
 assert.equal(await db.lesson.count({where:{recurringScheduleId:proposed.data.id}}),0);
 const a=await parent.call(`/recurring-schedules/${proposed.data.id}/acceptances`,{expectedVersion:1});assert.equal(a.status,201);
 assert.equal((await teacher.call(`/recurring-schedules/${proposed.data.id}/acceptances`,{expectedVersion:1})).status,409);
 const key=randomUUID(),accepted=await teacher.call(`/recurring-schedules/${proposed.data.id}/acceptances`,{expectedVersion:2},{key});assert.equal(accepted.status,201,JSON.stringify(accepted.data));assert.equal(accepted.data.status,'ACCEPTED');
 assert.equal((await teacher.call(`/recurring-schedules/${proposed.data.id}/acceptances`,{expectedVersion:2},{key})).data.id,accepted.data.id);
 const lessons=await db.lesson.findMany({where:{recurringScheduleId:accepted.data.id},orderBy:{startsAt:'asc'}});assert(lessons.length>=7);assert(lessons.every(l=>l.reservationId&&l.endsAt.getTime()<=Date.now()+60*86400000));
 assert.equal((await other.call('/revision/holds',{teacherId:p.teacherId,startsAt:lessons[0].startsAt.toISOString(),duration:20,topic:'Colliding revision'})).status,409);
 const extended=await parent.call(`/recurring-schedules/${accepted.data.id}/extensions`,{expectedVersion:3});assert.equal(extended.status,201);assert.equal(extended.data.created,0);assert.equal(await db.lesson.count({where:{recurringScheduleId:accepted.data.id}}),lessons.length);
 const current=await db.placement.findUniqueOrThrow({where:{id:p.id}}),proposal=await parent.call(`/placements/${p.id}/schedules`,{...body,expectedVersion:current.version,slots:[{weekday,startMinute:840,endMinute:900}],reason:'Explicit agreed future reschedule'});assert.equal(proposal.status,201);
 await parent.call(`/recurring-schedules/${proposal.data.id}/acceptances`,{expectedVersion:1});
 const blocking=await db.reservation.create({data:{teacherId:p.teacherId,guardianId:ids.otherGuardian,kind:'DEMO',startsAt:new Date(lessons[0].startsAt.getTime()+3600000),endsAt:new Date(lessons[0].endsAt.getTime()+3600000),status:'CONFIRMED'}});
 assert.equal((await teacher.call(`/recurring-schedules/${proposal.data.id}/acceptances`,{expectedVersion:2})).status,409);
 assert.equal((await db.recurringSchedule.findUniqueOrThrow({where:{id:accepted.data.id}})).status,'ACCEPTED');assert.equal((await db.reservation.findUniqueOrThrow({where:{id:lessons[0].reservationId!}})).status,'CONFIRMED');
 await db.reservation.update({where:{id:blocking.id},data:{status:'CANCELLED'}});
 const changed=await teacher.call(`/recurring-schedules/${proposal.data.id}/acceptances`,{expectedVersion:2});assert.equal(changed.status,201);assert.equal((await db.lesson.findUniqueOrThrow({where:{id:lessons[0].id}})).status,'CANCELLED');
 const validate=operationValidator('/placements/{id}/schedules','post','201');assert(validate(changed.data),JSON.stringify(validate.errors));
 const {materialize}=await import('@bcs/scheduling');
 const schedule=await db.recurringSchedule.findUniqueOrThrow({where:{id:changed.data.id}}),nextNow=new Date(Date.now()+8*86400000);
 const extension=await db.$transaction(tx=>materialize(tx,schedule,nextNow));assert(extension.created>0);
 await db.recurringSchedule.update({where:{id:schedule.id},data:{materializedUntil:new Date(0)}});
 runEvidenceWorker(true);
 assert(await db.audit.findFirst({where:{aggregateId:schedule.id,action:'RECURRING_HORIZON_EXTENDED_SYSTEM'}}));
 const teacherBefore=await db.teacher.findUniqueOrThrow({where:{id:p.teacherId}});
 await db.teacher.update({where:{id:p.teacherId},data:{status:'SUSPENDED'}});await db.recurringSchedule.update({where:{id:schedule.id},data:{materializedUntil:new Date(0)}});
 runEvidenceWorker(true);
 assert(await db.supportCase.findFirst({where:{category:'SCHEDULE_EXTENSION',description:{contains:schedule.id}}}));
 assert((await db.recurringSchedule.findUniqueOrThrow({where:{id:schedule.id}})).extensionRetryAt);
 await db.teacher.update({where:{id:p.teacherId},data:{status:teacherBefore.status}});
 await assert.rejects(db.lesson.create({data:{recurringScheduleId:schedule.id,placementId:p.id,childId:ids.otherChild,teacherId:p.teacherId,kind:'RECURRING',subject:'Maths',startsAt:new Date(future(55)),endsAt:new Date(future(55,7))}}));
});
test('role-scoped learning records support family confirmation, private feedback and regional dispute resolution',async()=>{
 const yesterday=new Date(Date.now()-86400000),pastEnd=new Date(yesterday.getTime()+3600000);
 const lesson=await db.lesson.create({data:{placementId:ids.placement,teacherId:ids.teacher,childId:ids.child,kind:'RECURRING',subject:'Maths',startsAt:yesterday,endsAt:pastEnd}});
 assert.equal((await other.call(`/lessons/${lesson.id}/confirmations`,{expectedVersion:1,action:'CONFIRMED',reason:'Wrong family'})).status,404);
 assert.equal((await parent.call(`/lessons/${lesson.id}/feedback`,{expectedVersion:1,rating:5,comment:'Too early'})).status,409);
 const marked=await teacher.call(`/lessons/${lesson.id}/attendance`,{expectedVersion:1,attendance:'PRESENT',reason:'Lesson completed'});assert.equal(marked.status,201);
 const from=new Date(Date.now()-2*86400000).toISOString(),to=new Date(Date.now()+86400000).toISOString(),query=`/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=50`;
 const family=await parent.call(query),familyLesson=family.data.items.find((x:any)=>x.id===lesson.id);assert.equal(family.status,200);assert(familyLesson);assert.equal(familyLesson.learner.alias,'Aarav');assert(!('guardianId' in familyLesson.learner));
 assert((await student.call(query)).data.items.some((x:any)=>x.id===lesson.id));assert.equal((await other.call(query)).data.items.some((x:any)=>x.id===lesson.id),false);assert((await teacher.call(query)).data.items.some((x:any)=>x.id===lesson.id&&x.teacher.id===ids.teacher));
 const key=randomUUID(),confirmed=await parent.call(`/lessons/${lesson.id}/confirmations`,{expectedVersion:2,action:'CONFIRMED',reason:'Attendance is correct'},{key});assert.equal(confirmed.status,201);assert.equal((await parent.call(`/lessons/${lesson.id}/confirmations`,{expectedVersion:2,action:'CONFIRMED',reason:'Attendance is correct'},{key})).data.id,confirmed.data.id);
 const feedbackKey=randomUUID(),feedback=await parent.call(`/lessons/${lesson.id}/feedback`,{expectedVersion:2,rating:5,comment:'Clear explanation'},{key:feedbackKey});assert.equal(feedback.status,201);assert.equal((await parent.call(`/lessons/${lesson.id}/feedback`,{expectedVersion:2,rating:5,comment:'Clear explanation'},{key:feedbackKey})).data.id,feedback.data.id);assert.equal(await db.lessonFeedback.count({where:{lessonId:lesson.id}}),1);
 const disputedLesson=await db.lesson.create({data:{placementId:ids.placement,teacherId:ids.teacher,childId:ids.child,kind:'RECURRING',subject:'Maths',startsAt:new Date(yesterday.getTime()-7200000),endsAt:new Date(yesterday.getTime()-3600000)}});
 await teacher.call(`/lessons/${disputedLesson.id}/attendance`,{expectedVersion:1,attendance:'ABSENT',reason:'Marked absent'});
 const disputed=await student.call(`/lessons/${disputedLesson.id}/confirmations`,{expectedVersion:2,action:'DISPUTED',reason:'I attended'});assert.equal(disputed.status,201);
 assert.equal((await operator.call(`/admin/lessons/${disputedLesson.id}/dispute-resolutions`,{expectedVersion:2,attendance:'PRESENT',reason:'Stale operator view'})).status,409);
 const linkedCase=await db.supportCase.findFirstOrThrow({where:{accountId:ids.student,category:'ATTENDANCE',description:{startsWith:`Lesson ${disputedLesson.id}:`}}});await db.supportCase.update({where:{id:linkedCase.id},data:{status:'IN_PROGRESS'}});assert.equal((await operator.call(`/admin/cases/${linkedCase.id}/triage`,{expectedVersion:1,status:'RESOLVED',reason:'Skip attendance review'})).data.code,'DISPUTE_PENDING');const foreignCase=await db.supportCase.create({data:{accountId:ids.otherGuardian,category:'ATTENDANCE',description:`Lesson ${disputedLesson.id}: unrelated owner`}});const queue=await operator.call('/admin/lessons/disputes?limit=50');assert.equal(queue.status,200);const entry=queue.data.items.find((l:any)=>l.id===disputedLesson.id);assert(entry);assert(entry.cases.some((c:any)=>c.id===linkedCase.id));assert(!entry.cases.some((c:any)=>c.id===foreignCase.id));assert.equal('feedback' in entry,false);const qv=operationValidator('/admin/lessons/disputes','get','200');assert(qv(queue.data),JSON.stringify(qv.errors));assert.equal((await parent.call('/admin/lessons/disputes')).status,403);
 const resolved=await operator.call(`/admin/lessons/${disputedLesson.id}/dispute-resolutions`,{expectedVersion:3,attendance:'PRESENT',reason:'Attendance evidence reviewed'});assert.equal(resolved.status,201);assert.equal(resolved.data.disputed,false);assert.equal(resolved.data.attendance,'PRESENT');const resolvedCase=await db.supportCase.findUniqueOrThrow({where:{id:linkedCase.id}});assert.equal(resolvedCase.status,'RESOLVED');assert.equal(resolvedCase.version,2);assert.equal(resolvedCase.resolution,'Attendance evidence reviewed');assert.equal((await db.supportCase.findUniqueOrThrow({where:{id:foreignCase.id}})).status,'OPEN');
 const validate=operationValidator('/lessons/{id}/confirmations','post','201');assert(validate(confirmed.data),JSON.stringify(validate.errors));
 await assert.rejects(db.lessonConfirmation.update({where:{id:confirmed.data.id},data:{reason:'Mutated'}}));
 await assert.rejects(db.lessonFeedback.create({data:{lessonId:lesson.id,guardianId:ids.otherGuardian,rating:1,comment:'Foreign'}}));
});
test('lesson history exposes only owned review state and role-scoped private feedback; stale or concurrent feedback cannot overwrite it',async()=>{
 const create=()=>db.lesson.create({data:{placementId:ids.placement,teacherId:ids.teacher,childId:ids.child,kind:'RECURRING',subject:'Maths',startsAt:new Date(Date.now()-3600000),endsAt:new Date(Date.now()-1800000),status:'COMPLETED',attendance:'PRESENT',recap:'Practised fractions. Next: mixed numbers.',recapSubmittedAt:new Date()}});
 const lesson=await create(),query=`/lessons?from=${encodeURIComponent(new Date(Date.now()-86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now()+86400000).toISOString())}&limit=50`,read=async(actor:typeof parent,id=lesson.id)=>{const response=await actor.call(query);assert.equal(response.status,200);const validate=operationValidator('/lessons','get','200');assert(validate(response.data),JSON.stringify(validate.errors));return response.data.items.find((x:any)=>x.id===id);};
 const initial=await read(parent);assert.equal(initial.myConfirmation,null);assert.equal(initial.feedbackEligible,false);assert.match(initial.recap,/fractions/);assert.equal(initial.feedback,null);
 assert.equal((await parent.call(`/lessons/${lesson.id}/confirmations`,{expectedVersion:1,action:'CONFIRMED',reason:'Attendance reviewed'})).status,201);
 const owned=await read(parent);assert.equal(owned.myConfirmation.action,'CONFIRMED');assert.equal(owned.myConfirmation.lessonVersion,1);assert(!('actorId' in owned.myConfirmation));assert.equal(owned.feedbackEligible,true);
 const body={expectedVersion:1,rating:4,comment:'Clear explanation; more practice next time.'};assert.equal((await student.call(`/lessons/${lesson.id}/feedback`,body)).status,403);assert.equal((await other.call(`/lessons/${lesson.id}/feedback`,body)).status,404);
 const results=await Promise.all([parent.call(`/lessons/${lesson.id}/feedback`,body),parent.call(`/lessons/${lesson.id}/feedback`,body)]);assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);assert.equal(await db.lessonFeedback.count({where:{lessonId:lesson.id}}),1);
 const saved=await read(parent),teacherView=await read(teacher),studentView=await read(student);assert.equal(saved.feedbackEligible,false);assert.equal(saved.feedback.rating,4);assert.equal(teacherView.feedback.comment,body.comment);assert.equal(teacherView.myConfirmation,null);assert.equal(teacherView.feedbackEligible,false);assert.equal(studentView.feedback,null);assert.equal(studentView.myConfirmation,null);assert(!('guardianId' in saved.feedback));assert.equal((await read(other)),undefined);
 const changed=await create();await parent.call(`/lessons/${changed.id}/confirmations`,{expectedVersion:1,action:'CONFIRMED',reason:'Original record'});await db.lesson.update({where:{id:changed.id},data:{version:{increment:1}}});assert.equal((await read(parent,changed.id)).feedbackEligible,false);assert.equal((await parent.call(`/lessons/${changed.id}/feedback`,body)).data.code,'CONFLICT');assert.equal((await parent.call(`/lessons/${changed.id}/feedback`,{...body,expectedVersion:2})).data.code,'CONFIRMATION_REQUIRED');
 const consent=await db.consent.findUniqueOrThrow({where:{guardianId:ids.guardian}});try{await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:new Date()}});assert.equal((await read(parent,changed.id)).feedbackEligible,false);assert.equal((await parent.call(`/lessons/${changed.id}/feedback`,{...body,expectedVersion:2})).status,403);}finally{await db.consent.update({where:{guardianId:ids.guardian},data:{withdrawnAt:consent.withdrawnAt}});}
});

test('onboarding drafts resume safely and atomically complete once without duplicate child/request records',async()=>{
 assert.equal((await unverified.call('/onboarding/parent')).data.state,'VERIFICATION_PENDING');
 assert.equal((await unverified.call('/onboarding/parent/drafts',{expectedVersion:0,draft:{alias:'Premature child'}})).status,403);
 const safe=await unverified.call('/onboarding/parent/drafts',{expectedVersion:0,draft:{subject:'Maths'}});assert.equal(safe.status,201);
 assert.equal((await parent.call('/onboarding/parent/drafts',{expectedVersion:0,draft:{role:'ADMIN'}})).status,400);
 const children=await db.child.count({where:{guardianId:ids.guardian}}),requests=await db.tuitionRequest.count({where:{guardianId:ids.guardian}});
 const draft=intake({childId:ids.child,discoveryMethod:'ASSISTED'}),key=randomUUID();
 const saved=await parent.call('/onboarding/parent/drafts',{expectedVersion:0,draft},{key});assert.equal(saved.status,201,JSON.stringify(saved.data));
 assert.equal((await parent.call('/onboarding/parent/drafts',{expectedVersion:0,draft},{key})).data.version,1);
 const resumed=await parent.call('/onboarding/parent');assert.equal(resumed.data.draft.childId,ids.child);assert.equal(resumed.data.draft.discoveryMethod,'ASSISTED');const draftContract=operationValidator('/onboarding/{kind}','get','200');assert(draftContract(resumed.data),JSON.stringify(draftContract.errors));
 assert.deepEqual((await other.call('/onboarding/parent')).data.draft,{});
 assert.equal((await parent.call('/onboarding/parent/drafts',{expectedVersion:0,draft})).status,409);
 const completeKey=randomUUID(),completed=await parent.call('/onboarding/parent/completions',{expectedVersion:1},{key:completeKey});assert.equal(completed.status,201);assert.equal(completed.data.state,'READY');
 assert.equal((await parent.call('/onboarding/parent/completions',{expectedVersion:1},{key:completeKey})).data.completedResourceId,completed.data.completedResourceId);
 assert.equal((await parent.call('/onboarding/parent/completions',{expectedVersion:2})).status,409);
 assert.equal(await db.child.count({where:{guardianId:ids.guardian}}),children);assert.equal(await db.tuitionRequest.count({where:{guardianId:ids.guardian}}),requests+1);
 const validate=operationValidator('/onboarding/{kind}','get','200');assert(validate(completed.data),JSON.stringify(validate.errors));
 await assert.rejects(db.onboardingProgress.create({data:{accountId:ids.otherGuardian,kind:'PARENT',completedResourceId:completed.data.completedResourceId}}));
});
test('teacher drafts submit a pending application without self-approval or duplicate application',async()=>{
 const account=await db.account.create({data:{phone:'+910000009921',name:'Synthetic onboarding teacher',verified:true}}),client=await login(account.id);
 const draft={name:'Test teacher',headline:'Subject tutor',bio:'Synthetic profile only',subjects:['Maths'],boards:['CBSE'],grades:[8],languages:['English'],modes:['ONLINE'],localities:[],monthlyPaise:300000,experience:2,consultationOptIn:false,feeTermsAccepted:true};
 assert.equal((await client.call('/onboarding/teacher/drafts',{expectedVersion:0,draft:{...draft,status:'APPROVED'}})).status,400);
 const saved=await client.call('/onboarding/teacher/drafts',{expectedVersion:0,draft});assert.equal(saved.status,201);
 const key=randomUUID(),done=await client.call('/onboarding/teacher/completions',{expectedVersion:1},{key});assert.equal(done.status,201,JSON.stringify(done.data));assert.equal(done.data.state,'SUBMITTED');
 assert.equal((await client.call('/onboarding/teacher/completions',{expectedVersion:1},{key})).data.completedResourceId,done.data.completedResourceId);
 const profile=await db.teacher.findUniqueOrThrow({where:{accountId:account.id}});assert.equal(profile.screeningComplete,false);assert(profile.feeTermsAcceptedAt);
 assert.equal(await db.teacher.count({where:{accountId:account.id}}),1);
});
test('guardian-approved returning student devices remain isolated, revocable and consent-bound',async()=>{
 const first=await parent.call(`/children/${ids.child}/student-sessions`);assert.equal(first.status,200);
 assert.equal((await other.call(`/children/${ids.child}/student-sessions`)).status,404);
 assert.equal((await teacher.call(`/children/${ids.child}/student-sessions`)).status,403);
 const device=new Client();device.cookies=parent.cookies;device.csrf=parent.csrf;
 const granted=await device.call(`/children/${ids.child}/student-sessions`,{expectedVersion:first.data.childVersion});assert.equal(granted.status,201);assert.equal(granted.data.account.role,'STUDENT');
 assert.equal((await device.call('/notes')).status,403);assert.equal((await device.call('/dashboard')).status,200);
 const sessions=await parent.call(`/children/${ids.child}/student-sessions`);assert(sessions.data.items.length>=2);assert(sessions.data.items.every((x:any)=>!('accessHash' in x)&&!('refreshHash' in x)));
 const key=randomUUID(),revoked=await parent.call(`/children/${ids.child}/student-access-revocations`,{expectedVersion:sessions.data.childVersion,familyId:null,reason:'Guardian revoked devices'},{key});assert.equal(revoked.status,201);
 assert.equal((await device.call('/dashboard')).status,401);assert.equal((await device.call('/auth/refresh',{})).status,401);
 const relogin=new Client();relogin.cookies=parent.cookies;relogin.csrf=parent.csrf;
 assert.equal((await relogin.call(`/children/${ids.child}/student-sessions`,{expectedVersion:revoked.data.childVersion})).status,201);
 const progress=await relogin.call('/onboarding/student/drafts',{expectedVersion:0,draft:{subjects:['Maths'],learningPreferences:'More examples'}});assert.equal(progress.status,201);
 assert.equal((await relogin.call('/onboarding/parent')).status,403);
 student=relogin;
});
test('support queues isolate owners and regions and hide internal staff updates',async()=>{
 const data={category:'SAFETY',description:'Synthetic safety concern',placementId:ids.placement},key=randomUUID();
 assert.equal((await other.call('/cases',data)).status,404);const created=await parent.call('/cases',data,{key});assert.equal(created.status,201);assert.equal((await parent.call('/cases',data,{key})).data.id,created.data.id);
 assert.equal((await other.call(`/cases/${created.data.id}`)).status,404);assert.equal((await student.call(`/cases/${created.data.id}`)).status,404);
 assert.equal((await parent.call(`/cases/${created.data.id}/updates`,{expectedVersion:1,message:'Owner cannot create staff notes',internal:true})).status,403);
 const regional=await db.account.create({data:{phone:'+910000009101',name:'Regional support',role:'OPERATOR',region:'Delhi'}}),regionalClient=await login(regional.id);assert.equal((await regionalClient.call(`/cases/${created.data.id}`)).status,404);
 const reply=await operator.call(`/cases/${created.data.id}/updates`,{expectedVersion:1,message:'Internal investigation details',internal:true});assert.equal(reply.status,201);assert.equal((await parent.call(`/cases/${created.data.id}`)).data.updates.length,0);assert.equal((await operator.call(`/cases/${created.data.id}`)).data.updates.length,1);
 assert.equal((await operator.call(`/admin/cases/${created.data.id}/triage`,{expectedVersion:2,status:'IN_PROGRESS',assignedToId:regional.id,reason:'Wrong region'})).status,400);
 const assigned=await operator.call(`/admin/cases/${created.data.id}/triage`,{expectedVersion:2,status:'IN_PROGRESS',assignedToId:ids.admin,reason:'Investigation assigned'});assert.equal(assigned.status,201);assert((await operator.call('/cases?assignment=ME&category=SAFETY')).data.items.some((c:any)=>c.id===created.data.id));assert.equal((await parent.call('/cases?assignment=ME')).status,403);assert.equal((await operator.call('/cases?assignment=UNASSIGNED&cursor='+created.data.id)).status,404);assert.equal((await parent.call(`/cases/${created.data.id}/updates`,{expectedVersion:1,message:'Stale'})).status,409);
 const resolved=await operator.call(`/admin/cases/${created.data.id}/triage`,{expectedVersion:3,status:'RESOLVED',reason:'Participant contacted and issue resolved'});assert.equal(resolved.status,201);assert.equal((await parent.call(`/cases/${created.data.id}/updates`,{expectedVersion:4,message:'Closed reply'})).status,409);
 const list=await parent.call('/cases?limit=1');assert.equal(list.status,200);assert.equal(list.data.items.length,1);assert(list.data.nextCursor);const validate=operationValidator('/cases/{id}','get','200');assert(validate((await parent.call(`/cases/${created.data.id}`)).data),JSON.stringify(validate.errors));
 const update=await db.caseUpdate.findFirstOrThrow({where:{caseId:created.data.id}});await assert.rejects(db.caseUpdate.update({where:{id:update.id},data:{message:'Rewrite'}}));
});
test('guardian rematching closes the old placement, revokes notes and preserves service evidence',async()=>{
 const source=await db.tuitionRequest.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Synthetic replacement'}}),p=await db.placement.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,teacherId:ids.teacher,requestId:source.id,monthlyPaise:300000,status:'ACTIVE'}});
 const start=new Date(future(59)),r=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.otherGuardian,childId:ids.otherChild,kind:'RECURRING',status:'CONFIRMED',startsAt:start,endsAt:new Date(start.getTime()+20*60000)}}),lesson=await db.lesson.create({data:{placementId:p.id,reservationId:r.id,teacherId:ids.teacher,childId:ids.otherChild,kind:'RECURRING',subject:'Maths',startsAt:r.startsAt,endsAt:r.endsAt}}),note=await db.note.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,text:'Private replacement note',sharedTeacherId:ids.teacher}});
 const past=await db.lesson.create({data:{placementId:p.id,teacherId:ids.teacher,childId:ids.otherChild,kind:'RECURRING',subject:'Maths',startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()-86400000+1200000),status:'COMPLETED',attendance:'PRESENT'}});
 const at=future(58),body={expectedVersion:1,reason:'Different teaching fit',criteria:{subject:'Science',mode:'ONLINE',language:'Hindi',locality:'Shankar Nagar',budgetPaise:450000},preferences:{timezone:'Asia/Kolkata',slots:[{startsAt:at,endsAt:new Date(new Date(at).getTime()+3600000).toISOString()}]}},key=randomUUID();
 assert.equal((await parent.call(`/placements/${p.id}/rematches`,body)).status,404);assert.equal((await student.call(`/placements/${p.id}/rematches`,body)).status,403);
 assert.equal((await other.call(`/placements/${p.id}/rematches`,{...body,criteria:{...body.criteria,budgetPaise:1}})).status,400);
 const result=await other.call(`/placements/${p.id}/rematches`,body,{key});assert.equal(result.status,201,JSON.stringify(result.data));assert.equal((await other.call(`/placements/${p.id}/rematches`,body,{key})).data.request.id,result.data.request.id);
 assert.equal(result.data.request.subject,'Science');assert.equal(result.data.request.budgetPaise,450000);assert.equal(result.data.request.language,'Hindi');assert.equal(result.data.request.mode,'ONLINE');assert.equal((await db.tuitionRequest.findUniqueOrThrow({where:{id:source.id}})).subject,'Maths');
 assert.equal((await db.placement.findUniqueOrThrow({where:{id:p.id}})).status,'CLOSED');assert.equal((await db.lesson.findUniqueOrThrow({where:{id:lesson.id}})).status,'CANCELLED');assert.equal((await db.reservation.findUniqueOrThrow({where:{id:r.id}})).status,'CANCELLED');assert.equal((await db.note.findUniqueOrThrow({where:{id:note.id}})).sharedTeacherId,null);assert.equal((await db.lesson.findUniqueOrThrow({where:{id:past.id}})).status,'COMPLETED');assert.equal((await other.call(`/cases/${result.data.caseId}`)).status,200);
 const recommendations=await operator.call(`/admin/requests/${result.data.request.id}/recommendations`,{expectedVersion:1});assert.equal(recommendations.status,201);assert(recommendations.data.items.every((x:any)=>x.teacherId!==ids.teacher));
 const closeBody={expectedVersion:1,reason:'End remaining terms'},closedPlacement=await db.placement.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,teacherId:ids.teacher,requestId:result.data.request.id,monthlyPaise:300000}});assert.equal((await other.call(`/placements/${closedPlacement.id}/closures`,closeBody)).status,201);assert.equal((await other.call(`/placements/${closedPlacement.id}/closures`,closeBody)).status,409);
});

test('case detail paginates recent visible updates and refuses foreign or internal cursors without exposing authors',async()=>{
 const created=await parent.call('/cases',{category:'GENERAL',description:'Synthetic paginated case'});assert.equal(created.status,201);const id=created.data.id,updates=[];
 for(let i=0;i<4;i++)updates.push(await db.caseUpdate.create({data:{caseId:id,actorId:ids.guardian,message:'Visible update '+i,internal:false,createdAt:new Date(Date.now()+i*1000)}}));
 const hidden=await db.caseUpdate.create({data:{caseId:id,actorId:ids.admin,message:'Private staff update',internal:true}}),foreignCase=await other.call('/cases',{category:'GENERAL',description:'Foreign case'}),foreign=await db.caseUpdate.create({data:{caseId:foreignCase.data.id,actorId:ids.otherGuardian,message:'Foreign update'}});
 const first=await parent.call(`/cases/${id}?updatesLimit=2`);assert.equal(first.status,200);assert.equal(first.data.updates[0].message,'Visible update 3');assert.equal(first.data.updates[0].author,'YOU');assert(!('actorId' in first.data.updates[0]));assert(first.data.updatesNextCursor);
 const next=await parent.call(`/cases/${id}?updatesLimit=2&updatesCursor=${first.data.updatesNextCursor}`);assert.equal(next.status,200);assert.equal(next.data.updates.length,2);assert.equal(next.data.updatesNextCursor,null);assert(!next.data.updates.some((u:any)=>u.internal));
 for(const cursor of [hidden.id,foreign.id])assert.equal((await parent.call(`/cases/${id}?updatesCursor=${cursor}`)).status,404);
 const check=operationValidator('/cases/{id}','get','200');assert(check(first.data),JSON.stringify(check.errors));assert.equal((await parent.call(`/cases/${id}?updatesLimit=51`)).status,400);
});
test('named teacher acknowledgement is versioned, retry-safe and loses access after revocation',async()=>{
 const note=await parent.call('/notes',{childId:ids.child,text:'Synthetic note requiring acknowledgement'});assert.equal(note.status,201);const shared=await parent.call(`/notes/${note.data.id}/shares`,{teacherId:ids.teacher,expectedVersion:1});assert.equal(shared.status,201);
 assert.equal((await other.call(`/notes/${note.data.id}/acknowledgements`,{expectedVersion:2})).status,403);
 const key=randomUUID(),acked=await teacher.call(`/notes/${note.data.id}/acknowledgements`,{expectedVersion:2},{key});assert.equal(acked.status,201);assert(acked.data.acknowledgedAt);assert.equal('text' in acked.data,false);assert.equal((await teacher.call(`/notes/${note.data.id}/acknowledgements`,{expectedVersion:2},{key})).data.version,3);
 assert.equal((await parent.call(`/notes/${note.data.id}/shares`,{teacherId:null,expectedVersion:3})).status,201);assert.equal((await teacher.call(`/notes/${note.data.id}/acknowledgements`,{expectedVersion:4})).status,404);
});
test('prepaid membership cancellation preserves its period and worker timeouts release allowance once',async()=>{
 const current=await parent.call('/pro/membership');assert.equal(current.status,200);assert.equal(current.data.automaticRenewal,false);assert.equal(current.data.callsEnabled,false);
 const membership=await db.membership.findUniqueOrThrow({where:{guardianId:ids.guardian}}),key=randomUUID(),body={expectedVersion:membership.version,reason:'No next period'};
 const cancel=await parent.call('/pro/membership/cancellations',body,{key});assert.equal(cancel.status,201);assert.equal(cancel.data.status,'ACTIVE');assert.equal(cancel.data.cancelAtPeriodEnd,true);assert.equal((await parent.call('/pro/membership/cancellations',body,{key})).data.version,cancel.data.version);
 const calls=await db.consultation.findMany({where:{guardianId:ids.guardian,status:'ACCEPTED'}});assert(calls.length>=2);
 const cancelled=await parent.call(`/pro/calls/${calls[0].id}/cancellations`,{expectedVersion:calls[0].version,reason:'No longer needed'});assert.equal(cancelled.status,201);assert.equal(cancelled.data.status,'CANCELLED');
 await db.consultation.update({where:{id:calls[1].id},data:{startsAt:new Date(Date.now()-3600000)}});const before=await db.membership.findUniqueOrThrow({where:{id:membership.id}});runEvidenceWorker();runEvidenceWorker();const after=await db.membership.findUniqueOrThrow({where:{id:membership.id}});assert.equal(after.reserved,before.reserved-1);assert.equal(after.used,before.used);assert.equal((await db.consultation.findUniqueOrThrow({where:{id:calls[1].id}})).status,'TIMED_OUT');assert.equal(await db.audit.count({where:{action:'CONSULTATION_TIMED_OUT_SYSTEM',aggregateId:calls[1].id}}),1);
 await db.membership.update({where:{id:membership.id},data:{periodEnd:new Date(Date.now()-1000)}});runEvidenceWorker();assert.equal((await db.membership.findUniqueOrThrow({where:{id:membership.id}})).status,'CANCELLED');assert.equal((await parent.call('/pro/membership')).data.active,false);
});

test('operational reports distinguish discovery cohorts, mature observations and financial obligations',async()=>{
 for(const item of [{days:30.5,status:'ACTIVE',closedAt:null},{days:35,status:'CLOSED',closedAt:new Date(Date.now()-15*86400000)},{days:35,status:'ACTIVE',closedAt:null}]){
  const request=await db.tuitionRequest.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Synthetic report fixture'}});await db.placement.create({data:{requestId:request.id,guardianId:ids.otherGuardian,childId:ids.otherChild,teacherId:ids.teacher,monthlyPaise:300000,status:item.status,startedAt:new Date(Date.now()-item.days*86400000),closedAt:item.closedAt}});
 }
 for(let i=0;i<3;i++)runEvidenceWorker();
 const query=`?from=${encodeURIComponent(new Date(Date.now()-86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now()+3600000).toISOString())}`;
 assert.equal((await parent.call('/admin/reports/funnel'+query)).status,403);assert.equal((await student.call('/admin/reports/finance'+query)).status,403);
 const funnel=await operator.call('/admin/reports/funnel'+query);assert.equal(funnel.status,200,JSON.stringify(funnel.data));assert(funnel.data.items.some((x:any)=>x.discoveryMethod==='MANUAL'));assert.equal(funnel.data.continuation.mature,3);assert.equal(funnel.data.continuation.observed,2);assert.equal(funnel.data.continuation.continued,1);assert.equal(funnel.data.continuation.denominator,2);assert.equal(funnel.data.continuation.unobserved,1);assert.equal(funnel.data.continuation.rate,0.5);
 const regional=await db.account.findFirstOrThrow({where:{phone:'+910000009101'}}),regionalClient=await login(regional.id);const regionReport=await regionalClient.call('/admin/reports/funnel'+query);assert.equal(regionReport.status,200);assert.equal(regionReport.data.items.length,0);assert.equal(regionReport.data.continuation.rate,null);assert.equal((await regionalClient.call('/admin/reports/finance'+query)).status,403);
 const finance=await operator.call('/admin/reports/finance'+query);assert.equal(finance.status,200);assert(finance.data.captured.amountPaise>0);assert(finance.data.pendingRefunds.amountPaise>0);assert.equal(finance.data.providerSettlementVerified,false);assert.equal(finance.data.outstandingInvoices.basis,'CURRENT_ALL_TIME');
 for(const [route,result] of [['/admin/reports/funnel',funnel],['/admin/reports/finance',finance]] as const){const validate=operationValidator(route,'get','200');assert(validate(result.data),JSON.stringify(validate.errors));assert.equal(JSON.stringify(result.data).includes('guardianId'),false);assert.equal(JSON.stringify(result.data).includes('childId'),false);}
 const observation=await db.continuationObservation.findFirstOrThrow();await assert.rejects(db.continuationObservation.update({where:{id:observation.id},data:{continued:false}}));
});

test('privacy file deletion cannot be starved by pending financial delivery',async()=>{
 process.env.EVIDENCE_DIRECTORY=evidenceDir;const files=await import('@bcs/evidence'),id=randomUUID(),bytes=Buffer.from('%PDF-1.4\nSynthetic document to remove\n%%EOF');files.put(id,bytes);await db.evidence.create({data:{id,teacherId:ids.teacher,kind:'IDENTITY',mediaType:'application/pdf',size:bytes.length,sha256:files.digest(bytes),status:'DELETED'}});
 const job=await db.outbox.create({data:{type:'privacy.evidence_delete_requested',aggregateId:id,payload:{version:1}}});assert(await db.outbox.count({where:{type:'refund.requested',processedAt:null}}));runEvidenceWorker();assert.throws(()=>files.read(id));assert((await db.outbox.findUniqueOrThrow({where:{id:job.id}})).processedAt);assert.equal((await db.evidence.findUniqueOrThrow({where:{id}})).status,'DELETED');
});

test('media recovery queue hides payloads and retries exhausted work with audit and state checks',async()=>{
 const evidence=await db.evidence.create({data:{teacherId:ids.teacher,kind:'IDENTITY',mediaType:'application/pdf',size:10,sha256:'a'.repeat(64)}}),job=await db.outbox.create({data:{type:'evidence.scan_requested',aggregateId:evidence.id,payload:{version:1},attempts:5}});
 assert.equal((await parent.call('/admin/jobs')).status,403);const queue=await operator.call('/admin/jobs');assert.equal(queue.status,200);assert(queue.data.items.some((x:any)=>x.id===job.id));assert(queue.data.items.every((x:any)=>!('payload' in x)));
 const key=randomUUID(),body={expectedAttempts:5,reason:'Scanner restored',confirmed:true};assert.equal((await parent.call(`/admin/jobs/${job.id}/retries`,body)).status,403);const retry=await operator.call(`/admin/jobs/${job.id}/retries`,body,{key});assert.equal(retry.status,201);assert.equal(retry.data.attempts,0);assert.equal((await operator.call(`/admin/jobs/${job.id}/retries`,body,{key})).status,201);assert.equal((await operator.call(`/admin/jobs/${job.id}/retries`,body)).status,409);assert.equal(await db.audit.count({where:{action:'JOB_RETRY_REQUESTED',aggregateId:job.id}}),1);
 const refund=await db.outbox.findFirstOrThrow({where:{type:'refund.requested',processedAt:null}});assert.equal((await operator.call(`/admin/jobs/${refund.id}/retries`,body)).status,409);
});

test('privacy correction and deletion require owner scope, reviewed retention and replay evidence',async()=>{
 const note=await db.note.create({data:{guardianId:ids.otherGuardian,childId:ids.otherChild,text:'Private synthetic note',sharedTeacherId:ids.teacher,acknowledgedAt:new Date()}});
 assert.equal((await parent.call('/privacy-requests',{kind:'DELETION',scope:'NOTE',resourceId:note.id,reason:'Wrong family'})).status,404);
 const correction=await other.call('/privacy-requests',{kind:'CORRECTION',scope:'NOTE',resourceId:note.id,reason:'Correct a typo',correction:'Corrected synthetic note'});assert.equal(correction.status,201);
 const review={expectedVersion:1,action:'FULFIL',reason:'Owner correction verified',policyVersion:'synthetic-privacy-v1',confirmed:true};assert.equal((await other.call(`/admin/privacy-requests/${correction.data.id}/reviews`,review)).status,403);
 assert.equal((await operator.call(`/admin/privacy-requests/${correction.data.id}/reviews`,review)).status,201);assert.equal((await db.note.findUniqueOrThrow({where:{id:note.id}})).text,'Corrected synthetic note');assert.equal((await db.note.findUniqueOrThrow({where:{id:note.id}})).sharedTeacherId,null);assert.equal((await db.note.findUniqueOrThrow({where:{id:note.id}})).acknowledgedAt,null);assert.equal((await operator.call(`/admin/privacy-requests/${correction.data.id}/reviews`,review)).status,409);
 const deletion=await other.call('/privacy-requests',{kind:'DELETION',scope:'CHILD',resourceId:ids.otherChild,reason:'Delete learner personal content'});assert.equal(deletion.status,201);
 assert.equal((await other.call('/requests',intake({childId:ids.otherChild,grade:9,board:'CGBSE'}))).status,403);
 assert.equal((await operator.call(`/admin/privacy-requests/${deletion.data.id}/reviews`,review)).status,400);
 const fulfilled=await operator.call(`/admin/privacy-requests/${deletion.data.id}/reviews`,{...review,retentionReason:'Synthetic approved retention of financial, learning, safety and immutable audit evidence'});assert.equal(fulfilled.status,201,JSON.stringify(fulfilled.data));assert.equal((await db.child.findUniqueOrThrow({where:{id:ids.otherChild}})).alias,'Deleted learner');assert.equal((await db.note.findUniqueOrThrow({where:{id:note.id}})).text,'[deleted]');
 const ledger=await operator.call('/admin/privacy/deletion-ledger');assert.equal(ledger.status,200);const record=ledger.data.items.find((r:any)=>r.privacyRequestId===deletion.data.id);assert(record);assert.equal((await other.call('/admin/privacy/deletion-ledger')).status,403);await assert.rejects(db.deletionRecord.update({where:{id:record.id},data:{retentionReason:'Rewrite'}}));
 await db.note.update({where:{id:note.id},data:{text:'Restored backup content'}});const key=randomUUID(),replay={restoreReference:'synthetic-backup-restore-01',reason:'Apply deletion after restore',confirmed:true};assert.equal((await operator.call(`/admin/privacy/deletion-ledger/${record.id}/replays`,replay,{key})).status,201);assert.equal((await operator.call(`/admin/privacy/deletion-ledger/${record.id}/replays`,replay,{key})).status,201);assert.equal((await db.note.findUniqueOrThrow({where:{id:note.id}})).text,'[deleted]');assert.equal(await db.audit.count({where:{action:'BACKUP_DELETION_REPLAYED',aggregateId:record.id}}),1);
 const validate=operationValidator('/privacy-requests','post','201');assert(validate(deletion.data),JSON.stringify(validate.errors));
});

test('consent withdrawal blocks new intake, note sharing and student sessions',async()=>{assert.equal((await parent.call('/consents/withdraw',{})).status,201);assert.equal((await parent.call('/requests',intake())).status,403);assert.equal((await student.call('/dashboard')).status,401);assert.equal((await student.call('/auth/refresh',{})).status,401);assert.equal((await teacher.call('/notes')).data.items.length,0);});


test('failed screening is immutable within a revision and blocks approval despite the other passed kinds',async()=>{
 const a=await db.account.create({data:{name:'Synthetic failed-screening applicant',role:'TEACHER'}}),t=await db.teacher.create({data:{accountId:a.id,slug:'synthetic-failed-'+randomUUID(),name:a.name,headline:'Synthetic',bio:'Test only',subjects:['Maths'],boards:['CBSE'],grades:[8],languages:['English'],modes:['ONLINE'],localities:[],monthlyPaise:100000,experience:1,feeTermsAcceptedAt:new Date()}}),validUntil=new Date(Date.now()+30*86400000);
 let identity='';
 for(const kind of ['IDENTITY','QUALIFICATIONS','CAPABILITY','REFERENCES']){const e=await db.evidence.create({data:{teacherId:t.id,kind,mediaType:'application/pdf',size:20,sha256:'a'.repeat(64),status:'CLEAN',scannerVersion:'synthetic-scanner',scannedAt:new Date()}});if(kind==='IDENTITY')identity=e.id;await db.verificationCheck.create({data:{teacherId:t.id,reviewerId:ids.admin,profileRevision:1,kind,evidenceId:e.id,result:kind==='IDENTITY'?'FAILED':'PASSED',reason:'Synthetic immutable assessment',validUntil}});}
 const overwritten=await operator.call(`/admin/teachers/${t.id}/checks`,{expectedVersion:1,kind:'IDENTITY',evidenceId:identity,result:'PASSED',reason:'Try to overwrite failed check',validUntil:validUntil.toISOString()});assert.equal(overwritten.status,409);assert.equal((await db.verificationCheck.findFirstOrThrow({where:{teacherId:t.id,kind:'IDENTITY'}})).result,'FAILED');
 const denied=await operator.call(`/admin/teachers/${t.id}/reviews`,{expectedVersion:1,status:'APPROVED',reason:'Try to ignore the failed check'});assert.equal(denied.status,409);assert.equal(denied.data.code,'SCREENING_REQUIRED');assert.equal((await db.teacher.findUniqueOrThrow({where:{id:t.id}})).screeningComplete,false);
});


test('regional dispute reads and revision resolution are scoped and attendance cannot be recorded before lesson end',async()=>{
 const account=await db.account.create({data:{phone:'+910000009995',name:'Synthetic dispute operator',role:'OPERATOR',region:'Raipur',verified:true}}),regional=await login(account.id);
 async function revision(childId:string,guardianId:string,days:number){const startsAt=new Date(Date.now()-days*86400000),endsAt=new Date(startsAt.getTime()+20*60000),r=await db.reservation.create({data:{teacherId:ids.teacher,childId,guardianId,kind:'REVISION',status:'CONFIRMED',startsAt,endsAt}});return db.lesson.create({data:{reservationId:r.id,teacherId:ids.teacher,childId,kind:'REVISION',subject:'Maths',startsAt,endsAt,status:'COMPLETED',attendance:'ABSENT',disputed:true,recap:'Synthetic recap'}});}
 const lesson=await revision(ids.child,ids.guardian,10),outsider=await revision(ids.otherChild,ids.otherGuardian,11);await db.account.update({where:{id:ids.otherGuardian},data:{region:'Delhi'}});
 try{const list=await regional.call('/admin/lessons/disputes?limit=50');assert.equal(list.status,200);assert(list.data.items.some((l:any)=>l.id===lesson.id));assert(!list.data.items.some((l:any)=>l.id===outsider.id));assert.equal((await regional.call('/admin/lessons/disputes?cursor='+outsider.id)).status,404);assert.equal((await regional.call(`/admin/lessons/${outsider.id}/dispute-resolutions`,{expectedVersion:1,attendance:'PRESENT',reason:'Wrong region'})).status,404);assert.equal((await regional.call(`/admin/lessons/${lesson.id}/dispute-resolutions`,{expectedVersion:1,attendance:'PRESENT',reason:'Revision attendance evidence checked'})).status,201);}
 finally{await db.account.update({where:{id:ids.otherGuardian},data:{region:'Raipur'}});}
 const ongoing=await db.lesson.create({data:{placementId:ids.placement,teacherId:ids.teacher,childId:ids.child,kind:'RECURRING',subject:'Maths',startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+19*60000)}});assert.equal((await teacher.call(`/lessons/${ongoing.id}/attendance`,{expectedVersion:1,attendance:'PRESENT',reason:'Too early'})).status,409);
});


test('finance queues are MFA protected, allowlisted and cursor/filter bound across financial kinds',async()=>{
 const service=new AppService();service.db=db;const isolatedSession=async(id:string,verified=false)=>{const account=await db.account.findUniqueOrThrow({where:{id}}),now=new Date(),state=await service.issueSession(account,randomUUID(),db,undefined,verified?{createdAt:now,mfaVerifiedAt:now}:undefined),client=new Client();client.cookies='bcs_access='+state.access;client.csrf=state.csrf;return client;};
 const financeAccount=await db.account.create({data:{phone:'+91000000'+randomUUID(),email:`finance-${randomUUID()}@example.test`,name:'Synthetic finance',role:'FINANCE',verified:true}}),finance=await login(financeAccount.id),pending=await isolatedSession(financeAccount.id),regional=await db.account.create({data:{phone:'+91000000'+randomUUID(),email:`ops-${randomUUID()}@example.test`,name:'Synthetic regional operator',role:'OPERATOR',region:'Raipur'}}),regionalClient=await isolatedSession(regional.id,true);
 const family=await db.account.create({data:{name:'Synthetic finance access guardian',verified:true}}),learner=await db.account.create({data:{name:'Synthetic active student',role:'STUDENT'}});await db.consent.create({data:{guardianId:family.id}});await db.child.create({data:{guardianId:family.id,studentAccountId:learner.id,alias:'Synthetic finance access learner',grade:8,board:'CBSE'}});
 for(const client of [await isolatedSession(family.id),await isolatedSession(ids.teacherAccount),await isolatedSession(learner.id),regionalClient])assert.equal((await client.call('/admin/finance/records?kind=INVOICES')).status,403);
 assert.equal((await pending.call('/admin/finance/records?kind=INVOICES')).status,403);
 assert.equal((await finance.call('/admin/finance/records?kind=INVOICES&limit=51')).status,400);assert.equal((await finance.call('/admin/finance/records?kind=UNKNOWN')).status,400);
 const invoices=await Promise.all([1,2,3].map(async amount=>{const request=await db.tuitionRequest.create({data:{guardianId:ids.guardian,childId:ids.child,subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Synthetic finance fixture'}}),placement=await db.placement.create({data:{requestId:request.id,guardianId:ids.guardian,childId:ids.child,teacherId:ids.teacher,monthlyPaise:300000}});return db.invoice.create({data:{placementId:placement.id,payerId:ids.teacherAccount,amountPaise:amount*100,policyVersion:'synthetic-finance-v1'}});}));
 const start=new Date(future(120)),reservation=await db.reservation.create({data:{teacherId:ids.teacher,guardianId:ids.guardian,childId:ids.child,kind:'REVISION',startsAt:start,endsAt:new Date(start.getTime()+1200000),status:'CONFIRMED',amountPaise:100,payablePaise:80}}),lesson=await db.lesson.create({data:{reservationId:reservation.id,teacherId:ids.teacher,childId:ids.child,kind:'REVISION',subject:'Maths',startsAt:reservation.startsAt,endsAt:reservation.endsAt}});
 const order=await db.checkoutOrder.create({data:{accountId:ids.guardian,kind:'REVISION',resourceId:reservation.id,amountPaise:100,providerMode:'SANDBOX'}}),payment=await db.payment.create({data:{reservationId:reservation.id,checkoutOrderId:order.id,providerEventId:`synthetic-finance-${randomUUID()}`,amountPaise:100}}),refund=await db.refund.create({data:{paymentId:payment.id,amountPaise:100,reason:'Synthetic read evidence'}}),payable=await db.teacherPayable.create({data:{paymentId:payment.id,lessonId:lesson.id,teacherId:ids.teacher,amountPaise:80,policyVersion:'synthetic-finance-v1'}});
 const validate=operationValidator('/admin/finance/records','get','200');
 for(const [kind,row] of [['INVOICES',invoices[0]],['CHECKOUTS',order],['PAYMENTS',payment],['REFUNDS',refund],['PAYABLES',payable]] as const){const response=await finance.call(`/admin/finance/records?kind=${kind}&id=${row.id}`);assert.equal(response.status,200);assert(validate(response.data),JSON.stringify(validate.errors));assert.equal(response.data.items.length,1);const item=response.data.items[0];assert.equal(item.id,row.id);assert.equal(item.amountPaise,row.amountPaise);assert.equal('accountId' in item,false);assert.equal('payerId' in item,false);assert.equal('providerEventId' in item,false);assert.equal(item.providerMode,kind==='INVOICES'?null:'SANDBOX');assert.equal(response.data.providerSettlementVerified,false);if(kind==='INVOICES')assert.equal(item.createdAt,null);}
 const first=await finance.call('/admin/finance/records?kind=INVOICES&status=DUE&limit=1');assert(first.data.nextCursor);const second=await finance.call(`/admin/finance/records?kind=INVOICES&status=DUE&limit=1&cursor=${first.data.nextCursor}`);assert.equal(second.status,200);assert.notEqual(second.data.items[0].id,first.data.items[0].id);assert.equal((await finance.call(`/admin/finance/records?kind=INVOICES&status=PAID&cursor=${first.data.nextCursor}`)).status,404);assert.equal((await finance.call(`/admin/finance/records?kind=PAYMENTS&cursor=${invoices[0].id}`)).status,404);assert.equal((await finance.call(`/admin/finance/records?kind=INVOICES&id=${invoices[1].id}&cursor=${invoices[0].id}`)).status,404);
 const body={expectedVersion:order.version,reason:'Reviewed synthetic provider query'},key=randomUUID();const reconciled=await finance.call(`/admin/checkout-orders/${order.id}/reconciliations`,body,{key});assert.equal(reconciled.status,201);assert.equal(reconciled.data.status,'LOCAL_SANDBOX_ONLY');assert.equal((await finance.call(`/admin/checkout-orders/${order.id}/reconciliations`,body,{key})).status,201);assert.equal(await db.audit.count({where:{actorId:financeAccount.id,action:'CHECKOUT_RECONCILED',aggregateId:order.id}}),1);assert.equal((await db.checkoutOrder.findUniqueOrThrow({where:{id:order.id}})).status,'CREATING');
});

test('administrator console directory, linkage and audit reads are protected and allowlisted',async()=>{
 const service=new AppService();service.db=db;const client=async(role:string,verified=true)=>{const account=await db.account.create({data:{name:'Synthetic console '+role,role,verified:true}}),now=new Date(),state=await service.issueSession(account,randomUUID(),db,undefined,verified?{createdAt:now,mfaVerifiedAt:now}:undefined),c=new Client();c.cookies='bcs_access='+state.access;c.csrf=state.csrf;return {c,account};};const admin=await client('ADMIN'),pending=await client('ADMIN',false),finance=await client('FINANCE');
 for(const path of ['/admin/console','/admin/accounts','/admin/audit','/admin/privacy-requests']){assert.equal((await pending.c.call(path)).status,403);assert.equal((await finance.c.call(path)).status,403);}
 const summary=await admin.c.call('/admin/console'),v=operationValidator('/admin/console','get','200');assert.equal(summary.status,200);assert(v(summary.data),JSON.stringify(v.errors));assert.equal(summary.data.release.authorized,false);assert.equal(summary.data.commercial.editable,false);assert.deepEqual(summary.data.commercial.revisionPrices,[{minutes:20,amountPaise:30000},{minutes:40,amountPaise:60000}]);
 const guardian=await db.account.create({data:{name:'Synthetic directory guardian',email:`console-${randomUUID()}@example.test`,verified:true}}),child=await db.child.create({data:{guardianId:guardian.id,alias:'Synthetic linked learner',grade:8,board:'CBSE'}});const directory=await admin.c.call(`/admin/accounts?id=${guardian.id}`);assert(operationValidator('/admin/accounts','get','200')(directory.data));assert.equal(directory.data.items.length,1);assert.equal('email' in directory.data.items[0],false);assert.equal('phone' in directory.data.items[0],false);const linkage=await admin.c.call(`/admin/accounts/${guardian.id}/linkage`);assert(operationValidator('/admin/accounts/{id}/linkage','get','200')(linkage.data));assert.equal(linkage.data.children[0].id,child.id);assert.equal(linkage.data.editable,false);assert.equal('notes' in linkage.data,false);
 const first=await admin.c.call('/admin/accounts?role=GUARDIAN&limit=1');assert(first.data.nextCursor);assert.equal((await admin.c.call(`/admin/accounts?role=ADMIN&cursor=${first.data.nextCursor}`)).status,404);assert.equal((await admin.c.call('/admin/accounts?limit=51')).status,400);const audit=await admin.c.call('/admin/audit?action=ADMIN_CONSOLE_READ&limit=1');assert(operationValidator('/admin/audit','get','200')(audit.data));assert(audit.data.items.length);assert.equal('before' in audit.data.items[0],false);assert.equal('actorId' in audit.data.items[0],false);assert.equal((await admin.c.call(`/admin/audit?action=NOT_A_REAL_ACTION&cursor=${audit.data.items[0].id}`)).status,404);
});
test('flag retries are idempotent and privacy queues bind filters and reject self review',async()=>{
 const service=new AppService();service.db=db;const account=await db.account.create({data:{name:'Synthetic control administrator',role:'ADMIN',verified:true}}),now=new Date(),state=await service.issueSession(account,randomUUID(),db,undefined,{createdAt:now,mfaVerifiedAt:now}),c=new Client();c.cookies='bcs_access='+state.access;c.csrf=state.csrf;
 const flag=await db.featureFlag.findUniqueOrThrow({where:{name:'revision'}}),body={enabled:false,expectedVersion:flag.version,reason:'Synthetic reviewed pause',confirmed:true},key=randomUUID();try{const first=await c.call('/admin/flags/revision',body,{key}),replay=await c.call('/admin/flags/revision',body,{key});assert.equal(first.status,201);assert.deepEqual(replay.data,first.data);assert(operationValidator('/admin/flags/{name}','post','201')(first.data));assert.equal(await db.audit.count({where:{actorId:account.id,action:'FEATURE_FLAG_CHANGED'}}),1);assert.equal((await c.call('/admin/flags/checkout',{...body,enabled:true})).status,409);}finally{await db.featureFlag.update({where:{name:'revision'},data:{enabled:flag.enabled}});}
 const request=await db.privacyRequest.create({data:{accountId:account.id,kind:'CORRECTION',scope:'ACCOUNT',resourceId:account.id,reason:'Synthetic self-review guard',correction:'Synthetic corrected name'}});const queue=await c.call('/admin/privacy-requests?status=PENDING&limit=1');assert(operationValidator('/admin/privacy-requests','get','200')(queue.data));assert.equal((await c.call(`/admin/privacy-requests?status=COMPLETED&cursor=${request.id}`)).status,404);assert.equal((await c.call(`/admin/privacy-requests/${request.id}/reviews`,{expectedVersion:1,action:'FULFIL',reason:'Self review denied',policyVersion:'synthetic-v1',confirmed:true})).status,403);assert.equal((await db.privacyRequest.findUniqueOrThrow({where:{id:request.id}})).status,'PENDING');
});

test('report cohorts enforce regional scope, IST bounds and separate mature unknown/missing observations',async()=>{
 const service=new AppService();service.db=db;const region='Report-'+randomUUID(),now=new Date();const staff=async(role:string,mfa=true)=>{const account=await db.account.create({data:{name:'Synthetic reporting '+role,role,region,verified:true}}),state=await service.issueSession(account,randomUUID(),db,undefined,mfa?{createdAt:now,mfaVerifiedAt:now}:undefined),c=new Client();c.cookies='bcs_access='+state.access;c.csrf=state.csrf;return c;};await db.region.create({data:{id:region,countryCode:'IN',stateCode:'CT',cityName:region}});const admin=await staff('ADMIN'),scoped=await staff('OPERATOR'),finance=await staff('FINANCE'),pending=await staff('ADMIN',false),from=new Date('2020-01-01T00:00:00+05:30'),to=new Date('2020-01-02T00:00:00+05:30');
 const request=async(createdAt:Date,method='ASSISTED')=>db.tuitionRequest.create({data:{guardianId:ids.guardian,childId:ids.child,subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Synthetic report boundary',region,createdAt,discoveryMethod:method,preferredTeacherId:method==='MANUAL'?ids.teacher:null}});
 for(let i=0;i<6;i++){const r=await request(new Date(from.getTime()+3600000),i<3?'MANUAL':'ASSISTED'),startedAt=i===5?null:new Date(now.getTime()-(i===4?5:45)*86400000),p=await db.placement.create({data:{requestId:r.id,guardianId:ids.guardian,childId:ids.child,teacherId:ids.teacher,monthlyPaise:300000,startedAt}});if(i<3)await db.continuationObservation.create({data:{placementId:p.id,dueAt:new Date(startedAt!.getTime()+30*86400000),observedAt:new Date(now.getTime()-86400000),continued:i===0?true:i===1?false:null}});if(i===4)await db.continuationObservation.create({data:{placementId:p.id,dueAt:new Date(now.getTime()-86400000),observedAt:now,continued:true}});}
 await request(from);await request(to);const query=`?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&region=${encodeURIComponent(region)}`;
 assert.equal((await pending.call('/admin/reports/funnel'+query)).status,403);assert.equal((await finance.call('/admin/reports/regions')).status,403);const choices=await scoped.call('/admin/reports/regions');assert(operationValidator('/admin/reports/regions','get','200')(choices.data));assert.deepEqual(choices.data.items,[{region}]);assert.equal((await scoped.call('/admin/reports/funnel'+query.replace(encodeURIComponent(region),'Another-region'))).status,403);
 const result=await admin.call('/admin/reports/funnel'+query);assert.equal(result.status,200,JSON.stringify(result.data));assert(operationValidator('/admin/reports/funnel','get','200')(result.data));assert.equal(result.data.items.reduce((sum:number,r:any)=>sum+r.requests,0),7);assert.equal(result.data.definitionVersion,'funnel-v2');assert.deepEqual(result.data.continuation,{mature:4,observed:2,continued:1,stopped:1,unknown:1,missingObservation:1,immature:1,missingStartEvidence:1,unobserved:2,denominator:2,rate:0.5});assert.equal(result.data.continuationByMethod.find((r:any)=>r.discoveryMethod==='MANUAL').unknown,1);assert.equal(result.data.continuationByMethod.find((r:any)=>r.discoveryMethod==='ASSISTED').rate,null);assert.equal((await scoped.call('/admin/reports/funnel'+query)).data.continuation.rate,0.5);assert.equal((await admin.call('/admin/reports/funnel?from=invalid&to=invalid')).status,400);assert.equal((await admin.call('/admin/reports/funnel?from=2020-01-01T00%3A00%3A00Z&to=2022-01-01T00%3A00%3A00Z')).status,400);
});
test('finance capture classification separates live, sandbox and unrecorded mode without asserting settlement',async()=>{
 const service=new AppService();service.db=db;const actor=await db.account.create({data:{name:'Synthetic reporting finance',role:'FINANCE',verified:true}}),now=new Date(),state=await service.issueSession(actor,randomUUID(),db,undefined,{createdAt:now,mfaVerifiedAt:now}),c=new Client();c.cookies='bcs_access='+state.access;c.csrf=state.csrf;let i=0;
 for(const mode of ['LIVE','SANDBOX','UNRECORDED']){const amount=++i*10000,request=await db.tuitionRequest.create({data:{guardianId:ids.guardian,childId:ids.child,subject:'Maths',mode:'HOME',language:'English',locality:'Shankar Nagar',budgetPaise:400000,schedule:'Synthetic capture report'}}),placement=await db.placement.create({data:{requestId:request.id,guardianId:ids.guardian,childId:ids.child,teacherId:ids.teacher,monthlyPaise:300000}}),invoice=await db.invoice.create({data:{placementId:placement.id,payerId:ids.teacherAccount,amountPaise:amount,policyVersion:'synthetic-f20',status:'PAID'}}),order=mode==='UNRECORDED'?null:await db.checkoutOrder.create({data:{accountId:ids.teacherAccount,kind:'INVOICE',resourceId:invoice.id,amountPaise:amount,providerMode:mode,status:'PAID'}});await db.payment.create({data:{invoiceId:invoice.id,checkoutOrderId:order?.id,amountPaise:amount,providerEventId:'synthetic-report-'+randomUUID(),createdAt:new Date('2020-02-01T12:00:00Z')}});}
 const result=await c.call('/admin/reports/finance?from=2020-02-01T00%3A00%3A00Z&to=2020-02-02T00%3A00%3A00Z');assert.equal(result.status,200);assert(operationValidator('/admin/reports/finance','get','200')(result.data));assert.deepEqual(result.data.captureModes,[{providerMode:'LIVE',count:1,amountPaise:10000},{providerMode:'SANDBOX',count:1,amountPaise:20000},{providerMode:'UNRECORDED',count:1,amountPaise:30000}]);assert.deepEqual(result.data.captured,{count:3,amountPaise:60000});assert.equal(result.data.providerSettlementVerified,false);assert.equal(JSON.stringify(result.data).includes('providerEventId'),false);assert.equal(JSON.stringify(result.data).includes('accountId'),false);
});
