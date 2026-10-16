import {learnerProjection} from '../learners/learners.module';
import {subjectSchema} from '../../coverage';
import {Module,Controller,Get,Post,Param,Req,Body,Inject} from '@nestjs/common';
import {Account} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,DB,parse,fail,text,version} from '../../shared';
import {intakeSchema,createIntake} from '../requests/requests.module';
import {applicationSchema,submitTeacher} from '../teachers/teachers.module';
const kindSchema=z.enum(['parent','teacher','student','enquiry']);
const childFields=['alias','grade','board','childId','schoolName','schoolSubjects'];
const managementPreference=z.enum(['SELF_DIRECTED','GUARDIAN_GUIDED']);
const studentDraft=z.object({managementPreference:managementPreference.optional(),subjects:z.array(subjectSchema).max(20).refine(a=>new Set(a.map(s=>s.toLowerCase())).size===a.length,'Choose distinct subjects.').optional(),language:z.enum(['English','Hindi']).optional(),learningPreferences:text(500).optional()}).strict();
@Controller('api/v1')
class OnboardingController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 async principal(req:HttpRequest,kind:unknown){
  const parsed=parse(kindSchema,kind),actor=await this.service.actor(req,(parsed==='parent'||parsed==='enquiry')?['GUARDIAN']:parsed==='teacher'?['GUARDIAN','TEACHER']:['STUDENT']);
  return {kind:parsed.toUpperCase(),actor};
 }
 async result(db:DB,actor:Account,kind:string){
  const progress=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind}}});
  let state='DRAFT';let draft:unknown=progress?.draft||{};
  if(kind==='PARENT'||kind==='ENQUIRY'){
   const consent=await db.consent.findUnique({where:{guardianId:actor.id}});
   state=!actor.verified?'VERIFICATION_PENDING':!consent||consent.withdrawnAt?'CONSENT_PENDING':progress?.completedResourceId?'READY':'DRAFT';
   if(!actor.verified||!consent||consent.withdrawnAt){draft=Object.fromEntries(Object.entries(draft as Record<string,unknown>).filter(([k])=>!childFields.includes(k)));}
  } else if(kind==='TEACHER'){
   const teacher=await db.teacher.findUnique({where:{accountId:actor.id}});state=teacher?.status||'DRAFT';
  } else state=progress?.completedResourceId?'READY':'ACTIVE';
  return {kind,state,draft,version:progress?.version||0,completedResourceId:progress?.completedResourceId||null};
 }

 @Post('onboarding/enquiry/restarts') async restart(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({expectedVersion:version}).strict(),body);
  await this.service.guardian(this.service.db,actor.id);
  return this.service.once(req,actor,'enquiry.restart',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   if((await db.account.findUniqueOrThrow({where:{id:actor.id}})).role!==actor.role)fail(409,'ACCOUNT_CHANGED','Your account changed. Sign in again before continuing.');
   await this.service.guardian(db,actor.id);
   const current=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind:'ENQUIRY'}}});
   if(!current||current.version!==data.expectedVersion||!current.completedResourceId)fail(409,'CONFLICT','The enquiry changed or has an unfinished draft. Resume it before starting another.');
   await db.onboardingProgress.update({where:{id:current.id},data:{draft:{},completedResourceId:null,version:{increment:1}}});
   await this.service.audit(db,actor,req,'ENQUIRY_DRAFT_STARTED',actor.id,'Owner started another enquiry after submission');
   return this.result(db,actor,'ENQUIRY');
  });
 }
 @Post('onboarding/:kind/discards') async discard(@Req() req:HttpRequest,@Param('kind') route:string,@Body() body:unknown){
  const kind=parse(z.enum(['parent','enquiry']),route).toUpperCase(),actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({expectedVersion:version,acknowledged:z.literal(true)}).strict(),body);
  await this.service.guardian(this.service.db,actor.id);
  return this.service.once(req,actor,'onboarding.discard',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   if((await db.account.findUniqueOrThrow({where:{id:actor.id}})).role!==actor.role)fail(409,'ACCOUNT_CHANGED','Your account changed. Sign in again before continuing.');
   await this.service.guardian(db,actor.id);
   const current=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind}}});
   if(!current||current.version!==data.expectedVersion||current.completedResourceId)fail(409,'CONFLICT','The saved draft changed or was submitted. Reload it before deciding.');
   await db.onboardingProgress.update({where:{id:current.id},data:{draft:{},version:{increment:1}}});
   await this.service.audit(db,actor,req,'ONBOARDING_DRAFT_DISCARDED',actor.id,'Owner explicitly discarded an unfinished draft',undefined,{kind});
   return this.result(db,actor,kind);
  });
 }
 @Get('onboarding/student/context') async studentContext(@Req() req:HttpRequest){
  const actor=await this.service.actor(req,['STUDENT']);
  return this.service.db.$transaction(async db=>{
   const child=await db.child.findUniqueOrThrow({where:{studentAccountId:actor.id}});
   await this.service.guardian(db,child.guardianId);
   return {learner:learnerProjection(child),progress:await this.result(db,actor,'STUDENT'),authority:'GUARDIAN_MANAGED'};
  });
 }
 @Post('onboarding/student/confirmations') async confirmStudent(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['STUDENT']),data=parse(z.object({expectedVersion:z.number().int().nonnegative(),educationVersion:version,confirmed:z.literal(true),draft:studentDraft.extend({managementPreference})}).strict(),body);
  return this.service.once(req,actor,'student.onboarding.confirm',data,async db=>{
   const linked=await db.child.findUniqueOrThrow({where:{studentAccountId:actor.id}});
   await this.service.guardian(db,linked.guardianId);
   const child=await db.child.findUniqueOrThrow({where:{id:linked.id}});
   if(child.studentAccountId!==actor.id||child.studentAccessRevokedAt)fail(401,'STUDENT_ACCESS_REVOKED','Guardian authorization is no longer active.');
   if(child.version!==data.educationVersion)fail(409,'LEARNER_CHANGED','Your education profile changed. Reload and review the current details.');
   if(!learnerProjection(child).enquiryEligible)fail(409,'EDUCATION_INCOMPLETE','Ask your guardian to complete your education details before confirming setup.');
   const current=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind:'STUDENT'}}});
   if((current?.version||0)!==data.expectedVersion)fail(409,'CONFLICT','Your saved setup changed. Reload and review it again.');
   const saved={draft:data.draft,completedResourceId:child.id};
   const progress=current?await db.onboardingProgress.update({where:{id:current.id},data:{...saved,version:{increment:1}}}):await db.onboardingProgress.create({data:{accountId:actor.id,kind:'STUDENT',...saved}});
   await this.service.audit(db,actor,req,'STUDENT_ONBOARDING_CONFIRMED',child.id,'Student reviewed education and learning support preferences',undefined,{educationVersion:child.version,setupVersion:progress.version,managementPreference:data.draft.managementPreference,authority:'GUARDIAN_MANAGED'});
   return this.result(db,actor,'STUDENT');
  });
 }
 @Get('onboarding/guardian') async guardianSetup(@Req() req:HttpRequest){
  const actor=await this.service.actor(req,['GUARDIAN']);
  return this.service.db.$transaction(async db=>{
   const account=await db.account.findUniqueOrThrow({where:{id:actor.id}}),consent=await db.consent.findUnique({where:{guardianId:actor.id}});
   const paused=!!await db.privacyRequest.findFirst({where:{accountId:actor.id,kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'},select:{id:true}});
   const gate=!account.verified?'VERIFICATION_REQUIRED':paused?'PRIVACY_PAUSED':!consent||consent.withdrawnAt?'CONSENT_REQUIRED':'READY';
   if(gate!=='READY')return {name:account.name,gate,learnerCount:null,enquiryStatus:null};
   const [learnerCount,progress,requests]=await Promise.all([
    db.child.count({where:{guardianId:actor.id,schoolName:{not:null},schoolSubjects:{isEmpty:false},OR:[{educationStage:{not:'COLLEGE'}},{courseName:{not:null},university:{not:null},studyYear:{not:null}}]}}),
    db.onboardingProgress.findMany({where:{accountId:actor.id,kind:{in:['PARENT','ENQUIRY']}},select:{draft:true,completedResourceId:true}}),
    db.tuitionRequest.count({where:{guardianId:actor.id}}),
   ]);
   const enquiryStatus=progress.some(p=>!p.completedResourceId&&Object.keys(p.draft as object).length)?'DRAFT':requests?'SUBMITTED':'NOT_STARTED';
   return {name:account.name,gate,learnerCount,enquiryStatus};
  },{isolationLevel:'RepeatableRead'});
 }
 @Get('onboarding/:kind') async get(@Req() req:HttpRequest,@Param('kind') route:string){
  const {kind,actor}=await this.principal(req,route);return this.service.db.$transaction(db=>this.result(db,actor,kind));
 }
 @Post('onboarding/:kind/drafts') async save(@Req() req:HttpRequest,@Param('kind') route:string,@Body() body:unknown){
  const {kind,actor}=await this.principal(req,route);
  const schema=(kind==='PARENT'||kind==='ENQUIRY')?intakeSchema.partial():kind==='TEACHER'?applicationSchema.partial():studentDraft;
  const data=parse(z.object({expectedVersion:z.number().int().nonnegative(),draft:schema}).strict(),body);
  if(kind==='ENQUIRY')await this.service.guardian(this.service.db,actor.id);
  return this.service.once(req,actor,'onboarding.save',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   if((await db.account.findUniqueOrThrow({where:{id:actor.id}})).role!==actor.role)fail(409,'ACCOUNT_CHANGED','Your account changed. Sign in again before continuing.');
   if(kind==='ENQUIRY')await this.service.guardian(db,actor.id);
   if((kind==='PARENT'||kind==='ENQUIRY')&&childFields.some(k=>k in data.draft))await this.service.guardian(db,actor.id);
   if((kind==='PARENT'||kind==='ENQUIRY')&&'childId' in data.draft&&data.draft.childId)await this.service.child(db,actor,data.draft.childId as string);
   if(kind==='STUDENT'){
    const child=await db.child.findUniqueOrThrow({where:{studentAccountId:actor.id}});await this.service.guardian(db,child.guardianId);
    const currentChild=await db.child.findUniqueOrThrow({where:{id:child.id}});if(currentChild.studentAccessRevokedAt||currentChild.studentAccountId!==actor.id)fail(401,'STUDENT_ACCESS_REVOKED','Guardian authorization is no longer active.');
   }
   const current=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind}}});
   if((current?.version||0)!==data.expectedVersion||(kind!=='STUDENT'&&current?.completedResourceId))fail(409,'CONFLICT','The onboarding draft changed or was already submitted.');
   if(kind==='TEACHER'&&await db.teacher.findUnique({where:{accountId:actor.id}}))fail(409,'USE_PROFILE_REVISION','Use a versioned profile revision for an existing application.');
   if(current)await db.onboardingProgress.update({where:{id:current.id},data:{draft:data.draft,...(kind==='STUDENT'?{completedResourceId:null}:{}),version:{increment:1}}});
   else await db.onboardingProgress.create({data:{accountId:actor.id,kind,draft:data.draft}});
   await this.service.audit(db,actor,req,'ONBOARDING_DRAFT_SAVED',actor.id,'Owner saved onboarding progress',undefined,{kind});
   return this.result(db,actor,kind);
  });
 }
 @Post('onboarding/:kind/completions') async complete(@Req() req:HttpRequest,@Param('kind') route:string,@Body() body:unknown){
  const {kind,actor}=await this.principal(req,route);if(kind==='STUDENT')fail(409,'GUARDIAN_AUTHORIZATION_REQUIRED','Student activation is controlled by the guardian.');
  const data=parse(z.object({expectedVersion:version}).strict(),body);
  if(kind==='ENQUIRY')await this.service.guardian(this.service.db,actor.id);
  return this.service.once(req,actor,'onboarding.complete',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   if((await db.account.findUniqueOrThrow({where:{id:actor.id}})).role!==actor.role)fail(409,'ACCOUNT_CHANGED','Your account changed. Sign in again before continuing.');
   if(kind==='ENQUIRY')await this.service.guardian(db,actor.id);
   const progress=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind}}});
   if(!progress||progress.version!==data.expectedVersion||progress.completedResourceId)fail(409,'CONFLICT','The draft changed or was already submitted.');
   const resource=(kind==='PARENT'||kind==='ENQUIRY')?await createIntake(db,this.service,actor,req,parse(intakeSchema,progress.draft)):await submitTeacher(db,this.service,actor,parse(applicationSchema,progress.draft));
   await db.onboardingProgress.update({where:{id:progress.id},data:{completedResourceId:resource.id,draft:{},version:{increment:1}}});
   await this.service.audit(db,actor,req,'ONBOARDING_SUBMITTED',resource.id,'Owner completed saved onboarding',undefined,{kind});
   return this.result(db,actor,kind);
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[OnboardingController]})
export class OnboardingModule{}
