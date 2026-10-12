import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {materialize} from '@bcs/scheduling';
import * as meetings from '@bcs/meetings';
import * as files from '@bcs/evidence';
import {randomUUID} from 'node:crypto';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
if (process.env.APP_MODE!=='development' || process.env.NODE_ENV==='production') throw new Error('No live delivery adapters configured.');
let stopping=false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{stopping=true;});
async function deliverMeeting(id:string,eventVersion?:number){
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
  const meeting=await tx.meeting.findUnique({where:{id}});if(!meeting||meeting.status!=='PENDING'||(eventVersion&&meeting.version!==eventVersion))return;
  const reservation=await tx.reservation.findUniqueOrThrow({where:{id:meeting.reservationId}}),now=new Date();
  if(reservation.status!=='CONFIRMED'||reservation.endsAt<=now){await tx.meeting.update({where:{id},data:{status:'CANCELLED',joinUrl:null,version:{increment:1}}});return;}
  if(reservation.startsAt.getTime()>now.getTime()+24*3600000){await tx.meeting.update({where:{id},data:{retryAt:new Date(reservation.startsAt.getTime()-24*3600000)}});return;}
  try{
   const provider=await meetings.create(reservation.id);const updated=await tx.meeting.update({where:{id},data:{...provider,status:'READY',failureCode:null,retryAt:null,version:{increment:1}}});
   await tx.audit.create({data:{actorId:reservation.guardianId,action:'MEETING_CREATED_SYSTEM',aggregateId:id,reason:'Automated private Google Meet delivery',requestId:randomUUID(),after:{providerMode:updated.providerMode,status:updated.status}}});
  }catch{
   const attempts=meeting.attempts+1,failed=attempts>=5;await tx.meeting.update({where:{id},data:{attempts,status:failed?'FAILED':'PENDING',failureCode:'PROVIDER_UNAVAILABLE',retryAt:failed?null:new Date(Date.now()+attempts*300000),version:{increment:1}}});
   if(failed&&!await tx.supportCase.findFirst({where:{category:'MEETING_DELIVERY',status:'OPEN',description:{contains:id}}})){const support=await tx.supportCase.create({data:{accountId:reservation.guardianId,category:'MEETING_DELIVERY',description:`Private meeting ${id} could not be delivered; operator retry is required.`}});await tx.outbox.create({data:{type:'support.meeting_review_requested',aggregateId:support.id,payload:{version:1}}});}
  }
 },{timeout:20000});
}
async function deliverDueMeeting(){
 await db.$executeRaw`UPDATE "Meeting" m SET status='CANCELLED', "joinUrl"=NULL, version=m.version+1, "updatedAt"=CURRENT_TIMESTAMP FROM "Reservation" r WHERE r.id=m."reservationId" AND m.status='PENDING' AND (r.status<>'CONFIRMED' OR r."endsAt"<=CURRENT_TIMESTAMP)`;
 const due=await db.$queryRaw<{id:string}[]>`SELECT m.id FROM "Meeting" m JOIN "Reservation" r ON r.id=m."reservationId" WHERE m.status='PENDING' AND (m."retryAt" IS NULL OR m."retryAt"<=CURRENT_TIMESTAMP) AND r."startsAt"<=CURRENT_TIMESTAMP+interval '24 hours' ORDER BY r."startsAt" LIMIT 1`;
 if(due[0])await deliverMeeting(due[0].id);
}
async function extendRecurring(){
 const now=new Date(),schedule=await db.recurringSchedule.findFirst({where:{status:'ACCEPTED',validUntil:{gte:new Date(now.toISOString().slice(0,10))},OR:[{materializedUntil:null},{materializedUntil:{lt:new Date(now.getTime()+59*86400000)}}],AND:[{OR:[{extensionRetryAt:null},{extensionRetryAt:{lt:now}}]}]},orderBy:{createdAt:'asc'}});
 if(!schedule)return;
 try{await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${schedule.guardianId},0))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${schedule.teacherId},0))`;
  const current=await tx.recurringSchedule.findUniqueOrThrow({where:{id:schedule.id}});
  if(current.status!=='ACCEPTED'||(current.materializedUntil&&current.materializedUntil>=new Date(now.getTime()+59*86400000)))return;
  const result=await materialize(tx,current,now);
  await tx.recurringSchedule.update({where:{id:current.id},data:{extensionRetryAt:null}});
  await tx.audit.create({data:{actorId:current.guardianId,action:'RECURRING_HORIZON_EXTENDED_SYSTEM',aggregateId:current.id,reason:'Automated accepted-calendar extension',requestId:randomUUID(),after:result}});
 },{timeout:20000});}catch{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${schedule.guardianId},0))`;
   const current=await tx.recurringSchedule.findUniqueOrThrow({where:{id:schedule.id}});if(current.status!=='ACCEPTED')return;
   await tx.recurringSchedule.update({where:{id:current.id},data:{extensionRetryAt:new Date(Date.now()+3600000)}});
   const existing=await tx.supportCase.findFirst({where:{category:'SCHEDULE_EXTENSION',status:'OPEN',description:{contains:current.id}}});
   if(!existing){const support=await tx.supportCase.create({data:{accountId:current.guardianId,category:'SCHEDULE_EXTENSION',description:`Accepted timetable ${current.id} could not extend; operator review is required. Existing commitments are preserved.`}});await tx.outbox.create({data:{type:'support.schedule_review_requested',aggregateId:support.id,payload:{version:1}}});}
  });
 }
}
async function tick() {
  await deliverDueMeeting();
  await extendRecurring();
  await db.reservation.updateMany({where:{status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED',version:{increment:1}}});
  return db.$transaction(async tx=>{
    const jobs=await tx.$queryRaw<{id:string;type:string;aggregateId:string;payload:{version:number}}[]>`SELECT id,type,"aggregateId",payload FROM "Outbox" WHERE "processedAt" IS NULL AND attempts < 5 ORDER BY CASE WHEN type='evidence.scan_requested' THEN 0 ELSE 1 END,"createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    for (const job of jobs) {
      if(job.type==='privacy.evidence_delete_requested'){
        try{files.remove(job.aggregateId);await tx.evidence.updateMany({where:{id:job.aggregateId},data:{status:'DELETED',version:{increment:1}}});await tx.outbox.update({where:{id:job.id},data:{processedAt:new Date(),attempts:{increment:1}}});}catch{await tx.outbox.update({where:{id:job.id},data:{attempts:{increment:1}}});}continue;
      }
      if(job.type==='evidence.scan_requested') {
        const evidence=await tx.evidence.findUnique({where:{id:job.aggregateId}});
        if(evidence?.status==='QUARANTINED'&&evidence.version===job.payload.version) {
          try {
            const bytes=files.read(evidence.id);if(files.digest(bytes)!==evidence.sha256)throw new Error('EVIDENCE_INTEGRITY');
            const result=await files.scan(bytes);
            const changed=await tx.evidence.updateMany({where:{id:evidence.id,version:evidence.version,status:'QUARANTINED'},data:{...result,scannedAt:new Date(),version:{increment:1}}});
            if(changed.count) {const teacher=await tx.teacher.findUniqueOrThrow({where:{id:evidence.teacherId}});await tx.audit.create({data:{actorId:teacher.accountId,action:'EVIDENCE_SCANNED_SYSTEM',aggregateId:evidence.id,reason:'Automated ClamAV scan of uploader-submitted evidence',requestId:randomUUID(),after:{status:result.status,scannerVersion:result.scannerVersion}}});}
          } catch {await tx.outbox.update({where:{id:job.id},data:{attempts:{increment:1}}});continue;}
        }
        await tx.outbox.update({where:{id:job.id},data:{processedAt:new Date(),attempts:{increment:1}}});continue;
      }
      // Meeting delivery is claimed by deliverDueMeeting outside this transaction.
      // Keeping provider I/O away from a locked outbox transaction avoids a
      // second connection waiting on state held by this one.
      if(job.type==='meeting.create_requested') {await tx.outbox.update({where:{id:job.id},data:{processedAt:new Date(),attempts:{increment:1}}});continue;}
      // shortcut: only synthetic notification delivery; configure real adapters and reconciliation before pilot.
      if (job.type==='refund.requested') continue;
      await tx.outbox.update({where:{id:job.id},data:{processedAt:new Date(),attempts:{increment:1}}});
      console.log(JSON.stringify({event:'synthetic-delivery',jobId:job.id,type:job.type}));
    }
  },{timeout:20000});
}
async function main() {
  console.log('Development worker: synthetic notifications; refunds remain pending for provider integration.');
  while (!stopping) {try {await tick();} catch {console.error('Worker cycle failed; will retry without acknowledging jobs.');} if(process.env.WORKER_ONCE==='1')break;await new Promise(resolve=>setTimeout(resolve,2000));}
  await db.$disconnect();
}
main().catch(()=>{process.exitCode=1;});
