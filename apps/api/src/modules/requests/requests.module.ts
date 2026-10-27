import {createDirectEnquiry} from '../direct-enquiries/direct-enquiries.module';
import {learningAuthority,requestAuthority} from '../learners/learning-management';
import {requireLearningSpace} from '../learners/learning-spaces';
import {guardianProof,linkVerifiedLearner} from '../verification/guardian-verification';
import {enabledRegion} from '../administration/commercial-policy';
import {pageQuery,pageBefore,pageResult} from '../../pagination';
import {subjectSchema,boardSchema,learnerScope,covers} from '../../coverage';
import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module, Controller, Get, Post, Param, Query, Body, Req, Res, Injectable, Inject, HttpException, Catch, ExceptionFilter, ArgumentsHost, Global} from '@nestjs/common';
import {Prisma, PrismaClient, Account} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z} from 'zod';
import {eligible, placementFee, verifiedAttendance, revisionRefund, window30} from '../../policies';

import {schoolSubjects} from '../teachers/details';
import {matched} from '../matching/eligibility';
import {preferenceSchema,preferenceUpdateSchema,normalizedPreferences} from './request-schedule';
import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,HttpRequest,DB} from '../../shared';

const waitlistCommon={subject:subjectSchema,language:z.string().trim().transform(v=>v.toLowerCase()==='english'?'English':v.toLowerCase()==='hindi'?'Hindi':v).pipe(z.enum(['English','Hindi'])),mode:z.enum(['HOME','ONLINE']),region:text(80)};
const waitlistSchema=z.preprocess(v=>v&&typeof v==='object'?{stage:'SCHOOL',...v}:v,z.discriminatedUnion('stage',[
 z.object({...waitlistCommon,stage:z.literal('SCHOOL'),grade:z.number().int().min(1).max(12),board:boardSchema}).strict(),
 z.object({...waitlistCommon,stage:z.literal('EARLY_YEARS'),level:z.enum(['NURSERY','KG1','KG2'])}).strict(),
 z.object({...waitlistCommon,stage:z.literal('COLLEGE'),courseName:text(160),studyYear:z.number().int().min(1).max(10)}).strict(),
]));
export const intakeSchema=z.object({schoolName:text(160).optional(),schoolSubjects:schoolSubjects.optional(),discoveryMethod:z.enum(['MANUAL','ASSISTED']).default('ASSISTED'),preferredTeacherId:uuid.optional(),childId:uuid.optional(),alias:text(40),grade:z.number().int().min(1).max(12).nullable().optional(),board:boardSchema.nullable().optional(),subject:subjectSchema,mode:z.enum(['ONLINE','HOME']),language:z.enum(['English','Hindi']),locality:text(80),budgetPaise:z.number().int().min(50_000).max(2_000_000),schedule:text(300),preferences:preferenceSchema.optional()}).strict();
export async function createIntake(db:DB,service:AppService,account:Account,req:HttpRequest,data:z.infer<typeof intakeSchema>, initiator:Account=account) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
      await service.guardian(db,account.id);
      if(data.discoveryMethod==='MANUAL'?!data.preferredTeacherId:!!data.preferredTeacherId)fail(400,'INVALID_DISCOVERY_PATH','Direct search requires a chosen teacher; assisted search uses the eligible pool.');
      if(!await enabledRegion(db,account.region))fail(409,'UNSUPPORTED_REGION','This city is not enabled; use the unsupported-scope waitlist.');
      const preferences=data.preferences?normalizedPreferences(data.preferences):null;if(data.preferences&&!preferences)fail(400,'INVALID_SCHEDULE','Choose nonoverlapping weekly time ranges of at least 20 minutes, or dated 20–120 minute windows between one hour and 60 days ahead.');
      if(data.preferredTeacherId&&!((await service.publicTeachers({id:data.preferredTeacherId},1))[0]))fail(404,'NOT_FOUND','Selected teacher is unavailable.');
      if(!data.childId&&(!data.grade||!data.board||!data.schoolName||!data.schoolSubjects))fail(400,'LEARNER_DETAILS_REQUIRED','Enter the school and subjects studied in the class.');
      const proof=data.childId?null:await guardianProof(db,account.id,data.alias);
      const child=data.childId?await service.child(db,account,data.childId):await db.child.create({data:{guardianId:account.id,alias:data.alias,grade:data.grade,board:data.board,schoolName:data.schoolName,schoolSubjects:data.schoolSubjects}});
      if(!data.childId)await linkVerifiedLearner(db,proof,child.id);
      if(data.childId)await requireLearningSpace(db,child,data.subject);
      else await db.child.update({where:{id:child.id},data:{learningSpaces:[{subject:data.subject,language:data.language}],learningSpacesVersion:1}});
      if((data.grade!==undefined&&child.grade!==data.grade)||(data.board!==undefined&&child.board!==data.board))fail(409,"CHILD_CHANGED","The linked learner grade or board differs from this request.");
      if(data.childId&&(data.schoolName||data.schoolSubjects)){
       if(!data.schoolName||!data.schoolSubjects)fail(400,'LEARNER_DETAILS_REQUIRED','Supply both school and class subjects.');
       if(child.schoolName&&(child.schoolName!==data.schoolName||JSON.stringify(child.schoolSubjects)!==JSON.stringify(data.schoolSubjects)))fail(409,'CHILD_CHANGED','The learner school details changed; review the current record.');
       if(!child.schoolName)await db.child.update({where:{id:child.id},data:{schoolName:data.schoolName,schoolSubjects:data.schoolSubjects,version:{increment:1}}});
      }
      if(!learnerScope(child,data.subject))fail(409,'LEARNER_DETAILS_REQUIRED','Complete the learner education profile before requesting a teacher.');
      if(data.preferredTeacherId){
       await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.preferredTeacherId},0))`;
       const teacher=await db.teacher.findUniqueOrThrow({where:{id:data.preferredTeacherId}});
       if(!covers(teacher,child,data.subject))fail(409,'TEACHER_UNAVAILABLE',"Selected teacher does not teach this subject for the learner's education level. Choose another teacher.");
      }
      const request=await db.tuitionRequest.create({data:{discoveryMethod:data.discoveryMethod,preferredTeacherId:data.preferredTeacherId,region:account.region,...(preferences?{schedulePreferences:preferences,scheduleStatus:'CONFIRMED'}:{}),guardianId:account.id,childId:child.id,subject:data.subject,mode:data.mode,language:data.language,locality:data.locality,budgetPaise:data.budgetPaise,schedule:data.schedule}});
      if(data.discoveryMethod==='MANUAL'&&data.preferredTeacherId)await createDirectEnquiry(db,{kind:'GUARDIAN',sourceId:request.id,ownerId:account.id,childId:child.id,teacherId:data.preferredTeacherId,region:request.region});
      await service.audit(db,initiator,req,'REQUEST_CREATED',request.id,'Family member submitted supported tuition need',undefined,{region:request.region,scheduleStatus:request.scheduleStatus});await service.event(db,'request.created',request.id);return request;
}

@Controller('api/v1')
class RequestsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('requests') async createRequest(@Req() req: HttpRequest,@Body() body: unknown) {
    const account=await this.service.actor(req,['GUARDIAN','STUDENT']);
    const data=parse(intakeSchema,body);
    if(account.role==='STUDENT'&&!data.childId)fail(400,'LEARNER_REQUIRED','Choose your existing learner profile.');
    const authorize=async(db:DB)=>account.role==='STUDENT'?learningAuthority(db,this.service,account,data.childId!,true):this.service.guardian(db,account.id);
    return this.service.once(req,account,'request.create',data,async db=>{
      const child=account.role==='STUDENT'?await learningAuthority(db,this.service,account,data.childId!,true):null;
      const owner=child?await db.account.findUniqueOrThrow({where:{id:child.guardianId}}):account;
      return createIntake(db,this.service,owner,req,data,account);
    },authorize);
  }

  @Post('requests/:id/schedules') async schedule(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']);const data=parse(preferenceUpdateSchema,body);const preferences=normalizedPreferences(data);if(!preferences)fail(400,'INVALID_SCHEDULE','Choose valid nonoverlapping weekly ranges, or future dated windows.');
    return this.service.once(req,actor,'request.schedule',data,async db=>{const request=await requestAuthority(db,this.service,actor,id,true);const changed=await db.tuitionRequest.updateMany({where:{id,version:data.expectedVersion,status:'OPEN'},data:{schedulePreferences:preferences,scheduleStatus:'CONFIRMED',matchStatus:'PENDING',selectedCandidateId:null,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Request changed or is not open.');await db.recommendation.updateMany({where:{requestId:id},data:{presentedAt:null,expiresAt:new Date(),version:{increment:1}}});await this.service.audit(db,actor,req,'REQUEST_SCHEDULE_CONFIRMED',id,'Authorized family member confirmed structured schedule',undefined,{timezone:preferences.timezone,windows:"weekly" in preferences?preferences.weekly!.length:preferences.slots!.length});await this.service.event(db,'request.schedule_confirmed',id,data.expectedVersion+1);return db.tuitionRequest.findUniqueOrThrow({where:{id}});},db=>requestAuthority(db,this.service,actor,id,true));
  }
  @Post('waitlist') async waitlist(@Req() req:HttpRequest,@Body() body:unknown){
    const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(waitlistSchema,body);
    return this.service.once(req,actor,'waitlist.create',data,async db=>{await this.service.guardian(db,actor.id);const region=await db.region.findFirst({where:{id:{equals:data.region,mode:'insensitive'}}});if(region?.enabled)fail(409,'SUPPORTED_SCOPE','Use an ordinary tuition enquiry in supported regions. An enquiry does not promise teacher supply.');const entry=await db.waitlist.create({data:{guardianId:actor.id,educationStage:data.stage,grade:data.stage==='SCHOOL'?data.grade:null,board:data.stage==='SCHOOL'?data.board:null,earlyYearsLevel:data.stage==='EARLY_YEARS'?data.level:null,courseName:data.stage==='COLLEGE'?data.courseName:null,studyYear:data.stage==='COLLEGE'?data.studyYear:null,subject:data.subject,language:data.language,mode:data.mode,region:region?.id||data.region}});await this.service.audit(db,actor,req,'WAITLIST_CREATED',entry.id,'Guardian requested future region coverage without learner identity');return entry;});
  }
  @Get('waitlist') async listWaitlist(@Req() req:HttpRequest,@Query() query:unknown){
    const actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict(),query),db=this.service.db;
    const anchor=data.cursor?await db.waitlist.findFirst({where:{id:data.cursor,guardianId:actor.id},select:{createdAt:true,id:true}}):null;
    if(data.cursor&&!anchor)fail(404,'NOT_FOUND','Waitlist cursor is unavailable.');
    const rows=await db.waitlist.findMany({where:{guardianId:actor.id,...(anchor?{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),items=rows.slice(0,data.limit);
    return {items,nextCursor:rows.length>data.limit?items.at(-1)!.id:null};
  }

  @Get('requests') async requests(@Req() req: Request,@Query() query:unknown) {
    const account=await this.service.actor(req,['GUARDIAN','STUDENT','ADMIN','OPERATOR']),data=parse(pageQuery.extend({status:z.enum(['OPEN','PLACED','CLOSED','MATCHED']).optional()}),query),where={...(account.role==='GUARDIAN'?{guardianId:account.id}:account.role==='STUDENT'?{childId:(await this.db.child.findUniqueOrThrow({where:{studentAccountId:account.id}})).id}:account.role==='OPERATOR'?{region:account.region}:{}),...(data.status?{status:data.status}:{})};
    if(account.role==='STUDENT'){const child=await this.db.child.findUniqueOrThrow({where:{studentAccountId:account.id}});await learningAuthority(this.db,this.service,account,child.id);}
    const anchor=data.cursor?await this.db.tuitionRequest.findFirst({where:{...where,id:data.cursor},select:{id:true,createdAt:true}}):null;
    if(data.cursor&&!anchor)fail(404,'NOT_FOUND','Request cursor is unavailable.');
    return pageResult(await this.db.tuitionRequest.findMany({where:{...where,...pageBefore(anchor)},orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),data.limit);
  }

  @Get('requests/:id') async request(@Req() req: Request,@Param('id') id: string) {
    parse(uuid,id);const account=await this.service.actor(req,['GUARDIAN','STUDENT','ADMIN','OPERATOR']);
    const request=await this.db.tuitionRequest.findUnique({where:{id}});
    if (!request || (account.role==='GUARDIAN' && request.guardianId!==account.id) || (account.role==='OPERATOR'&&request?.region!==account.region)) fail(404,'NOT_FOUND','Request not found.');
    if(account.role==='STUDENT')await requestAuthority(this.db,this.service,account,id);
    const child=await this.db.child.findUniqueOrThrow({where:{id:request.childId}}),candidates=[];
    const consent=await this.db.consent.findUnique({where:{guardianId:request.guardianId}});
    if(request.status==='OPEN'&&consent&&!consent.withdrawnAt)for(const candidate of await this.db.recommendation.findMany({where:{requestId:id,presentedAt:{not:null},expiresAt:{gt:new Date()}},orderBy:{position:'asc'}})){const teacher=await this.db.teacher.findUniqueOrThrow({where:{id:candidate.teacherId}});if(await matched(this.db,request,child,teacher))candidates.push(candidate);}
    const direct=await this.db.directEnquiry.findUnique({where:{kind_sourceId:{kind:'GUARDIAN',sourceId:id}},select:{id:true}});
    return {...request,candidates,directEnquiryId:direct?.id??null};
  }

}
@Module({imports:[PersistenceModule],controllers:[RequestsController]})
export class RequestsModule {}
