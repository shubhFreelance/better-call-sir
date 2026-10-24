import {Module,Controller,Get,Query,Req,Inject} from '@nestjs/common';
import {hiringDashboard} from './hiring-dashboard';
import {learningDashboard} from './learning-dashboard';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,fail,parse,uuid} from '../../shared';
const range=z.object({from:z.iso.datetime({offset:true}),to:z.iso.datetime({offset:true})}).strict();
function window(query:unknown){const data=parse(range,query),from=new Date(data.from),to=new Date(data.to);if(to<=from||to.getTime()-from.getTime()>366*86400000)fail(400,'INVALID_RANGE','Use a date range of up to one year.');return {from,to,timezone:'Asia/Kolkata',metricVersion:'operations-v1'};}
function amounts(row:Record<string,bigint|number>){return Object.fromEntries(Object.entries(row).map(([key,value])=>{const number=Number(value);if(!Number.isSafeInteger(number))fail(503,'REPORT_LIMIT','Report exceeds safe integer limits.');return [key,number];}));}
@Controller('api/v1')
class AnalyticsController{
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('teacher/pending-enquiries') async pendingEnquiries(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['TEACHER']);
  const q=parse(z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(50).default(10)}).strict(),query);
  const teacher=await this.service.db.teacher.findUnique({where:{accountId:actor.id}});
  if(!teacher||!(await this.service.publicTeachers({id:teacher.id},1)).length)return {items:[],nextCursor:null};
  return this.service.db.$transaction(async db=>{
   const scope=Prisma.sql`r."preferredTeacherId"=${teacher.id}::uuid AND r.status='OPEN' AND EXISTS(SELECT 1 FROM "Account" a JOIN "Consent" c ON c."guardianId"=a.id WHERE a.id=r."guardianId" AND a.verified AND NOT a.disabled AND c."withdrawnAt" IS NULL) AND EXISTS(SELECT 1 FROM "Child" ch WHERE ch.id=r."childId" AND (ch."guardianVerificationId" IS NULL OR EXISTS(SELECT 1 FROM "GuardianVerification" v WHERE v.id=ch."guardianVerificationId" AND v.status='APPROVED'))) AND NOT EXISTS(SELECT 1 FROM "PrivacyRequest" p WHERE p."accountId"=r."guardianId" AND p.kind='DELETION' AND p.scope IN ('ACCOUNT','CHILD') AND p.status='PENDING') AND NOT EXISTS(SELECT 1 FROM "Recommendation" x WHERE x."requestId"=r.id AND x."teacherId"=${teacher.id}::uuid AND x."presentedAt" IS NOT NULL AND x."runId" IS NOT NULL AND x."expiresAt">now())`;
   if(q.cursor&&!(await db.$queryRaw<{id:string}[]>(Prisma.sql`SELECT r.id FROM "TuitionRequest" r WHERE ${scope} AND r.id=${q.cursor}::uuid`)).length)fail(404,'NOT_FOUND','Enquiry cursor is unavailable.');
   const rows=await db.$queryRaw<{id:string;subject:string;mode:string;createdAt:Date}[]>(Prisma.sql`SELECT r.id,r.subject,r.mode,r."createdAt" FROM "TuitionRequest" r WHERE ${scope} AND (${q.cursor||null}::uuid IS NULL OR r.id<${q.cursor||null}::uuid) ORDER BY r.id DESC LIMIT ${q.limit+1}`);
   return {items:rows.slice(0,q.limit),nextCursor:rows.length>q.limit?rows[q.limit-1].id:null};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 @Get('dashboard/hiring') async hiring(@Req() req:HttpRequest,@Query() query:unknown){return hiringDashboard(this.service,req,query);}
 @Get('dashboard/learning') async learning(@Req() req:HttpRequest,@Query() query:unknown){return learningDashboard(this.service,req,query);}
 @Get('admin/reports/regions') async regions(@Req() req:HttpRequest){const actor=await this.service.actor(req,['ADMIN','OPERATOR']);const rows=actor.role==='OPERATOR'?[{region:actor.region}]:await this.service.db.tuitionRequest.findMany({distinct:['region'],select:{region:true},orderBy:{region:'asc'},take:101});await this.service.audit(this.service.db,actor,req,'REPORT_REGIONS_READ','reports','Staff accessed scoped report region choices');return {items:rows.slice(0,100),limited:rows.length>100,scope:actor.role==='OPERATOR'?'REGION':'GLOBAL'};}
 @Get('admin/reports/funnel') async funnel(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['ADMIN','OPERATOR']),data=parse(range.extend({region:z.string().trim().min(1).max(80).optional()}).strict(),query),w=window({from:data.from,to:data.to}),region=actor.role==='OPERATOR'?actor.region:data.region||null;
  if(actor.role==='OPERATOR'&&data.region&&data.region!==actor.region)fail(403,'REGION_FORBIDDEN','Operators can report only their assigned region.');
  const asOf=new Date(),matureBefore=new Date(asOf.getTime()-30*86400000);
  const report=await this.service.db.$transaction(async db=>{
   const items=await db.$queryRaw<{discoveryMethod:string;requests:bigint;published:bigint;shown:bigint;teacherAccepted:bigint;demoCompleted:bigint;started:bigint}[]>(Prisma.sql`
    WITH cohort AS (SELECT * FROM "TuitionRequest" r WHERE r."createdAt">=${w.from} AND r."createdAt"<${w.to} AND r."createdAt"<=${asOf} AND (${region}::text IS NULL OR r.region=${region}))
    SELECT c."discoveryMethod",count(*) AS requests,
     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "RecommendationPresentation" x WHERE x."requestId"=c.id AND x.kind='OPERATOR_PUBLISHED' AND x."createdAt"<=${asOf})) AS published,
     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "RecommendationPresentation" x WHERE x."requestId"=c.id AND x.kind='GUARDIAN_SHOWN' AND x."createdAt"<=${asOf})) AS shown,
     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Recommendation" r JOIN "CandidateDecision" d ON d."candidateId"=r.id WHERE r."requestId"=c.id AND d.action='ACCEPTED' AND d."createdAt"<=${asOf})) AS "teacherAccepted",
     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Demo" d WHERE d."requestId"=c.id AND d.status='COMPLETED')) AS "demoCompleted",
     count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Placement" p WHERE p."requestId"=c.id AND p."startedAt"<=${asOf})) AS started
    FROM cohort c GROUP BY c."discoveryMethod" ORDER BY c."discoveryMethod"`);
   const stats=await db.$queryRaw<{discoveryMethod:string|null;mature:bigint;observed:bigint;continued:bigint;stopped:bigint;unknown:bigint;missingObservation:bigint;immature:bigint;missingStartEvidence:bigint}[]>(Prisma.sql`
    WITH cohort AS (SELECT p.*,r."discoveryMethod",o.id AS observation,o.continued,(o."observedAt"<=${asOf} AND o."dueAt">=p."startedAt"+interval '30 days' AND o."dueAt"<=${asOf}) AS qualified
     FROM "Placement" p JOIN "TuitionRequest" r ON r.id=p."requestId" LEFT JOIN "ContinuationObservation" o ON o."placementId"=p.id
     WHERE r."createdAt">=${w.from} AND r."createdAt"<${w.to} AND r."createdAt"<=${asOf} AND (${region}::text IS NULL OR r.region=${region}))
    SELECT "discoveryMethod",count(*) FILTER (WHERE "startedAt"<=${matureBefore}) AS mature,
     count(*) FILTER (WHERE "startedAt"<=${matureBefore} AND qualified AND continued IS NOT NULL) AS observed,
     count(*) FILTER (WHERE "startedAt"<=${matureBefore} AND qualified AND continued=TRUE) AS continued,
     count(*) FILTER (WHERE "startedAt"<=${matureBefore} AND qualified AND continued=FALSE) AS stopped,
     count(*) FILTER (WHERE "startedAt"<=${matureBefore} AND qualified AND continued IS NULL) AS unknown,
     count(*) FILTER (WHERE "startedAt"<=${matureBefore} AND (observation IS NULL OR qualified IS NOT TRUE)) AS "missingObservation",
     count(*) FILTER (WHERE "startedAt">${matureBefore}) AS immature,
     count(*) FILTER (WHERE "startedAt" IS NULL) AS "missingStartEvidence"
    FROM cohort GROUP BY GROUPING SETS ((),("discoveryMethod"))`);
   const metrics=stats.map(({discoveryMethod,...values})=>{const cohort=amounts(values);return {discoveryMethod,...cohort,unobserved:cohort.unknown+cohort.missingObservation,denominator:cohort.observed,rate:cohort.observed?cohort.continued/cohort.observed:null};}),total=metrics.find(row=>row.discoveryMethod===null)!;const {discoveryMethod,...continuation}=total;return {items:items.map(({discoveryMethod,...values})=>{const row=amounts(values);return {discoveryMethod,...row,conversion:{numerator:row.started,denominator:row.requests}};}),continuation,continuationByMethod:metrics.filter(row=>row.discoveryMethod!==null).sort((a,b)=>a.discoveryMethod!.localeCompare(b.discoveryMethod!))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  await this.service.audit(this.service.db,actor,req,'FUNNEL_REPORT_READ','reports','Staff accessed scoped request-cohort and mature-observation reporting');return {window:w,region,...report,definitionVersion:'funnel-v2',cohortBasis:'REQUEST_CREATED_AT',outcomeBasis:'CURRENT_RECORDED_EVIDENCE',asOf};
 }
 @Get('admin/reports/finance') async finance(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['ADMIN','FINANCE']),w=window(query);
  const asOf=new Date();const report=await this.service.db.$transaction(async db=>{
   const [captured,refunds,invoices,payables,modes]=await Promise.all([
    db.payment.aggregate({where:{createdAt:{gte:w.from,lt:w.to},status:'CAPTURED'},_sum:{amountPaise:true},_count:true}),
    db.refund.aggregate({where:{createdAt:{gte:w.from,lt:w.to},status:'PENDING'},_sum:{amountPaise:true},_count:true}),
    db.invoice.aggregate({where:{status:'DUE'},_sum:{amountPaise:true},_count:true}),
    db.teacherPayable.groupBy({by:['status'],where:{createdAt:{gte:w.from,lt:w.to}},_sum:{amountPaise:true},_count:true}),
    db.$queryRaw<{providerMode:string;count:bigint;amountPaise:bigint}[]>(Prisma.sql`SELECT CASE WHEN o."providerMode" IN ('LIVE','SANDBOX') THEN o."providerMode" ELSE 'UNRECORDED' END AS "providerMode",count(*) AS count,sum(p."amountPaise") AS "amountPaise" FROM "Payment" p LEFT JOIN "CheckoutOrder" o ON o.id=p."checkoutOrderId" WHERE p."createdAt">=${w.from} AND p."createdAt"<${w.to} AND p.status='CAPTURED' GROUP BY 1 ORDER BY 1`)
   ]);
   return {captured:amounts({count:captured._count,amountPaise:captured._sum.amountPaise||0}),pendingRefunds:amounts({count:refunds._count,amountPaise:refunds._sum.amountPaise||0}),outstandingInvoices:{...amounts({count:invoices._count,amountPaise:invoices._sum.amountPaise||0}),basis:'CURRENT_ALL_TIME'},teacherPayables:payables.map(p=>({status:p.status,...amounts({count:p._count,amountPaise:p._sum.amountPaise||0})})),captureModes:modes.map(({providerMode,...values})=>({providerMode,...amounts(values)}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  await this.service.audit(this.service.db,actor,req,'FINANCE_REPORT_READ','reports','Finance accessed aggregate capture classification and separate obligations');return {window:w,currency:'INR',...report,providerSettlementVerified:false,asOf};
 }
}
@Module({imports:[PersistenceModule],controllers:[AnalyticsController]})
export class AnalyticsModule{}
