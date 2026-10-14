import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {AppService,HttpRequest,parse,fail,uuid} from '../../shared';

const query=z.object({from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
const countFields=['lessons','classesTaken','completedLessons','uniqueStudentsTaught','cancelled','absent','disputed','attendanceDue','attendanceRecorded','pendingAttendance','pendingConfirmations','feedbackSampleSize','ratingSum'] as const;
export async function learningDashboard(service:AppService,req:HttpRequest,input:unknown){
 const actor=await service.actor(req,['GUARDIAN','STUDENT','TEACHER']),data=parse(query,input),now=new Date();
 if(!!data.from!==!!data.to)fail(400,'INVALID_RANGE','Supply both report dates.');
 const from=data.from?new Date(data.from):new Date(now.getTime()-30*86400000),to=data.to?new Date(data.to):now;
 if(to<=from||to.getTime()-from.getTime()>366*86400000)fail(400,'INVALID_RANGE','Choose an ordered range of up to one year.');
 return service.db.$transaction(async db=>{
  const teacher=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id},select:{id:true,name:true,status:true,subjects:true}}):null;
  const teacherId=teacher?.id||(actor.role==='TEACHER'?'00000000-0000-4000-8000-000000000000':null);
  const childScope=actor.role==='GUARDIAN'?Prisma.sql`c."guardianId"=${actor.id}::uuid`:actor.role==='STUDENT'?Prisma.sql`c."studentAccountId"=${actor.id}::uuid`:Prisma.sql`EXISTS(SELECT 1 FROM "Placement" p WHERE p."childId"=c.id AND p."teacherId"=${teacherId}::uuid AND p.status='ACTIVE') OR EXISTS(SELECT 1 FROM "Lesson" l WHERE l."childId"=c.id AND l."teacherId"=${teacherId}::uuid) OR EXISTS(SELECT 1 FROM "Demo" d JOIN "TuitionRequest" r ON r.id=d."requestId" WHERE r."childId"=c.id AND d."teacherId"=${teacherId}::uuid)`;
  if(data.cursor){const valid=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT c.id FROM "Child" c WHERE c.id=${data.cursor}::uuid AND (${childScope})`);if(!valid.length)fail(404,'NOT_FOUND','Learner cursor is outside this dashboard.');}
  const children=await db.$queryRaw<{id:string;alias:string;grade:number;board:string}[]>(Prisma.sql`SELECT c.id,c.alias,c.grade,c.board FROM "Child" c WHERE (${childScope}) AND (${data.cursor||null}::uuid IS NULL OR c.id>${data.cursor||null}::uuid) ORDER BY c.id LIMIT ${data.limit+1}`),page=children.slice(0,data.limit);
  const scope=actor.role==='TEACHER'?Prisma.sql`l."teacherId"=${teacherId}::uuid`:Prisma.sql`EXISTS(SELECT 1 FROM "Child" c WHERE c.id=l."childId" AND (${childScope}))`;
  const stats=await db.$queryRaw<(Record<string,bigint>&{childId:string|null;kind:string|null;childGroup:number;kindGroup:number})[]>(Prisma.sql`
   WITH records AS (SELECT l.*,c."guardianId",c."studentAccountId",(l.status='COMPLETED' AND l.attendance IN ('PRESENT','LATE') AND NOT l.disputed AND l."endsAt"<=${now}) AS verified,
    EXISTS(SELECT 1 FROM "LessonConfirmation" x WHERE x."lessonId"=l.id AND x."actorId" IN (c."guardianId",c."studentAccountId") AND x.action='CONFIRMED' AND x."lessonVersion"=l.version) AS confirmed,
    (SELECT f.rating FROM "LessonFeedback" f WHERE f."lessonId"=l.id AND f."guardianId"=c."guardianId" AND f."createdAt"<=${now}) AS rating
    FROM "Lesson" l JOIN "Child" c ON c.id=l."childId" WHERE (${scope}) AND l."startsAt">=${from} AND l."startsAt"<${to})
   SELECT "childId",kind,GROUPING("childId") AS "childGroup",GROUPING(kind) AS "kindGroup",count(*) AS lessons,
    count(*) FILTER(WHERE verified) AS "classesTaken",count(*) FILTER(WHERE status='COMPLETED' AND "endsAt"<=${now}) AS "completedLessons",
    count(DISTINCT "childId") FILTER(WHERE verified) AS "uniqueStudentsTaught",count(*) FILTER(WHERE status='CANCELLED') AS cancelled,
    count(*) FILTER(WHERE status='COMPLETED' AND attendance='ABSENT' AND NOT disputed AND "endsAt"<=${now}) AS absent,count(*) FILTER(WHERE disputed) AS disputed,
    count(*) FILTER(WHERE status!='CANCELLED' AND "endsAt"<=${now}) AS "attendanceDue",
    count(*) FILTER(WHERE status='COMPLETED' AND attendance IN ('PRESENT','LATE','ABSENT') AND NOT disputed AND "endsAt"<=${now}) AS "attendanceRecorded",
    count(*) FILTER(WHERE status!='CANCELLED' AND "endsAt"<=${now} AND attendance='PENDING') AS "pendingAttendance",
    count(*) FILTER(WHERE verified AND NOT confirmed) AS "pendingConfirmations",
    count(*) FILTER(WHERE verified AND rating IS NOT NULL) AS "feedbackSampleSize",coalesce(sum(rating) FILTER(WHERE verified),0) AS "ratingSum"
   FROM records GROUP BY GROUPING SETS ((),(kind),("childId"))`);
  function metrics(row:Record<string,unknown>|undefined){const result:Record<string,number| null>={};for(const k of countFields){const n=Number(row?.[k]||0);if(!Number.isSafeInteger(n))fail(503,'REPORT_LIMIT','Dashboard exceeds safe integer limits.');result[k]=n;}if(actor.role==='TEACHER')result.feedbackAverage=result.feedbackSampleSize?Number(result.ratingSum)/Number(result.feedbackSampleSize):null;else{delete result.feedbackSampleSize;}delete result.ratingSum;return result;}
  const placementScope=actor.role==='TEACHER'?{teacherId:teacher?.id||'00000000-0000-4000-8000-000000000000'}:actor.role==='GUARDIAN'?{guardianId:actor.id}:{childId:{in:page.map(c=>c.id)}};
  const active=await db.placement.findMany({where:{...placementScope,status:'ACTIVE'},select:{childId:true}});
  async function demoMetrics(childId:string|null){const rows=await db.$queryRaw<{scheduled:bigint;completed:bigint;cancelled:bigint;noShow:bigint;disputed:bigint}[]>(Prisma.sql`SELECT count(*) AS scheduled,count(*) FILTER(WHERE d.status='COMPLETED') AS completed,count(*) FILTER(WHERE d.status='CANCELLED') AS cancelled,count(*) FILTER(WHERE d."guardianOutcome"='NO_SHOW' OR d."teacherOutcome"='NO_SHOW') AS "noShow",count(*) FILTER(WHERE d.status='DISPUTED') AS disputed FROM "Demo" d JOIN "TuitionRequest" r ON r.id=d."requestId" JOIN "Child" c ON c.id=r."childId" JOIN "Reservation" v ON v.id=d."reservationId" WHERE (${childScope}) AND (${childId}::uuid IS NULL OR r."childId"=${childId}::uuid) AND (${teacherId}::uuid IS NULL OR d."teacherId"=${teacherId}::uuid) AND v."startsAt">=${from} AND v."startsAt"<${to}`);return Object.fromEntries(Object.entries(rows[0]).map(([key,value])=>{const n=Number(value);if(!Number.isSafeInteger(n))fail(503,'REPORT_LIMIT','Dashboard exceeds safe integer limits.');return [key,n];}));}
  const learners=[];
  for(const child of page){
   const assignments=await db.$queryRaw<{teacherId:string;name:string;subject:string;status:string}[]>(Prisma.sql`SELECT p."teacherId",t.name,r.subject,t.status FROM "Placement" p JOIN "Teacher" t ON t.id=p."teacherId" JOIN "TuitionRequest" r ON r.id=p."requestId" WHERE p."childId"=${child.id}::uuid AND p.status='ACTIVE' AND (${teacherId}::uuid IS NULL OR p."teacherId"=${teacherId}::uuid) ORDER BY p.id LIMIT 21`);
   const next=await db.$queryRaw<{id:string;kind:string;subject:string;startsAt:Date;endsAt:Date;teacherName:string}[]>(Prisma.sql`SELECT l.id,l.kind,l.subject,l."startsAt",l."endsAt",t.name AS "teacherName" FROM "Lesson" l JOIN "Teacher" t ON t.id=l."teacherId" WHERE l."childId"=${child.id}::uuid AND (${scope}) AND l.status='SCHEDULED' AND l."startsAt">=${now} ORDER BY l."startsAt",l.id LIMIT 1`);
   learners.push({learner:child,metrics:metrics(stats.find(x=>x.childGroup===0&&x.childId===child.id)),assignments:assignments.slice(0,20),assignmentsLimited:assignments.length>20,nextLesson:next[0]||null,demos:await demoMetrics(child.id)});
  }
  return {role:actor.role,window:{from,to,timezone:'Asia/Kolkata',metricVersion:'learning-dashboard-v2',basis:'LESSON_STARTS_AT',endExclusive:true},lastUpdated:now,metrics:metrics(stats.find(x=>x.childGroup===1&&x.kindGroup===1)),activeStudents:new Set(active.map(p=>p.childId)).size,demos:await demoMetrics(null),serviceKinds:stats.filter(x=>x.kindGroup===0).map(x=>({kind:x.kind,metrics:metrics(x)})).sort((a,b)=>a.kind!.localeCompare(b.kind!)),learners,nextCursor:children.length>data.limit?page.at(-1)!.id:null,...(actor.role==='TEACHER'?{profile:teacher}:{}),...(actor.role==='GUARDIAN'?{membership:await db.membership.findUnique({where:{guardianId:actor.id},select:{status:true,allowance:true,used:true,reserved:true,periodEnd:true}})}:{})};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
