import {eraseGuardianVerification} from '../verification/guardian-verification';
import {Module,Controller,Get,Post,Param,Query,Body,Req,Inject} from '@nestjs/common';
import {z} from 'zod';
import {Prisma} from '@prisma/client';
import {AppService,PersistenceModule,HttpRequest,DB,uuid,version,text,fail,parse,hash} from '../../shared';

async function erase(db:DB,scope:string,resourceId:string,accountId:string){
 if(scope==='NOTE'){await db.note.updateMany({where:{id:resourceId,guardianId:accountId},data:{text:'[deleted]',sharedTeacherId:null,version:{increment:1}}});return;}
 const children=await db.child.findMany({where:scope==='CHILD'?{id:resourceId,guardianId:accountId}:{guardianId:accountId}}),childIds=children.map(c=>c.id),students=children.flatMap(c=>c.studentAccountId?[c.studentAccountId]:[]);
 await eraseGuardianVerification(db,accountId,childIds,scope==='ACCOUNT');
 if(scope==='ACCOUNT')await db.inboxNotification.deleteMany({where:{accountId:{in:[accountId,...students]}}});
 const erasedTeacher=scope==='ACCOUNT'?await db.teacher.findUnique({where:{accountId}}):null;
 const directWhere={OR:[{childId:{in:childIds}},...(scope==='ACCOUNT'?[{ownerId:accountId},...(erasedTeacher?[{teacherId:erasedTeacher.id}]:[])]:[])]};
 const directIds=(await db.directEnquiry.findMany({where:directWhere,select:{id:true}})).map(row=>row.id);
 const placementIds=(await db.placement.findMany({where:{OR:[{childId:{in:childIds}},...(scope==='ACCOUNT'?[{guardianId:accountId},...(erasedTeacher?[{teacherId:erasedTeacher.id}]:[])]:[])]},select:{id:true}})).map(p=>p.id);
 const independentIds=scope==='ACCOUNT'?(await db.studentArrangement.findMany({where:{OR:[{studentAccountId:accountId},...(erasedTeacher?[{teacherId:erasedTeacher.id}]:[])]},select:{id:true}})).map(a=>a.id):[];
 await db.tuitionBooking.deleteMany({where:{resourceId:{in:[...placementIds,...independentIds]}}});
 for(const id of placementIds)await db.idempotency.deleteMany({where:{operation:{contains:'/tuition-bookings/PLACEMENT/'+id}}});
 for(const id of independentIds)await db.idempotency.deleteMany({where:{operation:{contains:'/tuition-bookings/INDEPENDENT/'+id}}});
 await db.directEnquiry.updateMany({where:{id:{in:directIds}},data:{proposal:Prisma.DbNull,version:{increment:1}}});
 for(const id of directIds)await db.idempotency.deleteMany({where:{operation:{contains:'/direct-enquiries/'+id}}});

 const mailAccounts=await db.account.findMany({where:{id:{in:scope==='ACCOUNT'?[accountId,...students]:students}},select:{id:true,email:true}});
 const mailWhere={OR:[{accountId:{in:mailAccounts.map(a=>a.id)}},{accountId:null,recipientHash:{in:mailAccounts.flatMap(a=>a.email?[hash(a.email.toLowerCase())]:[])}}]};
 const mailIds=(await db.emailDelivery.findMany({where:mailWhere,select:{id:true}})).map(m=>m.id);
 await db.emailDelivery.updateMany({where:{id:{in:mailIds}},data:{encryptedContent:null,recipientHash:null}});
 await db.emailDelivery.updateMany({where:{id:{in:mailIds},status:{in:['QUEUED','SENDING','FAILED','UNKNOWN']}},data:{status:'SUPPRESSED',failureCode:'PRIVACY_ERASED',leaseUntil:null,version:{increment:1}}});

 await db.note.updateMany({where:{childId:{in:childIds}},data:{text:'[deleted]',sharedTeacherId:null,version:{increment:1}}});
 await db.child.updateMany({where:{id:{in:childIds}},data:{learningSpaces:Prisma.DbNull,learningSpacesVersion:{increment:1},schoolName:null,schoolSubjects:[],courseName:null,university:null,studyYear:null,alias:'Deleted learner',studentAccessRevokedAt:new Date(),version:{increment:1}}});
 await db.invitation.deleteMany({where:{childId:{in:childIds}}});
 await db.session.updateMany({where:{accountId:{in:students}},data:{revoked:true,deviceLabel:null}});
 await db.account.updateMany({where:{id:{in:students}},data:{name:'Deleted student',email:null,phone:null,disabled:true}});
 await db.onboardingProgress.updateMany({where:{accountId:{in:[accountId,...students]}},data:{draft:{},version:{increment:1}}});
 await db.idempotency.deleteMany({where:{accountId:{in:[accountId,...students]}}});
 if(scope==='ACCOUNT'){
  const erasedAccount=await db.account.findUniqueOrThrow({where:{id:accountId}});await db.studentGuardianGrant.deleteMany({where:{OR:[{acceptedById:accountId},...(erasedAccount.email?[{recipientEmail:erasedAccount.email.toLowerCase()}]:[])]}});
  await db.independentStudentProfile.deleteMany({where:{accountId}});
  await db.session.updateMany({where:{accountId},data:{revoked:true,deviceLabel:null}});await db.account.update({where:{id:accountId},data:{name:'Deleted account',email:null,phone:null,disabled:true,verified:false}});
  const teacher=await db.teacher.findUnique({where:{accountId}});if(teacher)await db.note.updateMany({where:{sharedTeacherId:teacher.id},data:{sharedTeacherId:null,version:{increment:1}}});
  await db.teacher.updateMany({where:{accountId},data:{teachingCoverage:Prisma.DbNull,address:Prisma.DbNull,education:Prisma.DbNull,employment:Prisma.DbNull,demoOptIn:false,name:'Deleted teacher',headline:'',bio:'',status:'SUSPENDED',screeningComplete:false,version:{increment:1}}});
 }
}
@Controller('api/v1')
class PrivacyController{
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Post('privacy-requests') async create(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','INDEPENDENT_STUDENT']),data=parse(z.object({kind:z.enum(['CORRECTION','DELETION']),scope:z.enum(['NOTE','CHILD','ACCOUNT']),resourceId:uuid,reason:text(1000),correction:text(5000).optional()}).strict(),body);
  if((data.kind==='CORRECTION')!==!!data.correction||data.scope!=='NOTE'&&(data.correction?.length||0)>80)fail(400,'INVALID_CORRECTION','Supply a correction only for correction requests; names are limited to 80 characters.');
  return this.service.once(req,actor,'privacy.create',data,async db=>{
   if(data.scope==='ACCOUNT'){if(data.resourceId!==actor.id)fail(404,'NOT_FOUND','Account not found.');}
   else if(actor.role!=='GUARDIAN')fail(403,'FORBIDDEN','Only the guardian controls learner and note privacy.');
   else if(data.scope==='CHILD'){if(!await db.child.count({where:{id:data.resourceId,guardianId:actor.id}}))fail(404,'NOT_FOUND','Student not found.');}
   else {const note=await db.note.findUnique({where:{id:data.resourceId}});if(!note||note.guardianId!==actor.id)fail(404,'NOT_FOUND','Note not found.');}
   const item=await db.privacyRequest.create({data:{...data,accountId:actor.id}});
   if(data.kind==='DELETION'){
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
    if(data.scope==='ACCOUNT'){const arrangements=await db.studentArrangement.findMany({where:{studentAccountId:actor.id,status:{not:'CLOSED'}}});for(const teacherId of [...new Set(arrangements.map(a=>a.teacherId))].sort())await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${teacherId},0))`;await db.studentArrangement.updateMany({where:{studentAccountId:actor.id,status:{not:'CLOSED'}},data:{status:'CLOSED',closedAt:new Date(),closureReason:'Privacy deletion requested',version:{increment:1}}});}
    if(data.scope==='ACCOUNT')await db.studentGuardianGrant.updateMany({where:{OR:[{studentAccountId:actor.id},{acceptedById:actor.id}],status:{in:['PENDING','ACTIVE']}},data:{status:'REVOKED',version:{increment:1}}});
    if(data.scope==='ACCOUNT')await db.studentEnquiry.updateMany({where:{studentAccountId:actor.id,status:'SUBMITTED'},data:{status:'WITHDRAWN',version:{increment:1}}});
    if(data.scope==='NOTE')await db.note.update({where:{id:data.resourceId},data:{sharedTeacherId:null,version:{increment:1}}});
    else {
     await db.consent.updateMany({where:{guardianId:actor.id},data:{withdrawnAt:new Date()}});const children=await db.child.findMany({where:{guardianId:actor.id}});await db.session.updateMany({where:{accountId:{in:children.flatMap(c=>c.studentAccountId?[c.studentAccountId]:[])}},data:{revoked:true}});await db.note.updateMany({where:{guardianId:actor.id},data:{sharedTeacherId:null,version:{increment:1}}});
     await db.teacher.updateMany({where:{accountId:actor.id},data:{status:'SUSPENDED',screeningComplete:false,version:{increment:1}}});
    }
   }
   await this.service.audit(db,actor,req,'PRIVACY_REQUEST_CREATED',item.id,'Owner submitted privacy request',undefined,{kind:data.kind,scope:data.scope});await this.service.event(db,'privacy.review_requested',item.id);return item;
  });
 }
 @Get('privacy-requests') async list(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','TEACHER','INDEPENDENT_STUDENT','ADMIN']),data=parse(z.object({limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict(),query),db=this.service.db,where=actor.role==='ADMIN'?{}:{accountId:actor.id};
  const anchor=data.cursor?await db.privacyRequest.findFirst({where:{...where,id:data.cursor},select:{createdAt:true,id:true}}):null;
  if(data.cursor&&!anchor)fail(404,'NOT_FOUND','Privacy cursor is unavailable.');
  const [rows,pendingTargets]=await Promise.all([
   db.privacyRequest.findMany({where:{...where,...(anchor?{OR:[{createdAt:{lt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{lt:anchor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),
   // Paging must not hide a pending deletion or matching request on another page.
   db.privacyRequest.findMany({where:{...where,status:'PENDING'},select:{kind:true,scope:true,resourceId:true},distinct:['kind','scope','resourceId']})
  ]),items=rows.slice(0,data.limit);
  return {items,nextCursor:rows.length>data.limit?items.at(-1)!.id:null,pendingTargets};
 }
 @Get('admin/privacy-requests') async queue(@Req() req:HttpRequest,@Query() query:unknown){const actor=await this.service.actor(req,['ADMIN']),data=parse(z.object({status:z.enum(['PENDING','COMPLETED','REJECTED']).optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:uuid.optional()}).strict(),query),where={...(data.status?{status:data.status}:{})};if(data.cursor&&!await this.service.db.privacyRequest.count({where:{...where,id:data.cursor}}))fail(404,'NOT_FOUND','Privacy cursor is outside this queue.');const rows=await this.service.db.privacyRequest.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1,...(data.cursor?{cursor:{id:data.cursor},skip:1}:{})}),items=rows.slice(0,data.limit);await this.service.audit(this.service.db,actor,req,'ADMIN_PRIVACY_QUEUE_READ','privacy','Administrator accessed private request evidence');return {items,nextCursor:rows.length>data.limit?items.at(-1)!.id:null};}
 @Post('admin/privacy-requests/:id/reviews') async review(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['ADMIN']),data=parse(z.object({expectedVersion:version,action:z.enum(['FULFIL','REJECT']),reason:text(1000),policyVersion:text(100),retentionReason:text(1000).optional(),confirmed:z.literal(true)}).strict(),body);
  return this.service.once(req,actor,'privacy.review',data,async db=>{
   const item=await db.privacyRequest.findUnique({where:{id}});if(!item)fail(404,'NOT_FOUND','Privacy request not found.');if(item.accountId===actor.id)fail(403,'SELF_REVIEW','Another administrator must review this privacy request.');await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${item.accountId},0))`;
   const current=await db.privacyRequest.findUniqueOrThrow({where:{id}});if(current.version!==data.expectedVersion||current.status!=='PENDING')fail(409,'CONFLICT','Privacy request changed.');
   if(data.action==='FULFIL'){
    if(item.kind==='DELETION'){
     if(!data.retentionReason)fail(400,'RETENTION_REQUIRED','Record the approved exception for retained financial, learning, safety and audit evidence.');
     await erase(db,item.scope,item.resourceId,item.accountId);await db.deletionRecord.create({data:{privacyRequestId:id,accountId:item.accountId,scope:item.scope,resourceId:item.resourceId,policyVersion:data.policyVersion,retentionReason:data.retentionReason}});
     if(item.scope==='ACCOUNT'){const teacher=await db.teacher.findUnique({where:{accountId:item.accountId}});if(teacher){for(const evidence of await db.evidence.findMany({where:{teacherId:teacher.id}}))await this.service.event(db,'privacy.evidence_delete_requested',evidence.id);await db.evidence.updateMany({where:{teacherId:teacher.id},data:{status:'DELETED',version:{increment:1}}});}}
    }else if(item.scope==='NOTE')await db.note.update({where:{id:item.resourceId},data:{text:item.correction!,sharedTeacherId:null,acknowledgedAt:null,version:{increment:1}}});
    else if(item.scope==='CHILD')await db.child.update({where:{id:item.resourceId},data:{alias:item.correction!,version:{increment:1}}});
    else await db.account.update({where:{id:item.accountId},data:{name:item.correction!}});
   }
   const updated=await db.privacyRequest.update({where:{id},data:{status:data.action==='FULFIL'?'COMPLETED':'REJECTED',correction:item.kind==='DELETION'?null:item.correction,resolution:data.reason,policyVersion:data.policyVersion,version:{increment:1}}});await this.service.audit(db,actor,req,'PRIVACY_REQUEST_REVIEWED',id,data.reason,undefined,{action:data.action,policyVersion:data.policyVersion});return updated;
  });
 }
 @Get('admin/privacy/deletion-ledger') async ledger(@Req() req:HttpRequest,@Query() query:unknown){const actor=await this.service.actor(req,['ADMIN']),data=parse(z.object({cursor:uuid.optional()}).strict(),query);const items=await this.service.db.deletionRecord.findMany({orderBy:[{createdAt:'asc'},{id:'asc'}],take:50,...(data.cursor?{cursor:{id:data.cursor},skip:1}:{})});await this.service.audit(this.service.db,actor,req,'DELETION_LEDGER_READ','privacy','Restricted backup deletion replay ledger access');return {items,nextCursor:items.length===50?items.at(-1)!.id:null};}
 @Post('admin/privacy/deletion-ledger/:id/replays') async replay(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){parse(uuid,id);const actor=await this.service.actor(req,['ADMIN']),data=parse(z.object({restoreReference:text(200),reason:text(1000),confirmed:z.literal(true)}).strict(),body);return this.service.once(req,actor,'privacy.replay',data,async db=>{const item=await db.deletionRecord.findUnique({where:{id}});if(!item)fail(404,'NOT_FOUND','Deletion record not found.');await erase(db,item.scope,item.resourceId,item.accountId);await this.service.audit(db,actor,req,'BACKUP_DELETION_REPLAYED',id,data.reason,undefined,{restoreReference:data.restoreReference});return {status:'REPLAYED',deletionRecordId:id};});}
}
@Module({imports:[PersistenceModule],controllers:[PrivacyController]})
export class PrivacyModule{}
