import {Module,Controller,Get,Post,Param,Req,Body,Inject} from '@nestjs/common';
import {Account} from '@prisma/client';
import {z} from 'zod';
import {materialize} from '@bcs/scheduling';
import {AppService,PersistenceModule,HttpRequest,DB,uuid,version,text,parse,fail} from '../../shared';
const slots=z.array(z.object({weekday:z.number().int().min(0).max(6),startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440)}).strict()).min(1).max(7);
@Controller('api/v1')
class RecurringController{
 constructor(@Inject(AppService) private readonly service:AppService){}
 async owned(db:DB,actor:Account,id:string){
  const p=await db.placement.findUnique({where:{id}}),t=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null;
  if(!p||(actor.role==='GUARDIAN'?p.guardianId!==actor.id:p.teacherId!==t?.id))fail(404,'NOT_FOUND','Placement not found.');
  await this.service.guardian(db,p.guardianId);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${p.teacherId},0))`;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
  return db.placement.findUniqueOrThrow({where:{id}});
 }
 @Get('placements/:id/schedules')async list(@Req()req:HttpRequest,@Param('id')id:string){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);
  return this.service.db.$transaction(async db=>{await this.owned(db,actor,id);return {items:await db.recurringSchedule.findMany({where:{placementId:id},orderBy:{createdAt:'desc'},take:50})};});
 }
 @Post('placements/:id/schedules')async propose(@Req()req:HttpRequest,@Param('id')id:string,@Body()body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);
  const data=parse(z.object({expectedVersion:version,timezone:z.literal('Asia/Kolkata'),slots,validFrom:z.iso.date(),validUntil:z.iso.date(),reason:text(300)}).strict(),body);
  const sorted=[...data.slots].sort((a,b)=>a.weekday-b.weekday||a.startMinute-b.startMinute);
  if(sorted.some((s,i)=>s.endMinute-s.startMinute<20||s.endMinute-s.startMinute>120||(i>0&&s.weekday===sorted[i-1].weekday&&s.startMinute<sorted[i-1].endMinute)))fail(400,'INVALID_SCHEDULE','Use nonoverlapping 20–120 minute weekly windows.');
  const validFrom=new Date(data.validFrom),validUntil=new Date(data.validUntil),today=new Date(new Date().toISOString().slice(0,10));
  if(validFrom<today||validUntil<validFrom||validUntil.getTime()>Date.now()+365*86400000)fail(400,'INVALID_RANGE','Use future validity within one year.');
  return this.service.once(req,actor,'recurring.propose',data,async db=>{
   const p=await this.owned(db,actor,id);if(p.version!==data.expectedVersion||!['ACTIVE','TERMS_PENDING'].includes(p.status))fail(409,'CONFLICT','Placement changed or is closed.');
   const request=await db.tuitionRequest.findUniqueOrThrow({where:{id:p.requestId}});
   if(request.mode==='ONLINE'&&sorted.some(s=>s.endMinute-s.startMinute>40))fail(400,'MEETING_LIMIT','Online meetings currently have a 40-minute booking limit.');
   await db.recurringSchedule.updateMany({where:{placementId:id,status:'PROPOSED'},data:{status:'SUPERSEDED',version:{increment:1}}});
   const schedule=await db.recurringSchedule.create({data:{placementId:id,guardianId:p.guardianId,teacherId:p.teacherId,childId:p.childId,timezone:data.timezone,slots:sorted,validFrom,validUntil,reason:data.reason}});
   await db.placement.update({where:{id},data:{version:{increment:1}}});
   await this.service.audit(db,actor,req,'RECURRING_SCHEDULE_PROPOSED',schedule.id,data.reason);
   await this.service.event(db,'recurring.schedule_proposed',schedule.id);return schedule;
  });
 }
 @Post('recurring-schedules/:id/acceptances')async accept(@Req()req:HttpRequest,@Param('id')id:string,@Body()body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);const data=parse(z.object({expectedVersion:version}).strict(),body);
  return this.service.once(req,actor,'recurring.accept',data,async db=>{
   const initial=await db.recurringSchedule.findUnique({where:{id}});if(!initial)fail(404,'NOT_FOUND','Schedule not found.');
   const p=await this.owned(db,actor,initial.placementId),s=await db.recurringSchedule.findUniqueOrThrow({where:{id}});
   if(s.version!==data.expectedVersion||s.status!=='PROPOSED')fail(409,'CONFLICT','Schedule changed or was already accepted.');
   const updated=await db.recurringSchedule.update({where:{id},data:{...(actor.role==='GUARDIAN'?{guardianAccepted:true}:{teacherAccepted:true}),version:{increment:1}}});
   if(updated.guardianAccepted&&updated.teacherAccepted){
    if(!p.guardianAccepted||!p.teacherAccepted)fail(409,'TERMS_PENDING','Both parties must accept tuition terms first.');
    const old=await db.recurringSchedule.findMany({where:{placementId:p.id,status:'ACCEPTED'},select:{id:true}});
    const lessons=await db.lesson.findMany({where:{recurringScheduleId:{in:old.map(s=>s.id)},status:'SCHEDULED',startsAt:{gte:new Date(Date.now()+3600000)}},select:{id:true,reservationId:true}});
    await db.reservation.updateMany({where:{id:{in:lessons.flatMap(l=>l.reservationId?[l.reservationId]:[])},status:'CONFIRMED'},data:{status:'CANCELLED',version:{increment:1}}});
    await db.lesson.updateMany({where:{id:{in:lessons.map(l=>l.id)}},data:{status:'CANCELLED',version:{increment:1}}});
    await db.recurringSchedule.updateMany({where:{id:{in:old.map(s=>s.id)}},data:{status:'SUPERSEDED',version:{increment:1}}});
    await db.recurringSchedule.update({where:{id},data:{status:'ACCEPTED'}});updated.status='ACCEPTED';
    try{await materialize(db,updated);}catch(error){if(error instanceof Error&&['SCHEDULE_UNAVAILABLE','SCHEDULE_COLLISION','NO_FUTURE_LESSONS'].includes(error.message))fail(409,error.message,'The agreed timetable is unavailable; choose another schedule.');throw error;}
   }
   await this.service.audit(db,actor,req,'RECURRING_SCHEDULE_ACCEPTED',id,'Party accepted current timetable',undefined,{version:updated.version,status:updated.status});
   await this.service.event(db,'recurring.schedule_accepted',id,updated.version);return db.recurringSchedule.findUniqueOrThrow({where:{id}});
  });
 }
 @Post('recurring-schedules/:id/extensions')async extend(@Req()req:HttpRequest,@Param('id')id:string,@Body()body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);const data=parse(z.object({expectedVersion:version}).strict(),body);
  return this.service.once(req,actor,'recurring.extend',data,async db=>{
   const initial=await db.recurringSchedule.findUnique({where:{id}});if(!initial)fail(404,'NOT_FOUND','Schedule not found.');
   await this.owned(db,actor,initial.placementId);const s=await db.recurringSchedule.findUniqueOrThrow({where:{id}});
   if(s.status!=='ACCEPTED'||s.version!==data.expectedVersion)fail(409,'CONFLICT','Schedule is no longer accepted.');
   try{const result=await materialize(db,s);await this.service.audit(db,actor,req,'RECURRING_HORIZON_EXTENDED',id,'Extended accepted timetable',undefined,result);return result;}
   catch(error){if(error instanceof Error&&['SCHEDULE_UNAVAILABLE','SCHEDULE_COLLISION','NO_FUTURE_LESSONS'].includes(error.message))fail(409,error.message,'Timetable extension needs review.');throw error;}
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[RecurringController]})
export class RecurringModule{}
