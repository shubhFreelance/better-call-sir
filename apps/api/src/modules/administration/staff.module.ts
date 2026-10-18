import {recentAdmin} from './authority';
import {Body,Controller,Get,Inject,Module,Param,Post,Query,Req} from '@nestjs/common';
import {z} from 'zod';
import {Account} from '@prisma/client';
import {AppService,PersistenceModule,HttpRequest,DB,fail,parse,uuid,version,text,privileged,hash} from '../../shared';
import {emailAddress} from '../identity/email-otp';
import {pageQuery,pageResult} from '../../pagination';
const roles=z.enum(['ADMIN','OPERATOR','REVIEWER','FINANCE']);
const proposal=z.object({kind:z.enum(['CREATE','CHANGE','SUSPEND','RECOVER']),targetAccountId:uuid.optional(),email:emailAddress.optional(),name:text(80).optional(),role:roles.optional(),region:text(80).optional(),expectedAuthVersion:z.number().int().nonnegative().optional(),reason:text(500),evidenceRef:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,119}$/),confirmed:z.literal(true)}).strict();
const decision=z.object({expectedVersion:version,decision:z.enum(['APPROVE','REJECT','CANCEL']),reason:text(500),independentlyVerified:z.literal(true)}).strict();
const staffSelect={id:true,name:true,email:true,role:true,region:true,disabled:true,authVersion:true} as const;
@Controller('api/v1')
class StaffController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 async admin(req:HttpRequest,db:DB=this.service.db){return recentAdmin(this.service,req,db);}
 @Get('admin/staff') async directory(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.admin(req),data=parse(pageQuery,query),where={role:{in:roles.options}};
  if(data.cursor&&!await this.service.db.account.count({where:{...where,id:data.cursor}}))fail(404,'NOT_FOUND','Staff cursor is unavailable.');
  const rows=await this.service.db.account.findMany({where:{...where,...(data.cursor?{id:{gt:data.cursor}}:{})},select:staffSelect,orderBy:{id:'asc'},take:data.limit+1});
  await this.service.audit(this.service.db,actor,req,'STAFF_DIRECTORY_READ','staff','Administrator viewed staff access metadata');return pageResult(rows,data.limit);
 }
 @Get('admin/staff/changes') async changes(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.admin(req);await this.service.audit(this.service.db,actor,req,'STAFF_CHANGES_READ','staff','Administrator viewed staff approval history');const data=parse(pageQuery.extend({status:z.enum(['PENDING','APPROVED','REJECTED','CANCELLED']).optional()}),query),where={...(data.status?{status:data.status}:{})};
  if(data.cursor&&!await this.service.db.staffChange.count({where:{...where,id:data.cursor}}))fail(404,'NOT_FOUND','Staff decision cursor is unavailable.');
  return pageResult(await this.service.db.staffChange.findMany({where:{...where,...(data.cursor?{id:{gt:data.cursor}}:{})},orderBy:{id:'asc'},take:data.limit+1}),data.limit);
 }
 @Post('admin/staff/changes') async propose(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.admin(req),data=parse(proposal,body);
  return this.service.once(req,actor,'STAFF_CHANGE_PROPOSED',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-administration',0))`;
   await this.admin(req,db);
   if(data.region&&!await db.region.findUnique({where:{id:data.region}}))fail(400,'INVALID_REGION','Choose a configured region.');
   let target:Account|null=null;
   if(data.kind==='CREATE'){
    if(data.targetAccountId||data.expectedAuthVersion!==undefined||!data.email||!data.name||!data.role||!data.region)fail(400,'VALIDATION','New staff require a dedicated email, name, role and region.');
    if(await db.account.findUnique({where:{email:data.email}}))fail(409,'STAFF_EMAIL_IN_USE','Use a dedicated staff email that is not assigned to another account.');
   }else{
    if(!data.targetAccountId||data.expectedAuthVersion===undefined||data.email||data.name)fail(400,'VALIDATION','Choose a current staff account and access version.');
    target=await db.account.findUnique({where:{id:data.targetAccountId}});
    if(!target||!privileged(target.role)||!target.email)fail(404,'NOT_FOUND','A dedicated email staff account is required.');
    if(target.id===actor.id)fail(403,'SELF_REVIEW','You cannot propose changes to your own access.');
    if(target.authVersion!==data.expectedAuthVersion)fail(409,'STALE_VERSION','Staff access changed. Refresh before proposing.');
    if(data.kind!=='CHANGE'&&(data.role||data.region))fail(400,'VALIDATION','Recovery and suspension preserve the existing role and region.');
    if(data.kind==='CHANGE'&&(!data.role||!data.region))fail(400,'VALIDATION','Choose both role and region.');
    if(target.disabled&&data.kind!=='CHANGE')fail(409,'STAFF_DISABLED','Only a reviewed access change can reactivate suspended staff.');
   }
   const row=await db.staffChange.create({data:{kind:data.kind,targetAccountId:target?.id,email:target?.email||data.email!,name:target?.name||data.name!,role:data.role||target!.role,region:data.region||target!.region,expectedAuthVersion:target?.authVersion||0,proposerId:actor.id,proposerAuthVersion:actor.authVersion,reason:data.reason,evidenceRef:data.evidenceRef,expiresAt:new Date(Date.now()+86400000)}});
   await this.service.audit(db,actor,req,'STAFF_CHANGE_PROPOSED',row.id,data.reason,{targetAccountId:target?.id||null,authVersion:row.expectedAuthVersion},{kind:row.kind,role:row.role,region:row.region,evidenceRef:row.evidenceRef});return row;
  });
 }
 @Post('admin/staff/changes/:id/decision') async decide(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.admin(req),data=parse(decision,body);
  return this.service.once(req,actor,'STAFF_CHANGE_DECIDED',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-administration',0))`;
   await this.admin(req,db);
   const row=await db.staffChange.findUnique({where:{id}});
   if(!row)fail(404,'NOT_FOUND','Staff change not found.');
   if(row.status!=='PENDING'||row.version!==data.expectedVersion)fail(409,'STALE_VERSION','The staff change was already decided. Refresh its history.');
   if(data.decision==='CANCEL'?(actor.id!==row.proposerId):(actor.id===row.proposerId||actor.id===row.targetAccountId))fail(403,'INDEPENDENT_APPROVAL_REQUIRED','A different administrator must independently review this change.');
   if(data.decision==='APPROVE'){
    if(row.expiresAt<new Date())fail(409,'APPROVAL_EXPIRED','This proposal expired. Create a fresh review.');
    const proposer=await db.account.findUnique({where:{id:row.proposerId}});if(!proposer||proposer.disabled||proposer.role!=='ADMIN'||proposer.authVersion!==row.proposerAuthVersion)fail(409,'PROPOSER_UNAVAILABLE','The proposer is no longer an active administrator.');
    if(row.kind==='CREATE'){
     if(await db.account.findUnique({where:{email:row.email}}))fail(409,'STAFF_EMAIL_IN_USE','That email is already assigned.');
     const created=await db.account.create({data:{email:row.email,name:row.name,role:row.role,region:row.region,authVersion:1}});
     await db.staffChange.update({where:{id},data:{targetAccountId:created.id}});
    }else{
     await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${row.targetAccountId!+':mfa'},0))`;
     const target=await db.account.findUnique({where:{id:row.targetAccountId!}});
     if(!target||!privileged(target.role)||target.email!==row.email||target.authVersion!==row.expectedAuthVersion)fail(409,'STALE_VERSION','Current staff access no longer matches this proposal.');
     if(target.role==='ADMIN'&&!target.disabled&&(row.kind==='SUSPEND'||row.kind==='CHANGE'&&row.role!=='ADMIN')&&await db.account.count({where:{role:'ADMIN',disabled:false}})<=2)fail(409,'ADMIN_QUORUM','Keep at least two active administrators.');
     await db.account.update({where:{id:target.id},data:{authVersion:{increment:1},...(row.kind==='SUSPEND'?{disabled:true}:row.kind==='CHANGE'?{role:row.role,region:row.region,disabled:false}:{})}});
     await db.session.updateMany({where:{accountId:target.id},data:{revoked:true}});
     // A role/region change also requires fresh enrollment; old recovery codes grant no new authority.
     await db.mfaCredential.deleteMany({where:{accountId:target.id}});
     await db.otp.deleteMany({where:{address:row.email}});
    }
   }
   const result=await db.staffChange.update({where:{id},data:{status:data.decision==='APPROVE'?'APPROVED':data.decision==='REJECT'?'REJECTED':'CANCELLED',approverId:data.decision==='CANCEL'?null:actor.id,decisionReason:data.reason,decidedAt:new Date(),version:{increment:1}}});
   await this.service.audit(db,actor,req,'STAFF_CHANGE_'+result.status,id,data.reason,{status:row.status,version:row.version},{status:result.status,kind:row.kind,targetAccountId:result.targetAccountId,proposerId:row.proposerId,approverId:result.approverId});return result;
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[StaffController]})
export class StaffModule {}
