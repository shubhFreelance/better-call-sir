const offset=330*60000;
const meetings=require('@bcs/meetings');
function intervals(schedule,now=new Date()){
 const horizon=new Date(now.getTime()+60*86400000),local=new Date(now.getTime()+offset),first=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()),items=[];
 for(let day=first;day<=schedule.validUntil.getTime()&&day<horizon.getTime()+offset;day+=86400000){
  if(day<schedule.validFrom.getTime())continue;
  const weekday=new Date(day).getUTCDay();
  for(const slot of schedule.slots){
   if(slot.weekday!==weekday)continue;
   const startsAt=new Date(day+slot.startMinute*60000-offset),endsAt=new Date(day+slot.endMinute*60000-offset);
   if(startsAt.getTime()>=now.getTime()+3600000&&endsAt<=horizon)items.push({startsAt,endsAt});
  }
 }
 return items.sort((a,b)=>a.startsAt-b.startsAt);
}
async function materialize(db,schedule,now=new Date()){
 await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${schedule.guardianId},0))`;
 await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${schedule.teacherId},0))`;
 const guardian=await db.account.findUnique({where:{id:schedule.guardianId}}),consent=await db.consent.findUnique({where:{guardianId:schedule.guardianId}}),teacher=await db.teacher.findUnique({where:{id:schedule.teacherId}}),placement=await db.placement.findUnique({where:{id:schedule.placementId}});
 const account=teacher?await db.account.findUnique({where:{id:teacher.accountId}}):null;
 if(!guardian?.verified||guardian.disabled||!consent||consent.withdrawnAt||!teacher||teacher.status!=='APPROVED'||!teacher.screeningComplete||!teacher.screeningValidUntil||teacher.screeningValidUntil<=now||!account||account.disabled||!placement||!['ACTIVE','TERMS_PENDING'].includes(placement.status))throw new Error('SCHEDULE_UNAVAILABLE');
 const slots=intervals(schedule,now);if(!slots.length)throw new Error('NO_FUTURE_LESSONS');
 const patterns=await db.availabilityPattern.findMany({where:{teacherId:schedule.teacherId,kind:'RECURRING',active:true}});
 const existing=await db.lesson.findMany({where:{recurringScheduleId:schedule.id},select:{startsAt:true}}),starts=new Set(existing.map(x=>x.startsAt.getTime()));
 const end=new Date(now.getTime()+60*86400000);
 const leaves=await db.availabilityException.findMany({where:{teacherId:schedule.teacherId,active:true,startsAt:{lt:end},endsAt:{gt:now}}});
 await db.reservation.updateMany({where:{teacherId:schedule.teacherId,status:'HOLD',expiresAt:{lt:now}},data:{status:'EXPIRED',version:{increment:1}}});
 const reservations=await db.reservation.findMany({where:{teacherId:schedule.teacherId,status:{in:['HOLD','CONFIRMED']},startsAt:{lt:end},endsAt:{gt:now}}});
 const blocks=[...leaves,...reservations];const request=await db.tuitionRequest.findUniqueOrThrow({where:{id:placement.requestId}});let created=0;
 for(const slot of slots){
  if(starts.has(slot.startsAt.getTime()))continue;
  const local=new Date(slot.startsAt.getTime()+offset),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()),minute=local.getUTCHours()*60+local.getUTCMinutes();
  const pattern=patterns.find(p=>p.weekday===local.getUTCDay()&&p.validFrom.getTime()<=day&&p.validUntil.getTime()>=day&&p.startMinute<=minute&&p.endMinute>=minute+(slot.endsAt-slot.startsAt)/60000);
  if(!pattern||blocks.some(b=>b.startsAt<slot.endsAt&&b.endsAt>slot.startsAt))throw new Error('SCHEDULE_COLLISION');
  const reservation=await db.reservation.create({data:{teacherId:schedule.teacherId,guardianId:schedule.guardianId,childId:schedule.childId,kind:'RECURRING',...slot,status:'CONFIRMED',source:'ADVERTISED',sourceId:pattern.id}});
  await db.lesson.create({data:{placementId:schedule.placementId,recurringScheduleId:schedule.id,reservationId:reservation.id,teacherId:schedule.teacherId,childId:schedule.childId,kind:'RECURRING',subject:request.subject,...slot}});
  if(request.mode==='ONLINE') {const meeting=await db.meeting.create({data:{reservationId:reservation.id,providerMode:meetings.mode()}});await db.outbox.create({data:{type:'meeting.create_requested',aggregateId:meeting.id,payload:{version:meeting.version}}});}
  blocks.push(slot);created++;
 }
 await db.recurringSchedule.update({where:{id:schedule.id},data:{materializedUntil:end}});
 return {created,horizonDays:60};
}
module.exports={intervals,materialize};
