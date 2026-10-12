import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import * as files from '@bcs/evidence';
import {randomUUID} from 'node:crypto';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
if (process.env.APP_MODE!=='development' || process.env.NODE_ENV==='production') throw new Error('No live delivery adapters configured.');
let stopping=false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{stopping=true;});
async function tick() {
  await db.reservation.updateMany({where:{status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED',version:{increment:1}}});
  return db.$transaction(async tx=>{
    const jobs=await tx.$queryRaw<{id:string;type:string;aggregateId:string;payload:{version:number}}[]>`SELECT id,type,"aggregateId",payload FROM "Outbox" WHERE "processedAt" IS NULL AND attempts < 5 ORDER BY CASE WHEN type='evidence.scan_requested' THEN 0 ELSE 1 END,"createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    for (const job of jobs) {
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
