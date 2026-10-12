import {Placement} from '@prisma/client';
import {DB} from '../../shared';
export async function closePlacement(db:DB,p:Placement){
 const now=new Date();
 const lessons=await db.lesson.findMany({where:{placementId:p.id,status:'SCHEDULED',startsAt:{gte:now}},select:{id:true,reservationId:true}});
 const ids=lessons.flatMap(l=>l.reservationId?[l.reservationId]:[]);
 await db.lesson.updateMany({where:{id:{in:lessons.map(l=>l.id)}},data:{status:'CANCELLED',version:{increment:1}}});
 await db.reservation.updateMany({where:{id:{in:ids}},data:{status:'CANCELLED',version:{increment:1}}});
 await db.meeting.updateMany({where:{reservationId:{in:ids}},data:{status:'CANCELLED',joinUrl:null,version:{increment:1}}});
 await db.recurringSchedule.updateMany({where:{placementId:p.id,status:{in:['PROPOSED','ACCEPTED']}},data:{status:'SUPERSEDED',version:{increment:1}}});
 await db.note.updateMany({where:{childId:p.childId,guardianId:p.guardianId,sharedTeacherId:p.teacherId},data:{sharedTeacherId:null,version:{increment:1}}});
 const calls=await db.consultation.findMany({where:{placementId:p.id,status:{in:['REQUESTED','ACCEPTED']},startsAt:{gte:now}}});
 const accepted=calls.filter(c=>c.status==='ACCEPTED').length;
 if(accepted)await db.membership.update({where:{guardianId:p.guardianId},data:{reserved:{decrement:accepted},version:{increment:1}}});
 await db.consultation.updateMany({where:{id:{in:calls.map(c=>c.id)}},data:{status:'CANCELLED',version:{increment:1}}});
 await db.reservation.updateMany({where:{kind:'CONSULTATION',topic:{in:calls.map(c=>c.id)}},data:{status:'CANCELLED',version:{increment:1}}});
 await db.tuitionRequest.update({where:{id:p.requestId},data:{status:'CLOSED',version:{increment:1}}});
 return db.placement.update({where:{id:p.id},data:{status:'CLOSED',closedAt:now,version:{increment:1}}});
}
