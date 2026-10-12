import {Module,Controller,Get,Query,Req,Inject} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,fail,parse} from '../../shared';
const range=z.object({from:z.iso.datetime({offset:true}),to:z.iso.datetime({offset:true})}).strict();
function window(query:unknown){const data=parse(range,query),from=new Date(data.from),to=new Date(data.to);if(to<=from||to.getTime()-from.getTime()>366*86400000)fail(400,'INVALID_RANGE','Use a date range of up to one year.');return {from,to,timezone:'Asia/Kolkata',metricVersion:'operations-v1'};}
function amounts(row:Record<string,bigint|number>){return Object.fromEntries(Object.entries(row).map(([key,value])=>{const number=Number(value);if(!Number.isSafeInteger(number))fail(503,'REPORT_LIMIT','Report exceeds safe integer limits.');return [key,number];}));}
@Controller('api/v1')
class AnalyticsController{
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('admin/reports/funnel') async funnel(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['ADMIN','OPERATOR']),w=window(query),region=actor.role==='OPERATOR'?actor.region:null;
  const items=await this.service.db.$queryRaw<Record<string,string|number>[]>(Prisma.sql`
   WITH cohort AS (SELECT * FROM "TuitionRequest" r WHERE r."createdAt">=${w.from} AND r."createdAt"<${w.to} AND (${region}::text IS NULL OR r.region=${region}))
   SELECT c."discoveryMethod",count(*)::int AS requests,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "RecommendationPresentation" x WHERE x."requestId"=c.id AND x.kind='OPERATOR_PUBLISHED'))::int AS published,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "RecommendationPresentation" x WHERE x."requestId"=c.id AND x.kind='GUARDIAN_SHOWN'))::int AS shown,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Recommendation" r JOIN "CandidateDecision" d ON d."candidateId"=r.id WHERE r."requestId"=c.id AND d.action='ACCEPTED'))::int AS "teacherAccepted",
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Demo" d WHERE d."requestId"=c.id AND d.status='COMPLETED'))::int AS "demoCompleted",
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Placement" p WHERE p."requestId"=c.id AND p."startedAt" IS NOT NULL))::int AS started
   FROM cohort c GROUP BY c."discoveryMethod" ORDER BY c."discoveryMethod"`);
  const stats=await this.service.db.$queryRaw<Record<string,number>[]>(Prisma.sql`
   SELECT count(*) FILTER (WHERE p."startedAt" IS NOT NULL AND p."startedAt"<=CURRENT_TIMESTAMP-interval '30 days')::int AS mature,
    count(o.id) FILTER (WHERE o.continued IS NOT NULL)::int AS observed,
    count(o.id) FILTER (WHERE o.continued=TRUE)::int AS continued,
    count(*) FILTER (WHERE p."startedAt" IS NULL)::int AS "missingStartEvidence"
   FROM "Placement" p JOIN "TuitionRequest" r ON r.id=p."requestId" LEFT JOIN "ContinuationObservation" o ON o."placementId"=p.id
   WHERE r."createdAt">=${w.from} AND r."createdAt"<${w.to} AND (${region}::text IS NULL OR r.region=${region})`);
  const cohort=stats[0];await this.service.audit(this.service.db,actor,req,'FUNNEL_REPORT_READ','reports','Staff accessed aggregate service reporting');return {window:w,region,items:items.map(row=>({...row,conversion:{numerator:row.started,denominator:row.requests}})),continuation:{...cohort,unobserved:cohort.mature-cohort.observed,denominator:cohort.observed,rate:cohort.observed?cohort.continued/cohort.observed:null},asOf:new Date()};
 }
 @Get('admin/reports/finance') async finance(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['ADMIN','FINANCE']),w=window(query);
  const [captured,refunds,invoices,payables]=await Promise.all([
   this.service.db.payment.aggregate({where:{createdAt:{gte:w.from,lt:w.to},status:'CAPTURED'},_sum:{amountPaise:true},_count:true}),
   this.service.db.refund.aggregate({where:{createdAt:{gte:w.from,lt:w.to},status:'PENDING'},_sum:{amountPaise:true},_count:true}),
   this.service.db.invoice.aggregate({where:{status:'DUE'},_sum:{amountPaise:true},_count:true}),
   this.service.db.teacherPayable.groupBy({by:['status'],where:{createdAt:{gte:w.from,lt:w.to}},_sum:{amountPaise:true},_count:true})
  ]);
  await this.service.audit(this.service.db,actor,req,'FINANCE_REPORT_READ','reports','Finance accessed aggregate captured-funds and obligation reporting');return {window:w,currency:'INR',captured:amounts({count:captured._count,amountPaise:captured._sum.amountPaise||0}),pendingRefunds:amounts({count:refunds._count,amountPaise:refunds._sum.amountPaise||0}),outstandingInvoices:{...amounts({count:invoices._count,amountPaise:invoices._sum.amountPaise||0}),basis:'CURRENT_ALL_TIME'},teacherPayables:payables.map(p=>({status:p.status,...amounts({count:p._count,amountPaise:p._sum.amountPaise||0})})),providerSettlementVerified:false,asOf:new Date()};
 }
}
@Module({imports:[PersistenceModule],controllers:[AnalyticsController]})
export class AnalyticsModule{}
