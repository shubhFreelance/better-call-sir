import {Module,Controller,Get,Post,Param,Query,Req,Body,Inject} from '@nestjs/common';
import {z} from 'zod';
import {hash,AppService,PersistenceModule,HttpRequest,DB,uuid,version,parse,fail,text} from '../../shared';
import {studentAuthority} from './student-authority';
import {independentEducation,independentProfile} from './independent-students.module';
import {studentContext} from '../requests/student-enquiries.module';
const paging=z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(50).default(10)}).strict();
const command=z.object({expectedVersion:version,confirmed:z.literal(true)}).strict();
@Controller('api/v1')
class StudentSupportController{
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('student-guardian-grants') async grants(@Req() req:HttpRequest,@Query() input:unknown){
  const a=await this.service.actor(req,['INDEPENDENT_STUDENT','GUARDIAN']),q=parse(paging,input),where=a.role==='INDEPENDENT_STUDENT'?{studentAccountId:a.id}:{OR:[{acceptedById:a.id},...(a.email?[{recipientEmail:a.email.toLowerCase()}]:[])]};
  return this.service.db.$transaction(async db=>{
   if(q.cursor&&!await db.studentGuardianGrant.count({where:{...where,id:q.cursor}}))fail(404,'NOT_FOUND','Invitation cursor unavailable.');
   const rows=await db.studentGuardianGrant.findMany({where,orderBy:{id:'asc'},take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{})}),items=[];
   for(const r of rows.slice(0,q.limit)){const owner=await db.account.findUniqueOrThrow({where:{id:r.studentAccountId}});items.push({...r,status:r.status==='PENDING'&&r.expiresAt<new Date()?'EXPIRED':r.status,studentName:owner.name});}
   return {items,nextCursor:rows.length>q.limit?rows[q.limit-1].id:null};
  },{isolationLevel:'RepeatableRead'});
 }
 @Post('student-guardian-grants') async invite(@Req() req:HttpRequest,@Body() body:unknown){
  const a=await this.service.actor(req,['INDEPENDENT_STUDENT']),data=parse(z.object({email:z.email().max(254).transform(x=>x.toLowerCase()),supportMode:z.enum(['ADVICE','MANAGE']),expectedPendingVersion:z.number().int().min(0),confirmed:z.literal(true)}).strict(),body);
  if(data.email===a.email?.toLowerCase())fail(400,'INVALID_INVITATION','Choose a different email for your supporter.');
  const result=await this.service.once(req,a,'student.guardian.invite',data,async db=>{
   await studentAuthority(db,a,a.id,true);if((await studentContext(db,a.id)).gate!=='READY')fail(403,'ACCESS_PAUSED','Invitations are paused.');
   if(await db.studentGuardianGrant.count({where:{studentAccountId:a.id,status:'ACTIVE'}}))fail(409,'CONFLICT','Revoke the active access before inviting another supporter.');
   const pending=await db.studentGuardianGrant.findFirst({where:{studentAccountId:a.id,status:'PENDING'}});if((pending?.version??0)!==data.expectedPendingVersion)fail(409,'CONFLICT','Invitation changed. Reload before replacing it.');
   if(pending)await db.studentGuardianGrant.update({where:{id:pending.id},data:{status:'REVOKED',version:{increment:1}}});
   const grant=await db.studentGuardianGrant.create({data:{studentAccountId:a.id,recipientEmail:data.email,supportMode:data.supportMode,expiresAt:new Date(Date.now()+7*86400000)}});await this.service.audit(db,a,req,'STUDENT_GUARDIAN_INVITED',grant.id,'Student explicitly authorized an email-bound optional supporter',undefined,{supportMode:data.supportMode});return {id:grant.id};
  });return this.service.db.studentGuardianGrant.findFirstOrThrow({where:{id:result.id,studentAccountId:a.id}});
 }
 @Post('student-guardian-grants/:id/decisions') async decide(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const a=await this.service.actor(req,['INDEPENDENT_STUDENT','GUARDIAN']),data=parse(command.extend({action:z.enum(['ACCEPT','DECLINE','REVOKE'])}),body);
  const authorize=async(db:DB)=>{const r=await db.studentGuardianGrant.findUnique({where:{id}});if(!r||!(a.role==='INDEPENDENT_STUDENT'&&r.studentAccountId===a.id&&data.action==='REVOKE'||a.role==='GUARDIAN'&&(data.action==='REVOKE'?r.acceptedById===a.id:r.recipientEmail===a.email?.toLowerCase())))fail(404,'NOT_FOUND','Invitation not found.');return r;};
  await authorize(this.service.db);
  const result=await this.service.once(req,a,'student.guardian.decision',data,async db=>{
   const initial=await authorize(db);await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.studentAccountId},0))`;const r=await authorize(db);
   if(r.version!==data.expectedVersion||!['PENDING','ACTIVE'].includes(r.status)||data.action!=='REVOKE'&&(r.status!=='PENDING'||r.expiresAt<=new Date()))fail(409,'CONFLICT','Invitation changed, expired or closed.');
   if(data.action==='ACCEPT'&&((await studentContext(db,r.studentAccountId)).gate!=='READY'||await db.privacyRequest.count({where:{accountId:a.id,scope:'ACCOUNT',kind:'DELETION',status:'PENDING'}})))fail(403,'ACCESS_PAUSED','Student access is paused.');
   const status=data.action==='ACCEPT'?'ACTIVE':data.action==='DECLINE'?'DECLINED':'REVOKED';await db.studentGuardianGrant.update({where:{id},data:{status,...(status==='ACTIVE'?{acceptedById:a.id}:{}),version:{increment:1}}});await this.service.audit(db,a,req,'STUDENT_GUARDIAN_'+status,id,'Explicit optional support access decision',undefined,{supportMode:r.supportMode});return {id};
  });return this.service.db.studentGuardianGrant.findUniqueOrThrow({where:{id:result.id}});
 }
 @Get('delegated-students/:id/profile') async profile(@Req() req:HttpRequest,@Param('id') id:string){parse(uuid,id);const a=await this.service.actor(req,['GUARDIAN']);return this.service.db.$transaction(async db=>{await studentAuthority(db,a,id);const grant=await db.studentGuardianGrant.findFirstOrThrow({where:{studentAccountId:id,acceptedById:a.id,status:'ACTIVE'}});return {...await independentProfile(db,id),supportMode:grant.supportMode};});}
 @Get('delegated-students/:id/enquiry-context') async context(@Req() req:HttpRequest,@Param('id') id:string){parse(uuid,id);const a=await this.service.actor(req,['GUARDIAN']);return this.service.db.$transaction(async db=>{await studentAuthority(db,a,id);return studentContext(db,id);});}
 @Post('delegated-students/:id/profile/updates') async update(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const a=await this.service.actor(req,['GUARDIAN']),data=parse(command.extend({education:independentEducation}),body);await this.service.db.$transaction(db=>studentAuthority(db,a,id,true));
  const result=await this.service.once(req,a,'student.delegated.profile',data,async db=>{await studentAuthority(db,a,id,true);const current=await independentProfile(db,id);if(current.editStatus!=='EDITABLE'||current.version!==data.expectedVersion)fail(409,'CONFLICT','Profile changed or is paused.');await db.independentStudentProfile.update({where:{accountId:id},data:{education:data.education,version:{increment:1}}});await this.service.audit(db,a,req,'STUDENT_DELEGATED_PROFILE_UPDATED',id,'Authorized supporter updated education only');return {id};});return this.profile(req,result.id);
 }
 @Get('independent-student/sessions') async sessions(@Req() req:HttpRequest,@Query() query:unknown){
  const a=await this.service.actor(req,['INDEPENDENT_STUDENT']),q=parse(paging,query),current=await this.service.db.session.findUniqueOrThrow({where:{accessHash:hash(req.cookies.bcs_access)}});
  if(q.cursor&&!await this.service.db.session.count({where:{accountId:a.id,familyId:q.cursor}}))fail(404,'NOT_FOUND','Device cursor unavailable.');
  const rows=await this.service.db.session.findMany({where:{accountId:a.id,revoked:false,rotated:false,expiresAt:{gt:new Date()},...(q.cursor?{familyId:{gt:q.cursor}}:{})},orderBy:{familyId:'asc'},take:q.limit+1,select:{familyId:true,deviceLabel:true,expiresAt:true}});return {items:rows.slice(0,q.limit).map(r=>({...r,current:r.familyId===current.familyId})),nextCursor:rows.length>q.limit?rows[q.limit-1].familyId:null};
 }
 @Post('independent-student/session-labels') async label(@Req() req:HttpRequest,@Body() body:unknown){
  const a=await this.service.actor(req,['INDEPENDENT_STUDENT']),data=parse(z.object({familyId:uuid,label:text(60).regex(/^[^\u0000-\u001f\u007f]+$/).nullable(),confirmed:z.literal(true)}).strict(),body);return this.service.once(req,a,'student.self.device.label',data,async db=>{await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.familyId},0))`;if(!await db.session.count({where:{accountId:a.id,familyId:data.familyId,revoked:false,rotated:false,expiresAt:{gt:new Date()}}}))fail(404,'NOT_FOUND','Active device not found.');await db.session.updateMany({where:{accountId:a.id,familyId:data.familyId},data:{deviceLabel:data.label}});await this.service.audit(db,a,req,'STUDENT_SELF_DEVICE_NAMED',a.id,'Owner named their device',undefined,{familyId:data.familyId});return {familyId:data.familyId,label:data.label};});
 }
 @Post('independent-student/session-revocations') async revoke(@Req() req:HttpRequest,@Body() body:unknown){
  const a=await this.service.actor(req,['INDEPENDENT_STUDENT']),data=parse(z.object({familyId:uuid,confirmed:z.literal(true)}).strict(),body);return this.service.once(req,a,'student.self.device.revoke',data,async db=>{await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.familyId},0))`;if(!await db.session.count({where:{accountId:a.id,familyId:data.familyId}}))fail(404,'NOT_FOUND','Device not found.');await db.session.updateMany({where:{accountId:a.id,familyId:data.familyId},data:{revoked:true}});await this.service.audit(db,a,req,'STUDENT_SELF_DEVICE_REVOKED',a.id,'Owner signed out a device',undefined,{familyId:data.familyId});return {familyId:data.familyId,status:'REVOKED'};});
 }
}
@Module({imports:[PersistenceModule],controllers:[StudentSupportController]})
export class StudentSupportModule{}
