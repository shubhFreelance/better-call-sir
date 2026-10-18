// Restricted operator tooling: no key material, authenticator secrets or recovery codes are printed.
import {lstatSync,readFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {mfaKeys} from '../apps/api/src/modules/identity/mfa-keys';
import {encryptMfa,decryptMfa} from '../apps/api/src/modules/identity/totp';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:30000})});
async function main(){
 const mode=process.argv[2],ref=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,119}$/).parse(process.env.STAFF_SECURITY_REVIEW_REF);
 if(mode==='rewrap'){
  if(!process.env.MFA_KEYRING_FILE||!mfaKeys().activeId)throw Error();
  const actorId=z.uuid().parse(process.env.STAFF_SECURITY_ACTOR_ID),actor=await db.account.findUnique({where:{id:actorId}});if(!actor||actor.disabled||actor.role!=='ADMIN')throw Error();
  // All rows commit together: unavailable old keys or invalid ciphertext leave credentials unchanged.
  const count=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-key-rewrap',0))`;const rows=await tx.mfaCredential.findMany({take:10001});if(rows.length>10000)throw Error();for(const row of rows){const encrypted=encryptMfa(decryptMfa(row.encryptedSecret,row.accountId),row.accountId);const result=await tx.mfaCredential.updateMany({where:{accountId:row.accountId,encryptedSecret:row.encryptedSecret},data:{encryptedSecret:encrypted}});if(result.count!==1)throw Error();}await tx.audit.create({data:{actorId,action:'MFA_KEYS_REWRAPPED',aggregateId:'mfa-keyring',reason:ref,requestId:randomUUID(),after:{count:rows.length,activeKeyId:mfaKeys().activeId}}});return rows.length;},{timeout:30000});
  console.log(JSON.stringify({status:'REWRAPPED',count}));return;
 }
 if(mode==='bootstrap'){
  if(process.env.STAFF_BOOTSTRAP_CONFIRM!=='INITIAL_THREE_ADMINS_NO_EXISTING_STAFF'||!process.env.MFA_KEYRING_FILE)throw Error();mfaKeys();
  const file=process.argv[3],stat=lstatSync(file);if(!stat.isFile()||(stat.mode&0o077)||stat.size>8192)throw Error();
  const input=z.object({reviewers:z.array(z.string().min(3).max(120)).length(2),admins:z.array(z.object({email:z.email().max(254).transform(x=>x.toLowerCase()),name:z.string().trim().min(1).max(80),region:z.string().trim().min(1).max(80)}).strict()).length(3)}).strict().parse(JSON.parse(readFileSync(file,'utf8')));
  if(new Set(input.reviewers).size!==2||new Set(input.admins.map(a=>a.email)).size!==3)throw Error();
  await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-administration',0))`;if(await tx.account.count({where:{role:{in:['ADMIN','OPERATOR','REVIEWER','FINANCE']}}}))throw Error();let actorId='';for(const data of input.admins){const account=await tx.account.create({data:{...data,role:'ADMIN',authVersion:1}});actorId ||= account.id;}await tx.audit.create({data:{actorId,action:'STAFF_INITIAL_BOOTSTRAP',aggregateId:'staff',reason:ref,requestId:randomUUID(),after:{reviewers:input.reviewers,accounts:3}}});});
  console.log(JSON.stringify({status:'BOOTSTRAPPED',accounts:3}));return;
 }
 throw Error();
}
main().catch(()=>{console.error('Staff security operation failed safely. Check the restricted configuration and review record.');process.exitCode=1;}).finally(()=>db.$disconnect());
