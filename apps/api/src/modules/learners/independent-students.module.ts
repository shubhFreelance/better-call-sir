import {Module,Controller,Get,Post,Req,Body,Inject} from '@nestjs/common';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,DB,version,parse,fail} from '../../shared';
import {learnerEducation} from './learners.module';

const policyVersion='independent-student-development-v1';
export const independentEducation=learnerEducation.refine(e=>e.stage!=='EARLY_YEARS','Use guardian setup for nursery and kindergarten learners.');
const signup=z.object({education:independentEducation,managementPreference:z.literal('SELF_DIRECTED'),adultDeclaration:z.literal(true),consentAccepted:z.literal(true),policyVersion:z.literal(policyVersion)}).strict();
const update=z.object({education:independentEducation,expectedVersion:version,confirmed:z.literal(true)}).strict();
async function unusedAccount(db:DB,accountId:string){
 const account=await db.account.findUniqueOrThrow({where:{id:accountId}});
 if(account.role!=='GUARDIAN'||account.verified||!account.email||account.disabled)return false;
 return !await db.consent.count({where:{guardianId:accountId}})&&!await db.child.count({where:{OR:[{guardianId:accountId},{studentAccountId:accountId}]}})&&!await db.teacher.count({where:{accountId}})&&!await db.onboardingProgress.count({where:{accountId}})&&!await db.privacyRequest.count({where:{accountId}})&&!await db.supportCase.count({where:{accountId}});
}
export async function independentProfile(db:DB,accountId:string){
 const item=await db.independentStudentProfile.findUnique({where:{accountId}});
 if(!item)fail(404,'NOT_FOUND','Independent student profile not found.');
 const paused=!!await db.privacyRequest.count({where:{accountId,kind:'DELETION',scope:'ACCOUNT',status:'PENDING'}});
 return {accountId:item.accountId,education:item.education,managementPreference:item.managementPreference,adultStatus:'SELF_DECLARED_18_PLUS',policyVersion:item.policyVersion,consentedAt:item.consentedAt,version:item.version,editStatus:paused?'PRIVACY_PAUSED':'EDITABLE'};
}
@Controller('api/v1')
class IndependentStudentsController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('independent-student/signup') async context(@Req() req:HttpRequest){
  const actor=await this.service.actor(req,['GUARDIAN','INDEPENDENT_STUDENT']);
  return this.service.db.$transaction(async db=>actor.role==='INDEPENDENT_STUDENT'?{status:'COMPLETE',profile:await independentProfile(db,actor.id)}:{status:await unusedAccount(db,actor.id)?'READY':'ACCOUNT_IN_USE',profile:null},{isolationLevel:'RepeatableRead'});
 }
 @Post('independent-student/signup') async signup(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','INDEPENDENT_STUDENT']),data=parse(signup,body);
  return this.service.once(req,actor,'independent-student.signup',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   if(await db.independentStudentProfile.count({where:{accountId:actor.id}}))fail(409,'ALREADY_REGISTERED','Your student account is already set up. Open your profile.');
   if(!await unusedAccount(db,actor.id))fail(409,'ACCOUNT_IN_USE','This account already has another setup. Use a separate student email address.');
   await db.account.update({where:{id:actor.id},data:{role:'INDEPENDENT_STUDENT'}});
   await db.independentStudentProfile.create({data:{accountId:actor.id,education:data.education,policyVersion}});
   await this.service.audit(db,actor,req,'INDEPENDENT_STUDENT_SIGNED_UP',actor.id,'Email account owner declared adulthood, self-management and own-data consent',undefined,{policyVersion,ageEvidence:'SELF_DECLARATION_ONLY'});
   return independentProfile(db,actor.id);
  });
 }
 @Get('independent-student/profile') async read(@Req() req:HttpRequest){
  const actor=await this.service.actor(req,['INDEPENDENT_STUDENT']);
  return independentProfile(this.service.db,actor.id);
 }
 @Post('independent-student/profile/updates') async update(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['INDEPENDENT_STUDENT']),data=parse(update,body);
  return this.service.once(req,actor,'independent-student.update',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   const account=await db.account.findUniqueOrThrow({where:{id:actor.id}});
   if(account.disabled||account.role!=='INDEPENDENT_STUDENT')fail(401,'SESSION_REVOKED','This account is unavailable.');
   const current=await independentProfile(db,actor.id);
   if(current.editStatus==='PRIVACY_PAUSED')fail(403,'PRIVACY_PENDING','Profile changes are paused while your deletion request is reviewed.');
   if(current.version!==data.expectedVersion)fail(409,'CONFLICT','Your profile changed. Reload before saving again.');
   await db.independentStudentProfile.update({where:{accountId:actor.id},data:{education:data.education,version:{increment:1}}});
   await this.service.audit(db,actor,req,'INDEPENDENT_STUDENT_PROFILE_UPDATED',actor.id,'Student updated their own education profile',undefined,{version:current.version+1});
   return independentProfile(db,actor.id);
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[IndependentStudentsController]})
export class IndependentStudentsModule {}
