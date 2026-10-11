import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
if (process.env.APP_MODE!=='development' || process.env.NODE_ENV==='production') throw new Error('No live delivery adapters configured.');
let stopping=false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{stopping=true;});
async function tick() {
  await db.reservation.updateMany({where:{status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED',version:{increment:1}}});
  return db.$transaction(async tx=>{
    const jobs=await tx.$queryRaw<{id:string;type:string}[]>`SELECT id,type FROM "Outbox" WHERE "processedAt" IS NULL AND attempts < 5 ORDER BY "createdAt" LIMIT 20 FOR UPDATE SKIP LOCKED`;
    for (const job of jobs) {
      // shortcut: only synthetic notification delivery; configure real adapters and reconciliation before pilot.
      if (job.type==='refund.requested') continue;
      await tx.outbox.update({where:{id:job.id},data:{processedAt:new Date(),attempts:{increment:1}}});
      console.log(JSON.stringify({event:'synthetic-delivery',jobId:job.id,type:job.type}));
    }
  });
}
async function main() {
  console.log('Development worker: synthetic notifications; refunds remain pending for provider integration.');
  while (!stopping) {try {await tick();} catch {console.error('Worker cycle failed; will retry without acknowledging jobs.');} await new Promise(resolve=>setTimeout(resolve,2000));}
  await db.$disconnect();
}
main().catch(()=>{process.exitCode=1;});
