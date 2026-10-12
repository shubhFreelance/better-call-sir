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
 @Post('cases') async create(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT']);const data=parse(z.object({category:z.enum(['SAFETY','REPLACEMENT','ATTENDANCE','PAYMENT','PRIVACY','GENERAL']),description:text(3000),placementId:uuid.optional(),reservationId:uuid.optional()}).strict(),body);
  return this.service.once(req,actor,'case.create',data,async db=>{
   const child=actor.role==='STUDENT'?await db.child.findUniqueOrThrow({where:{studentAccountId:actor.id}}):null,guardian=child?await db.account.findUniqueOrThrow({where:{id:child.guardianId}}):actor;
   const teacher=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null;
   if(data.placementId){const p=await db.placement.findUnique({where:{id:data.placementId}});if(!p||(actor.role==='GUARDIAN'?p.guardianId!==actor.id:actor.role==='TEACHER'?p.teacherId!==teacher?.id:p.childId!==child?.id))fail(404,'NOT_FOUND','Placement not found.');}
   if(data.reservationId){const r=await db.reservation.findUnique({where:{id:data.reservationId}});if(!r||(actor.role==='GUARDIAN'?r.guardianId!==actor.id:actor.role==='TEACHER'?r.teacherId!==teacher?.id:r.childId!==child?.id))fail(404,'NOT_FOUND','Reservation not found.');}
   const item=await db.supportCase.create({data:{...data,accountId:actor.id,region:guardian.region}});await this.service.audit(db,actor,req,'SUPPORT_CASE_CREATED',item.id,'Participant reported service issue',undefined,{category:data.category});await this.service.event(db,'case.created',item.id);return item;
  });
 }
 @Get('cases') async list(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','ADMIN','OPERATOR']),data=parse(z.object({status:statuses.optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:uuid.optional()}).strict(),query);
  if(data.cursor)await this.owned(this.service.db,actor,data.cursor);
  const rows=await this.service.db.supportCase.findMany({where:{...this.scope(actor),...(data.status?{status:data.status}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1,...(data.cursor?{cursor:{id:data.cursor},skip:1}:{})});return {items:rows.slice(0,data.limit),nextCursor:rows.length>data.limit?rows[data.limit-1].id:null};
 }
 @Get('cases/:id') async detail(@Req() req:HttpRequest,@Param('id') id:string){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','ADMIN','OPERATOR']),item=await this.owned(this.service.db,actor,id);const updates=await this.service.db.caseUpdate.findMany({where:{caseId:id,...(staff(actor)?{}:{internal:false})},orderBy:{createdAt:'asc'},take:50,select:{id:true,message:true,internal:true,createdAt:true}});return {...item,updates};
 }
 @Post('cases/:id/updates') async reply(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT','ADMIN','OPERATOR']),data=parse(z.object({expectedVersion:version,message:text(3000),internal:z.boolean().default(false)}).strict(),body);if(data.internal&&!staff(actor))fail(403,'FORBIDDEN','Only staff can add internal updates.');
  return this.service.once(req,actor,'case.reply',data,async db=>{const item=await this.owned(db,actor,id);if(item.version!==data.expectedVersion||['RESOLVED','CLOSED'].includes(item.status))fail(409,'CONFLICT','Case changed or is resolved.');const changed=await db.supportCase.updateMany({where:{id,version:data.expectedVersion},data:{version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Case changed.');await db.caseUpdate.create({data:{caseId:id,actorId:actor.id,message:data.message,internal:data.internal}});await this.service.event(db,'case.updated',id,item.version+1);return db.supportCase.findUniqueOrThrow({where:{id}});});
 }
 @Post('admin/cases/:id/triage') async triage(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','OPERATOR']),data=parse(z.object({expectedVersion:version,status:statuses,assignedToId:uuid.nullable().optional(),reason:text(1000)}).strict(),body);
  return this.service.once(req,actor,'case.triage',data,async db=>{const item=await this.owned(db,actor,id);if(item.version!==data.expectedVersion)fail(409,'CONFLICT','Case changed.');if(data.assignedToId){const assigned=await db.account.findUnique({where:{id:data.assignedToId}});if(!assigned||assigned.disabled||!(assigned.role==='ADMIN'||assigned.role==='OPERATOR'&&assigned.region===item.region))fail(400,'INVALID_ASSIGNEE','Choose authorized regional staff.');}
   const transitions:Record<string,string[]>={OPEN:['IN_PROGRESS','WAITING_OWNER','RESOLVED'],IN_PROGRESS:['OPEN','WAITING_OWNER','RESOLVED'],WAITING_OWNER:['OPEN','IN_PROGRESS','RESOLVED'],RESOLVED:['OPEN','CLOSED'],CLOSED:[]};if(data.status!==item.status&&!transitions[item.status].includes(data.status))fail(409,'INVALID_TRANSITION','Case cannot enter that status.');
   const changed=await db.supportCase.updateMany({where:{id,version:data.expectedVersion},data:{status:data.status,assignedToId:data.assignedToId,resolution:['RESOLVED','CLOSED'].includes(data.status)?data.reason:null,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Case changed.');await db.caseUpdate.create({data:{caseId:id,actorId:actor.id,message:data.reason,internal:false}});await this.service.audit(db,actor,req,'SUPPORT_CASE_TRIAGED',id,data.reason,undefined,{status:data.status});await this.service.event(db,'case.triaged',id,item.version+1);return db.supportCase.findUniqueOrThrow({where:{id}});
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[SupportController]})
export class SupportModule{}
