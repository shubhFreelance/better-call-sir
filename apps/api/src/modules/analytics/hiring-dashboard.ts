import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {AppService,HttpRequest,parse,fail,uuid} from '../../shared';
import {matched} from '../matching/eligibility';
import {placementFee} from '../../policies';
export async function hiringDashboard(service:AppService,req:HttpRequest,input:unknown){
 const actor=await service.actor(req,['GUARDIAN','STUDENT','TEACHER','ADMIN']),data=parse(z.object({section:z.enum(['ENQUIRIES','ARRANGEMENTS']).default('ENQUIRIES'),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:uuid.optional(),arrangementId:uuid.optional()}).strict(),input),now=new Date();
 const result=await service.db.$transaction(async db=>{
  if(data.arrangementId&&data.cursor)fail(400,'INVALID_FILTER','A linked agreement does not use pagination.');
  if(data.arrangementId&&data.section!=='ARRANGEMENTS')fail(400,'INVALID_FILTER','Open arrangements to view a linked agreement.');
  if(actor.role==='ADMIN'){
   if(data.arrangementId)fail(400,'INVALID_FILTER','Use the dedicated administrative arrangement queues.');
   if(data.cursor)fail(400,'INVALID_CURSOR','Use the dedicated administrative queues to paginate.');
   const [requests,teachers,placements,cases,privacy,jobs]=await Promise.all([db.tuitionRequest.groupBy({by:['status','matchStatus'],_count:true}),db.teacher.groupBy({by:['status'],_count:true}),db.placement.groupBy({by:['status'],_count:true}),db.supportCase.count({where:{status:{notIn:['CLOSED','RESOLVED']}}}),db.privacyRequest.count({where:{status:'PENDING'}}),db.outbox.count({where:{processedAt:null,attempts:{gte:5}}})]);
   return {role:actor.role,asOf:now,definitionVersion:'hiring-v1',section:data.section,enquiries:[],arrangements:[],learners:[],learnersLimited:false,nextCursor:null,counts:{enquiries:requests.reduce((s,r)=>s+r._count,0),openEnquiries:requests.filter(r=>r.status==='OPEN').reduce((s,r)=>s+r._count,0),pendingResponses:0,termsPending:placements.filter(r=>r.status==='TERMS_PENDING').reduce((s,r)=>s+r._count,0),activeArrangements:placements.filter(r=>r.status==='ACTIVE').reduce((s,r)=>s+r._count,0)},operations:{requests:requests.map(r=>({status:r.status,matchStatus:r.matchStatus,count:r._count})),teachers:teachers.map(r=>({status:r.status,count:r._count})),arrangements:placements.map(r=>({status:r.status,count:r._count})),openSupport:cases,pendingPrivacy:privacy,failedJobs:jobs}};
  }
  const teacher=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null,tid=teacher?.id||'00000000-0000-4000-8000-000000000000';
  const ownChild=actor.role==='GUARDIAN'?{guardianId:actor.id}:actor.role==='STUDENT'?{studentAccountId:actor.id}:{id:{in:[]}};
  const childIds=(await db.child.findMany({where:ownChild,select:{id:true}})).map(c=>c.id);
  const consent=actor.role==='GUARDIAN'?await db.consent.findUnique({where:{guardianId:actor.id}}):null;
  const paused=actor.role==='GUARDIAN'?!!await db.privacyRequest.findFirst({where:{accountId:actor.id,kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'}}):false;
  const familyScope=Prisma.sql`r."childId" IN (SELECT c.id FROM "Child" c WHERE c.id=ANY(${childIds}::uuid[]))`;
  // Keep unpresented, expired and processing-paused family enquiries out of teacher discovery.
  const teacherScope=Prisma.sql`r.status='OPEN' AND EXISTS(SELECT 1 FROM "Recommendation" x WHERE x."requestId"=r.id AND x."teacherId"=${tid}::uuid AND x."presentedAt" IS NOT NULL AND x."runId" IS NOT NULL AND x."expiresAt">${now}) AND EXISTS(SELECT 1 FROM "Account" a JOIN "Consent" c ON c."guardianId"=a.id WHERE a.id=r."guardianId" AND a.verified AND NOT a.disabled AND c."withdrawnAt" IS NULL) AND NOT EXISTS(SELECT 1 FROM "PrivacyRequest" p WHERE p."accountId"=r."guardianId" AND p.kind='DELETION' AND p.scope IN ('ACCOUNT','CHILD') AND p.status='PENDING')`;
  const scope=actor.role==='TEACHER'?teacherScope:familyScope;
  const placementWhere={...(actor.role==='TEACHER'?{teacherId:tid}:{childId:{in:childIds}}),...(data.arrangementId?{id:data.arrangementId}:{})};
  if(data.arrangementId&&!await db.placement.count({where:placementWhere}))fail(404,'NOT_FOUND','Arrangement not found.');
  const totals=await db.$queryRaw<{enquiries:bigint;openEnquiries:bigint;pendingResponses:bigint}[]>(Prisma.sql`SELECT count(*) AS enquiries,count(*) FILTER(WHERE r.status='OPEN') AS "openEnquiries",count(*) FILTER(WHERE EXISTS(SELECT 1 FROM "Recommendation" x WHERE x."requestId"=r.id AND x."teacherId"=${tid}::uuid AND x.response='PENDING' AND x."presentedAt" IS NOT NULL AND x."expiresAt">${now})) AS "pendingResponses" FROM "TuitionRequest" r WHERE (${scope})`);
  const counts:Record<string,number>={};for(const [k,v] of Object.entries(totals[0])){const n=Number(v);if(!Number.isSafeInteger(n))fail(503,'REPORT_LIMIT','Dashboard exceeds safe count limits.');counts[k]=n;}
  const [termsPending,activeArrangements,children]=await Promise.all([db.placement.count({where:{...placementWhere,status:'TERMS_PENDING'}}),db.placement.count({where:{...placementWhere,status:'ACTIVE'}}),db.child.findMany({where:ownChild,orderBy:{id:'asc'},take:21,select:{id:true,alias:true,grade:true,board:true,educationStage:true,earlyYearsLevel:true,courseName:true,schoolName:true,schoolSubjects:true}})]);
  const enquiries=[],arrangements=[];let nextCursor:string|null=null;
  if(data.section==='ENQUIRIES'){
   if(data.cursor&&! (await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT r.id FROM "TuitionRequest" r WHERE (${scope}) AND r.id=${data.cursor}::uuid`)).length)fail(404,'NOT_FOUND','Enquiry cursor is outside this dashboard.');
   const rows=await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT r.id FROM "TuitionRequest" r WHERE (${scope}) AND (${data.cursor||null}::uuid IS NULL OR r.id<${data.cursor||null}::uuid) ORDER BY r.id DESC LIMIT ${data.limit+1}`),page=rows.slice(0,data.limit);nextCursor=rows.length>data.limit?page.at(-1)!.id:null;
   for(const row of page){const r=await db.tuitionRequest.findUniqueOrThrow({where:{id:row.id}}),c=await db.child.findUniqueOrThrow({where:{id:r.childId}}),candidate=teacher?await db.recommendation.findUnique({where:{requestId_teacherId:{requestId:r.id,teacherId:teacher.id}}}):null;
    enquiries.push({id:r.id,subject:r.subject,mode:r.mode,language:r.language,locality:r.locality,discoveryMethod:r.discoveryMethod,status:r.status,matchStatus:r.matchStatus,scheduleStatus:r.scheduleStatus,createdAt:r.createdAt,learner:{alias:actor.role==='TEACHER'?null:c.alias,grade:c.grade,board:c.board},hasSelection:!!r.selectedCandidateId,...(actor.role==='GUARDIAN'?{budgetPaise:r.budgetPaise}:{}),...(candidate?{candidate:{id:candidate.id,version:candidate.version,response:candidate.response,expiresAt:candidate.expiresAt,selected:r.selectedCandidateId===candidate.id,eligible:!!await matched(db,r,c,teacher!)}}:{})});}
  }else{
   if(data.cursor&&!await db.placement.count({where:{...placementWhere,id:data.cursor}}))fail(404,'NOT_FOUND','Arrangement cursor is outside this dashboard.');
   const rows=await db.placement.findMany({where:{...placementWhere,...(data.cursor?{id:{lt:data.cursor}}:{})},orderBy:{id:'desc'},take:data.limit+1}),page=rows.slice(0,data.limit);nextCursor=rows.length>data.limit?page.at(-1)!.id:null;
   for(const p of page){const [c,t,r]=await Promise.all([db.child.findUniqueOrThrow({where:{id:p.childId}}),db.teacher.findUniqueOrThrow({where:{id:p.teacherId}}),db.tuitionRequest.findUniqueOrThrow({where:{id:p.requestId}})]);arrangements.push({id:p.id,subject:r.subject,mode:r.mode,status:p.status,guardianAccepted:p.guardianAccepted,teacherAccepted:p.teacherAccepted,guardianStarted:p.guardianStarted,teacherReceiptConfirmed:p.teacherReceiptConfirmed,learner:{alias:c.alias,grade:c.grade,board:c.board},teacher:{id:t.id,name:t.name,status:t.status},...(actor.role==='GUARDIAN'||actor.role==='TEACHER'?{monthlyPaise:p.monthlyPaise,version:p.version,policyVersion:p.policyVersion,placementFeePaise:placementFee(p.monthlyPaise)}: {})});}
  }
  return {role:actor.role,asOf:now,definitionVersion:'hiring-v1',section:data.section,counts:{...counts,termsPending,activeArrangements},enquiries,arrangements,learners:children.slice(0,20),learnersLimited:children.length>20,nextCursor,...(actor.role==='GUARDIAN'?{gate:{verified:actor.verified,consent:!!consent&&!consent.withdrawnAt,privacyPaused:paused}}:{}),...(actor.role==='TEACHER'?{profile:teacher?{id:teacher.id,name:teacher.name,status:teacher.status,subjects:teacher.subjects,screeningComplete:teacher.screeningComplete,screeningValidUntil:teacher.screeningValidUntil,feeTermsAccepted:!!teacher.feeTermsAcceptedAt}:null}: {})};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 if(actor.role==='ADMIN')await service.audit(service.db,actor,req,'HIRING_OVERVIEW_READ','dashboard','Administrator accessed aggregate hiring and operations queues');return result;
}
