import {Module,Controller,Get,Post,Req,Body,Inject} from '@nestjs/common';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,DB,hash,parse,fail,privileged} from '../../shared';
import {newMfaSecret,encryptMfa,decryptMfa,matchingStep} from './totp';
const input=z.object({code:z.string().regex(/^(\d{6}|[A-Za-z0-9_-]{22})$/)}).strict();
@Controller('api/v1')
class MfaController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 async identity(req:HttpRequest){const actor=await this.service.actor(req);if(!privileged(actor.role))fail(403,'FORBIDDEN','Authenticator verification is reserved for staff accounts.');const session=await this.service.db.session.findUniqueOrThrow({where:{accessHash:hash(req.cookies.bcs_access)}});return {actor,session};}
 @Get('auth/mfa') async status(@Req() req:HttpRequest){const {actor,session}=await this.identity(req),credential=await this.service.db.mfaCredential.findUnique({where:{accountId:actor.id}});return {enabled:!!credential?.enabledAt,verifiedUntil:session.mfaVerifiedAt?new Date(session.mfaVerifiedAt.getTime()+600000):null,recoveryCodesRemaining:credential?.recoveryHashes.length||0};}
 @Post('auth/mfa/enrollment') async enroll(@Req() req:HttpRequest,@Body() body:unknown){
  parse(z.object({}).strict(),body);const {actor,session}=await this.identity(req);
  if(session.createdAt.getTime()<Date.now()-300000)fail(401,'RECENT_LOGIN_REQUIRED','Sign in again before setting up your authenticator.');
  await this.service.limit('mfa-enroll:'+actor.id,5);
  return this.service.db.$transaction(async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id+':mfa'},0))`;
   const existing=await db.mfaCredential.findUnique({where:{accountId:actor.id}});if(existing?.enabledAt)fail(409,'MFA_ALREADY_ENABLED','Your authenticator is already enabled.');
   if(existing?.enrollmentExpiresAt&&existing.enrollmentExpiresAt>new Date()&&existing.enrollmentFamilyId!==session.familyId)fail(409,'ENROLLMENT_IN_PROGRESS','Another sign-in has pending enrollment. Wait for its ten-minute expiry.');
   let secret:string;
   try{secret=existing?.enrollmentExpiresAt&&existing.enrollmentExpiresAt>new Date()?decryptMfa(existing.encryptedSecret,actor.id):newMfaSecret();const encrypted=encryptMfa(secret,actor.id);await db.mfaCredential.upsert({where:{accountId:actor.id},create:{accountId:actor.id,encryptedSecret:encrypted,enrollmentFamilyId:session.familyId,enrollmentExpiresAt:new Date(Date.now()+600000)},update:{encryptedSecret:encrypted,enrollmentFamilyId:session.familyId,enrollmentExpiresAt:new Date(Date.now()+600000)}});}catch{fail(503,'MFA_UNAVAILABLE','Authenticator setup is unavailable. Contact your administrator.');}
   await this.service.audit(db,actor,req,'MFA_ENROLLMENT_STARTED',actor.id,'Staff initiated authenticator enrollment');
   return {secret,otpauthUri:`otpauth://totp/${encodeURIComponent('Better Call Sir:'+actor.name)}?secret=${secret}&issuer=Better%20Call%20Sir&algorithm=SHA1&digits=6&period=30`,expiresIn:600};
  });
 }
 @Post('auth/mfa/verification') async verify(@Req() req:HttpRequest,@Body() body:unknown){
  const {actor,session}=await this.identity(req),data=parse(input,body);await this.service.limit('mfa-verify:'+actor.id,5);
  const result=await this.service.db.$transaction(async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id+':mfa'},0))`;
   const credential=await db.mfaCredential.findUnique({where:{accountId:actor.id}});if(!credential)return null;
   const current=await db.session.findUniqueOrThrow({where:{id:session.id}});if(current.revoked||current.rotated||current.expiresAt<=new Date())return null;
   if(!credential.enabledAt&&(credential.enrollmentFamilyId!==session.familyId||!credential.enrollmentExpiresAt||credential.enrollmentExpiresAt<=new Date()))return null;
   let step:bigint|null=null,recovery=false;
   if(/^\d{6}$/.test(data.code)){try{step=matchingStep(decryptMfa(credential.encryptedSecret,actor.id),data.code,credential.lastUsedStep);}catch{fail(503,'MFA_UNAVAILABLE','Authenticator verification is unavailable. Contact your administrator.');}if(step===null)return null;}
   else {recovery=!!credential.enabledAt&&credential.recoveryHashes.includes(hash(data.code));if(!recovery)return null;}
   const recoveryCodes=credential.enabledAt?[]:Array.from({length:8},()=>randomBytes(16).toString('base64url'));
   await db.mfaCredential.update({where:{accountId:actor.id},data:{enabledAt:credential.enabledAt||new Date(),enrollmentFamilyId:null,enrollmentExpiresAt:null,...(step!==null?{lastUsedStep:step}:{}),recoveryHashes:recoveryCodes.length?recoveryCodes.map(hash):recovery?credential.recoveryHashes.filter(x=>x!==hash(data.code)):credential.recoveryHashes}});
   if(recovery)await db.session.updateMany({where:{accountId:actor.id,familyId:{not:session.familyId}},data:{revoked:true}});
   const verifiedAt=new Date();await db.session.update({where:{id:session.id},data:{mfaVerifiedAt:verifiedAt,lastSeenAt:verifiedAt}});
   await this.service.audit(db,actor,req,recovery?'MFA_RECOVERY_USED':'MFA_VERIFIED',actor.id,recovery?'Single-use recovery code consumed; other session families revoked':'Staff verified their authenticator');
   return {verifiedUntil:new Date(verifiedAt.getTime()+600000),recoveryCodes};
  });
  if(!result)fail(401,'INVALID_MFA','The code is invalid, expired or already used. Use a new authenticator code.');return result;
 }
 @Post('auth/mfa/recovery-codes') async recoveryCodes(@Req() req:HttpRequest,@Body() body:unknown){
  const {actor,session}=await this.identity(req),data=parse(z.object({code:z.string().regex(/^\d{6}$/)}).strict(),body);await this.service.limit('mfa-verify:'+actor.id,5);
  return this.service.db.$transaction(async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id+':mfa'},0))`;
   const credential=await db.mfaCredential.findUnique({where:{accountId:actor.id}});if(!credential?.enabledAt)fail(409,'MFA_REQUIRED','Enable an authenticator first.');
   let step;try{step=matchingStep(decryptMfa(credential.encryptedSecret,actor.id),data.code,credential.lastUsedStep);}catch{fail(503,'MFA_UNAVAILABLE','Authenticator verification is unavailable. Contact your administrator.');}if(step===null)fail(401,'INVALID_MFA','Use a new authenticator code.');
   const codes=Array.from({length:8},()=>randomBytes(16).toString('base64url'));
   await db.mfaCredential.update({where:{accountId:actor.id},data:{lastUsedStep:step,recoveryHashes:codes.map(hash)}});await this.service.audit(db,actor,req,'MFA_RECOVERY_CODES_REPLACED',actor.id,'Staff replaced all previous recovery codes');return {recoveryCodes:codes};
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[MfaController]})
export class MfaModule{}
