import {Prisma} from '@prisma/client';

export async function createRevisionFulfillment(db:Prisma.TransactionClient,reservation:{id:string;teacherId:string;childId:string|null;startsAt:Date;endsAt:Date;subject:string;payablePaise:number;pricePolicyVersion:string},payment:{id:string}){
 if(!reservation.childId)throw new Error('REVISION_CHILD_REQUIRED');
 const lesson=await db.lesson.upsert({where:{reservationId:reservation.id},create:{reservationId:reservation.id,teacherId:reservation.teacherId,childId:reservation.childId,kind:'REVISION',subject:reservation.subject,startsAt:reservation.startsAt,endsAt:reservation.endsAt},update:{}});
 const payable=await db.teacherPayable.upsert({where:{paymentId:payment.id},create:{paymentId:payment.id,lessonId:lesson.id,teacherId:reservation.teacherId,amountPaise:reservation.payablePaise,policyVersion:reservation.pricePolicyVersion},update:{}});
 return {lesson,payable};
}
