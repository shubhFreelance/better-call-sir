import {ownedStudentEnquiry} from '../requests/student-hiring.module';
import {Module,Controller,Get,Post,Param,Query,Body,Req,Inject} from '@nestjs/common';
import {Account,Prisma} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,DB,uuid,version,text,fail,parse} from '../../shared';
const staff=(a:Account)=>['ADMIN','OPERATOR'].includes(a.role);
const statuses=z.enum(['OPEN','IN_PROGRESS','WAITING_OWNER','RESOLVED','CLOSED']);
@Controller('api/v1')
class SupportController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 scope(actor:Account):Prisma.SupportCaseWhereInput{return actor.role==='ADMIN'?{}:actor.role==='OPERATOR'?{region:actor.region}:{accountId:actor.id};}
 async owned(db:DB,actor:Account,id:string){const item=await db.supportCase.findFirst({where:{id,...this.scope(actor)}});if(!item)fail(404,'NOT_FOUND','Case not found.');return item;}
 async context(db:DB,actor:Account,input:{requestId?:string;placementId?:string}) {
  const teacher=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null,child=actor.role==='STUDENT'?await db.child.findUnique({where:{studentAccountId:actor.id}}):null;
  const placement=input.placementId?await db.placement.findUnique({where:{id:input.placementId}}):null;
  if(input.placementId&&(!placement||(actor.role==='GUARDIAN'?placement.guardianId!==actor.id:actor.role==='TEACHER'?placement.teacherId!==teacher?.id:placement.childId!==child?.id)))fail(404,'NOT_FOUND','Arrangement not found.');
  const request=await db.tuitionRequest.findUnique({where:{id:input.requestId||placement?.requestId||'00000000-0000-4000-8000-000000000000'}});
  if(!request)fail(404,'NOT_FOUND','Enquiry not found.');
  if(input.requestId&&placement&&placement.requestId!==input.requestId)fail(400,'INVALID_CONTEXT','Choose an enquiry and arrangement that belong together.');
  if(!placement){
   if(actor.role==='GUARDIAN'?request.guardianId!==actor.id:actor.role==='STUDENT'?request.childId!==child?.id:!teacher)fail(404,'NOT_FOUND','Enquiry not found.');
   if(actor.role==='TEACHER'){
    const assigned=await db.placement.findFirst({where:{requestId:request.id,teacherId:teacher!.id}}),candidate=await db.recommendation.findFirst({where:{requestId:request.id,teacherId:teacher!.id,presentedAt:{not:null},runId:{not:null},expiresAt:{gt:new Date()}}});
    if(!assigned&&!candidate)fail(404,'NOT_FOUND','Enquiry not found.');
    if(!assigned)await this.service.guardian(db,request.guardianId);
   }
  }
  const related=placement||await db.placement.findFirst({where:{requestId:request.id,...(actor.role==='TEACHER'?{teacherId:teacher!.id}:{})}});
  return {kind:input.placementId?'ARRANGEMENT':'ENQUIRY',id:input.placementId||request.id,requestId:request.id,placementId:related?.id||null,subject:request.subject,mode:request.mode,status:placement?.status||request.status,canRequestReplacement:actor.role==='GUARDIAN'&&!!related&&related.status!=='CLOSED'};
 }
 @Get('support/context') async getContext(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','INDEPENDENT_STUDENT']),data=parse(z.object({requestId:uuid.optional(),placementId:uuid.optional()}).strict().refine(v=>!!v.requestId!==!!v.placementId),query);
  return this.service.db.$transaction(db=>this.context(db,actor,data));
 }
 @Post('cases') async create(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','INDEPENDENT_STUDENT']);const data=parse(z.object({category:z.enum(['SAFETY','REPLACEMENT','ATTENDANCE','PAYMENT','PRIVACY','GENERAL']),description:text(3000),placementId:uuid.optional(),reservationId:uuid.optional(),requestId:uuid.optional()}).strict(),body);
  if(data.requestId&&data.reservationId)fail(400,'INVALID_CONTEXT','Choose enquiry or reservation context, not both.');
  return this.service.once(req,actor,'case.create',data,async db=>{
   const child=actor.role==='STUDENT'?await db.child.findUniqueOrThrow({where:{studentAccountId:actor.id}}):null,guardian=child?await db.account.findUniqueOrThrow({where:{id:child.guardianId}}):actor;
   const teacher=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null;
   if(data.requestId)await this.context(db,actor,data);
   if(data.placementId){const p=await db.placement.findUnique({where:{id:data.placementId}});if(!p||(actor.role==='GUARDIAN'?p.guardianId!==actor.id:actor.role==='TEACHER'?p.teacherId!==teacher?.id:p.childId!==child?.id))fail(404,'NOT_FOUND','Placement not found.');}
   if(data.reservationId){const r=await db.reservation.findUnique({where:{id:data.reservationId}});if(!r||(actor.role==='GUARDIAN'?r.guardianId!==actor.id:actor.role==='TEACHER'?r.teacherId!==teacher?.id:r.childId!==child?.id))fail(404,'NOT_FOUND','Reservation not found.');}
   const item=await db.supportCase.create({data:{...data,accountId:actor.id,region:guardian.region}});await this.service.audit(db,actor,req,'SUPPORT_CASE_CREATED',item.id,'Participant reported service issue',undefined,{category:data.category});await this.service.event(db,'case.created',item.id);return item;
  });
 }
 @Get('cases') async list(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','INDEPENDENT_STUDENT','ADMIN','OPERATOR']),data=parse(z.object({status:statuses.optional(),category:text(80).optional(),assignment:z.enum(['ME','UNASSIGNED']).optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:uuid.optional(),studentEnquiryId:uuid.optional(),requestId:uuid.optional(),placementId:uuid.optional()}).strict(),query);
  if(data.assignment&&!staff(actor))fail(403,'FORBIDDEN','Assignment filters are restricted to support staff.');
  if((data.requestId||data.placementId)&&staff(actor))fail(400,'INVALID_CONTEXT','Use the regional support queue for staff case filters.');
  if(data.requestId&&data.placementId)fail(400,'INVALID_CONTEXT','Choose one support context.');
  const context=data.requestId||data.placementId?await this.service.db.$transaction(db=>this.context(db,actor,data)):null;
  if(data.studentEnquiryId){if(data.requestId||data.placementId)fail(400,'INVALID_CONTEXT','Choose one support context.');await ownedStudentEnquiry(this.service.db,actor,data.studentEnquiryId);}
  const linked=context?(data.placementId?{placementId:context.placementId!}:{OR:[{requestId:context.requestId},...(context.placementId?[{placementId:context.placementId}]:[])]}):{};
  const where={...this.scope(actor),...linked,...(data.studentEnquiryId?{studentEnquiryId:data.studentEnquiryId}:{}),...(data.status?{status:data.status}:{}),...(data.category?{category:data.category}:{}),...(data.assignment?{assignedToId:data.assignment==='ME'?actor.id:null}:{})};
  if(data.cursor&&!await this.service.db.supportCase.findFirst({where:{...where,id:data.cursor},select:{id:true}}))fail(404,'NOT_FOUND','Case cursor not found.');
  const rows=await this.service.db.supportCase.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1,...(data.cursor?{cursor:{id:data.cursor},skip:1}:{})});return {items:rows.slice(0,data.limit),nextCursor:rows.length>data.limit?rows[data.limit-1].id:null};
 }
 @Get('cases/:id') async detail(@Req() req:HttpRequest,@Param('id') id:string,@Query() query:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','INDEPENDENT_STUDENT','ADMIN','OPERATOR']),data=parse(z.object({updatesCursor:uuid.optional(),updatesLimit:z.coerce.number().int().min(1).max(50).default(20)}).strict(),query),item=await this.owned(this.service.db,actor,id);
  const where={caseId:id,...(staff(actor)?{}:{internal:false})};if(data.updatesCursor&&!await this.service.db.caseUpdate.findFirst({where:{...where,id:data.updatesCursor}}))fail(404,'NOT_FOUND','Case update not found.');
  const rows=await this.service.db.caseUpdate.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.updatesLimit+1,...(data.updatesCursor?{cursor:{id:data.updatesCursor},skip:1}:{}),select:{id:true,actorId:true,message:true,internal:true,createdAt:true}}),page=rows.slice(0,data.updatesLimit);
  const updates=page.map(({actorId,...update})=>({...update,author:actorId===actor.id?'YOU':actorId===item.accountId?'CASE_OWNER':'SUPPORT'}));return {...item,updates,updatesNextCursor:rows.length>data.updatesLimit?page.at(-1)!.id:null};
 }
 @Post('cases/:id/updates') async reply(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','INDEPENDENT_STUDENT','ADMIN','OPERATOR']),data=parse(z.object({expectedVersion:version,message:text(3000),internal:z.boolean().default(false)}).strict(),body);if(data.internal&&!staff(actor))fail(403,'FORBIDDEN','Only staff can add internal updates.');
  return this.service.once(req,actor,'case.reply',data,async db=>{const item=await this.owned(db,actor,id);if(item.version!==data.expectedVersion||['RESOLVED','CLOSED'].includes(item.status))fail(409,'CONFLICT','Case changed or is resolved.');const changed=await db.supportCase.updateMany({where:{id,version:data.expectedVersion},data:{version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Case changed.');await db.caseUpdate.create({data:{caseId:id,actorId:actor.id,message:data.message,internal:data.internal}});await this.service.event(db,'case.updated',id,item.version+1);return db.supportCase.findUniqueOrThrow({where:{id}});});
 }
 @Post('admin/cases/:id/triage') async triage(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','OPERATOR']),data=parse(z.object({expectedVersion:version,status:statuses,assignedToId:uuid.nullable().optional(),reason:text(1000)}).strict(),body);
  return this.service.once(req,actor,'case.triage',data,async db=>{const item=await this.owned(db,actor,id);if(item.version!==data.expectedVersion)fail(409,'CONFLICT','Case changed.');if(['RESOLVED','CLOSED'].includes(data.status)){if(await db.tuitionMinimumReview.count({where:{caseId:id,status:'PENDING'}}))fail(409,'DISPUTE_PENDING','Assess the linked minimum-tuition exception before resolving this case.');const demo=await db.demo.findFirst({where:{supportCaseId:id,status:'DISPUTED'},select:{id:true}});let lessonPending=false;const match=/^Lesson ([0-9a-f-]{36}):/i.exec(item.description);if(item.category==='ATTENDANCE'&&match&&uuid.safeParse(match[1]).success){const lesson=await db.lesson.findFirst({where:{id:match[1],disputed:true},select:{childId:true}});if(lesson){const child=await db.child.findUniqueOrThrow({where:{id:lesson.childId}});lessonPending=item.accountId===child.guardianId||item.accountId===child.studentAccountId;}}if(demo||lessonPending)fail(409,'DISPUTE_PENDING','Review the linked demo or attendance outcome before resolving this case.');}if(data.assignedToId){const assigned=await db.account.findUnique({where:{id:data.assignedToId}});if(!assigned||assigned.disabled||!(assigned.role==='ADMIN'||assigned.role==='OPERATOR'&&assigned.region===item.region))fail(400,'INVALID_ASSIGNEE','Choose authorized regional staff.');}
   const transitions:Record<string,string[]>={OPEN:['IN_PROGRESS','WAITING_OWNER','RESOLVED'],IN_PROGRESS:['OPEN','WAITING_OWNER','RESOLVED'],WAITING_OWNER:['OPEN','IN_PROGRESS','RESOLVED'],RESOLVED:['OPEN','CLOSED'],CLOSED:[]};if(data.status!==item.status&&!transitions[item.status].includes(data.status))fail(409,'INVALID_TRANSITION','Case cannot enter that status.');
   const changed=await db.supportCase.updateMany({where:{id,version:data.expectedVersion},data:{status:data.status,assignedToId:data.assignedToId,resolution:['RESOLVED','CLOSED'].includes(data.status)?data.reason:null,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Case changed.');await db.caseUpdate.create({data:{caseId:id,actorId:actor.id,message:data.reason,internal:false}});await this.service.audit(db,actor,req,'SUPPORT_CASE_TRIAGED',id,data.reason,undefined,{status:data.status});await this.service.event(db,'case.triaged',id,item.version+1);return db.supportCase.findUniqueOrThrow({where:{id}});
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[SupportController]})
export class SupportModule{}
