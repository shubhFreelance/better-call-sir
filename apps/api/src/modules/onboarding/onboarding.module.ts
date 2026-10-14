import {Module,Controller,Get,Post,Param,Req,Body,Inject} from '@nestjs/common';
import {Account} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,DB,parse,fail,text,version} from '../../shared';
import {intakeSchema,createIntake} from '../requests/requests.module';
import {applicationSchema,submitTeacher} from '../teachers/teachers.module';
const kindSchema=z.enum(['parent','teacher','student','enquiry']);
const childFields=['alias','grade','board','childId','schoolName','schoolSubjects'];
const studentDraft=z.object({subjects:z.array(z.enum(['Maths','Science'])).max(2).optional(),language:z.enum(['English','Hindi']).optional(),learningPreferences:text(500).optional()}).strict();
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
  } else state='ACTIVE';
  return {kind,state,draft,version:progress?.version||0,completedResourceId:progress?.completedResourceId||null};
 }

 @Post('onboarding/enquiry/restarts') async restart(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({expectedVersion:version}).strict(),body);
  await this.service.guardian(this.service.db,actor.id);
  return this.service.once(req,actor,'enquiry.restart',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   await this.service.guardian(db,actor.id);
   const current=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind:'ENQUIRY'}}});
   if(!current||current.version!==data.expectedVersion||!current.completedResourceId)fail(409,'CONFLICT','The enquiry changed or has an unfinished draft. Resume it before starting another.');
   await db.onboardingProgress.update({where:{id:current.id},data:{draft:{},completedResourceId:null,version:{increment:1}}});
   await this.service.audit(db,actor,req,'ENQUIRY_DRAFT_STARTED',actor.id,'Owner started another enquiry after submission');
   return this.result(db,actor,'ENQUIRY');
  });
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
   if(kind==='ENQUIRY')await this.service.guardian(db,actor.id);
   if((kind==='PARENT'||kind==='ENQUIRY')&&childFields.some(k=>k in data.draft))await this.service.guardian(db,actor.id);
   if((kind==='PARENT'||kind==='ENQUIRY')&&'childId' in data.draft&&data.draft.childId)await this.service.child(db,actor,data.draft.childId as string);
   if(kind==='STUDENT'){
    const child=await db.child.findUniqueOrThrow({where:{studentAccountId:actor.id}});await this.service.guardian(db,child.guardianId);
   }
   const current=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind}}});
   if((current?.version||0)!==data.expectedVersion||current?.completedResourceId)fail(409,'CONFLICT','The onboarding draft changed or was already submitted.');
   if(kind==='TEACHER'&&await db.teacher.findUnique({where:{accountId:actor.id}}))fail(409,'USE_PROFILE_REVISION','Use a versioned profile revision for an existing application.');
   if(current)await db.onboardingProgress.update({where:{id:current.id},data:{draft:data.draft,version:{increment:1}}});
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
