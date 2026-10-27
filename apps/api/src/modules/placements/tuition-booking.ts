import {Module,Controller,Get,Post,Param,Body,Req,Inject} from '@nestjs/common';
import type {Account} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,DB,HttpRequest,uuid,version,parse,fail} from '../../shared';
import {context} from './tuition-minimum';
import {requestAuthority} from '../learners/learning-management';
import {studentAuthority} from '../learners/student-authority';
import {studentReady,studentFit} from '../requests/student-hiring.module';
import {recordedFee} from '../administration/commercial-policy';

const kinds=z.enum(['PLACEMENT','INDEPENDENT']);
const roles=['GUARDIAN','STUDENT','INDEPENDENT_STUDENT','TEACHER'];
const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
function nextMonth(){const now=today();const date=new Date(now.slice(0,7)+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString().slice(0,7);}
async function bookingContext(db:DB,service:AppService,req:HttpRequest,actor:Account,kind:string,id:string,write=false){
 const c=await context(db,service,req,actor,kind,id,write);
 if(c.p){await service.guardian(db,c.familyId);const owner=await db.account.findUniqueOrThrow({where:{id:c.familyId}});await service.child(db,owner,c.p.childId);if(actor.role==='STUDENT')await requestAuthority(db,service,actor,c.p.requestId,write);}
 else {await studentReady(db,c.familyId);if(actor.role==='GUARDIAN')await studentAuthority(db,actor,c.familyId,write);}
 const ownTeacher=actor.role==='TEACHER'&&c.teacher.accountId===actor.id;
 const managedStudent=c.p&&actor.role==='STUDENT'?await db.child.findUniqueOrThrow({where:{id:c.p.childId}}):null;
 const delegated=c.a&&actor.role==='GUARDIAN'?await db.studentGuardianGrant.count({where:{studentAccountId:c.familyId,acceptedById:actor.id,status:'ACTIVE',supportMode:'MANAGE'}}):0;
 return {...c,ownTeacher,canConfirm:ownTeacher||actor.role==='GUARDIAN'&&!!(c.p||delegated)||actor.role==='STUDENT'&&['SHARED','STUDENT_LED'].includes(managedStudent?.learningManagementMode??'')||actor.role==='INDEPENDENT_STUDENT'};
}
async function projection(db:DB,c:Awaited<ReturnType<typeof bookingContext>>,kind:string,id:string){
 const booking=await db.tuitionBooking.findUnique({where:{resourceId:id}}),m=await db.membership.findUnique({where:{guardianId:c.familyId}}),proActive=!!m&&m.status==='ACTIVE'&&m.periodStart<=new Date()&&m.periodEnd>new Date();
 const terms=c.a?.terms as Record<string,unknown>|undefined;
 const confirmed=!!booking?.familyConfirmed&&!!booking.teacherConfirmed;
 return {id,kind,version:c.current.version,month:booking?.month??nextMonth(),bookingVersion:booking?.version??0,...(!c.canConfirm?{}:{monthlyPaise:c.p?.monthlyPaise??Number(terms?.monthlyPaise),policyVersion:c.p?.policyVersion??String(terms?.policyVersion),placementFeePaise:c.p?recordedFee(c.p):Number(terms?.platformFeePaise)}),familyConfirmed:booking?.familyConfirmed??false,teacherConfirmed:booking?.teacherConfirmed??false,confirmed,closed:c.current.status==='CLOSED',canConfirm:c.canConfirm&&c.current.status!=='CLOSED',proActive,canMarkCompleted:proActive&&confirmed&&c.ownTeacher&&c.current.status!=='CLOSED',completions:proActive&&booking?await db.tuitionCompletion.findMany({where:{bookingId:booking.id},select:{date:true,completed:true,version:true},orderBy:{date:'asc'}}):[]};
}
@Controller('api/v1')
class TuitionBookingController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('tuition-bookings/:kind/:id') async get(@Req() req:HttpRequest,@Param('kind') kind:string,@Param('id') id:string){
  parse(kinds,kind);parse(uuid,id);const actor=await this.service.actor(req,roles);
  return this.service.db.$transaction(async db=>projection(db,await bookingContext(db,this.service,req,actor,kind,id),kind,id));
 }
 @Post('tuition-bookings/:kind/:id/confirmations') async confirm(@Req() req:HttpRequest,@Param('kind') kind:string,@Param('id') id:string,@Body() body:unknown){
  parse(kinds,kind);parse(uuid,id);const actor=await this.service.actor(req,roles),data=parse(z.object({expectedVersion:version,expectedBookingVersion:z.number().int().min(0),month,policyVersion:z.string().min(1).max(100),confirmed:z.literal(true),contactShareAccepted:z.literal(true)}).strict(),body);
  return this.service.once(req,actor,'tuition-booking.confirm',{kind,id,...data},async db=>{
   const c=await bookingContext(db,this.service,req,actor,kind,id,true),current=await projection(db,c,kind,id);
   if(!c.canConfirm||current.closed)fail(403,'BOOKING_CLOSED','This tuition arrangement cannot be confirmed.');
   if(current.version!==data.expectedVersion||current.bookingVersion!==data.expectedBookingVersion||current.policyVersion!==data.policyVersion)fail(409,'CONFLICT','Tuition details changed. Review the current month and terms.');
   if(current.bookingVersion&&current.month!==data.month)fail(409,'MONTH_CHANGED','Confirm the same month as the other party.');
   if(!current.bookingVersion&&(data.month<today().slice(0,7)||data.month>String(Number(today().slice(0,4))+1)+today().slice(4,7)))fail(400,'INVALID_MONTH','Choose this month or a month within the next year.');
   if((c.ownTeacher?current.teacherConfirmed:current.familyConfirmed))fail(409,'ALREADY_CONFIRMED','Your confirmation is already recorded.');
   if(!(await this.service.publicTeachers({id:c.teacher.id},1)).length)fail(409,'TEACHER_UNAVAILABLE','Teacher is not currently available.');
   const booking=await db.tuitionBooking.upsert({where:{resourceId:id},create:{kind,resourceId:id,month:data.month,...(c.ownTeacher?{teacherConfirmed:true}:{familyConfirmed:true})},update:{...(c.ownTeacher?{teacherConfirmed:true}:{familyConfirmed:true}),version:{increment:1}}});
   if(c.p){await db.placement.update({where:{id},data:{...(c.ownTeacher?{teacherAccepted:true}:{guardianAccepted:true,familyAcceptanceActorId:actor.id}),version:{increment:1}}});}
   else {
    const a=c.a!,e=await db.studentEnquiry.findUniqueOrThrow({where:{id:a.enquiryId!}});
    if(!['SUBMITTED','HIRED'].includes(e.status)||!await studentFit(db,e,c.teacher,Number((a.terms as any).monthlyPaise)))fail(409,'INELIGIBLE','Current safety, coverage or capacity checks failed.');
    const both=c.ownTeacher?!!a.studentAcceptedAt:!!a.teacherAcceptedAt;
    await db.studentArrangement.update({where:{id},data:{...(c.ownTeacher?{teacherAcceptedAt:new Date()}:{studentAcceptedAt:new Date()}),status:both?'CONFIRMED':'TERMS_PENDING',version:{increment:1}}});
    if(both&&e.status!=='HIRED')await db.studentEnquiry.update({where:{id:e.id},data:{status:'HIRED',version:{increment:1}}});
   }
   await this.service.audit(db,actor,req,'TUITION_MONTH_CONFIRMED',id,'Participant explicitly confirmed monthly tuition and coordination contact sharing',undefined,{month:booking.month,teacherSide:c.ownTeacher,version:booking.version});
   await this.service.event(db,'tuition-booking.confirmed',id,booking.version);
   return projection(db,await bookingContext(db,this.service,req,actor,kind,id),kind,id);
  },async db=>{await bookingContext(db,this.service,req,actor,kind,id);});
 }
 @Post('tuition-bookings/:kind/:id/completions') async complete(@Req() req:HttpRequest,@Param('kind') kind:string,@Param('id') id:string,@Body() body:unknown){
  parse(kinds,kind);parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']),data=parse(z.object({date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),completed:z.boolean(),expectedVersion:z.number().int().min(0),confirmed:z.literal(true)}).strict(),body);
  return this.service.once(req,actor,'tuition-booking.complete',{kind,id,...data},async db=>{
   const c=await bookingContext(db,this.service,req,actor,kind,id,true),current=await projection(db,c,kind,id);
   if(!current.proActive)fail(403,'PRO_REQUIRED','An active Pro membership is required for class tracking.');
   if(!current.canMarkCompleted)fail(409,'BOOKING_PENDING','Both parties must confirm the month before recording completed classes.');
   const date=new Date(data.date+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==data.date||data.date.slice(0,7)!==current.month||data.date>today())fail(400,'INVALID_DATE','Choose a valid date in the booked month, on or before today.');
   const booking=await db.tuitionBooking.findUniqueOrThrow({where:{resourceId:id}}),existing=await db.tuitionCompletion.findUnique({where:{bookingId_date:{bookingId:booking.id,date:data.date}}});
   if((existing?.version??0)!==data.expectedVersion)fail(409,'CONFLICT','The class record changed. Refresh before confirming.');
   await db.tuitionCompletion.upsert({where:{bookingId_date:{bookingId:booking.id,date:data.date}},create:{bookingId:booking.id,date:data.date,completed:data.completed,recordedById:actor.id},update:{completed:data.completed,recordedById:actor.id,recordedAt:new Date(),version:{increment:1}}});
   await this.service.audit(db,actor,req,'TUITION_CLASS_RECORDED',id,'Teacher recorded a class date; not independent attendance or payment evidence',undefined,{date:data.date,completed:data.completed});
   await this.service.event(db,'tuition-booking.class_recorded',id);
   return projection(db,c,kind,id);
  },async db=>{const c=await bookingContext(db,this.service,req,actor,kind,id);if(!(await projection(db,c,kind,id)).proActive)fail(403,'PRO_REQUIRED','An active Pro membership is required.');});
 }
}
@Module({imports:[PersistenceModule],controllers:[TuitionBookingController]})
export class TuitionBookingModule {}
