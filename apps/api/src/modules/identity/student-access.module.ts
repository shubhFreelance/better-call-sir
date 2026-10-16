import {Module,Controller,Get,Post,Param,Req,Res,Body,Inject} from '@nestjs/common';
import {Response} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,uuid,version,parse,fail,text} from '../../shared';
@Controller('api/v1')
class StudentAccessController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('children/:id/student-sessions') async sessions(@Req() req:HttpRequest,@Param('id') id:string){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
  const child=await this.service.child(this.service.db,actor,id);
  const items=child.studentAccountId?await this.service.db.session.findMany({where:{accountId:child.studentAccountId,revoked:false,rotated:false,expiresAt:{gt:new Date()}},select:{familyId:true,expiresAt:true,deviceLabel:true},orderBy:[{expiresAt:'desc'},{familyId:'asc'}],take:50}):[];
  return {items,childVersion:child.version,accessRevoked:!!child.studentAccessRevokedAt};
 }
 @Post('children/:id/student-session-labels') async label(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
  const data=parse(z.object({expectedVersion:version,familyId:uuid,label:text(60).regex(/^[^\u0000-\u001f\u007f]+$/).nullable()}).strict(),body);
  return this.service.once(req,actor,'student.device.label',data,async db=>{
   await this.service.guardian(db,actor.id);const child=await this.service.child(db,actor,id);
   if(child.version!==data.expectedVersion)fail(409,'CONFLICT','Student access has changed. Refresh before naming a device.');
   if(!child.studentAccountId||child.studentAccessRevokedAt)fail(409,'STUDENT_UNAVAILABLE','Student access is unavailable.');
   const account=await db.account.findUnique({where:{id:child.studentAccountId}});
   if(!account||account.disabled||account.role!=='STUDENT')fail(409,'STUDENT_UNAVAILABLE','Student access is unavailable.');
   const active=await db.session.findFirst({where:{accountId:account.id,familyId:data.familyId,revoked:false,rotated:false,expiresAt:{gt:new Date()}}});
   if(!active)fail(404,'NOT_FOUND','Active student device not found.');
   await db.session.updateMany({where:{accountId:account.id,familyId:data.familyId},data:{deviceLabel:data.label}});
   const updated=await db.child.update({where:{id},data:{version:{increment:1}}});
   await this.service.audit(db,actor,req,'STUDENT_DEVICE_LABEL_UPDATED',id,'Guardian updated a student device label',undefined,{familyId:data.familyId,hasLabel:data.label!==null});
   return {familyId:data.familyId,label:data.label,childVersion:updated.version};
  });
 }
 @Post('children/:id/student-sessions') async authorize(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown,@Res({passthrough:true}) res:Response){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({expectedVersion:version}).strict(),body);
  const result=await this.service.db.$transaction(async db=>{
   await this.service.guardian(db,actor.id);const child=await this.service.child(db,actor,id);
   if(child.version!==data.expectedVersion||!child.studentAccountId)fail(409,'CONFLICT','Activate student access first, or refresh the child version.');
   const account=await db.account.findUniqueOrThrow({where:{id:child.studentAccountId}});
   if(account.disabled||account.role!=='STUDENT')fail(409,'STUDENT_UNAVAILABLE','Student access is unavailable.');
   await db.child.update({where:{id},data:{studentAccessRevokedAt:null,version:{increment:1}}});
   const state=await this.service.issueSession(account,randomUUID(),db);
   await this.service.audit(db,actor,req,'STUDENT_DEVICE_AUTHORIZED',id,'Guardian approved a student device',undefined,{familyId:state.familyId});
   return {account,state};
  });
  return this.service.sessionResponse(result.account,result.state,res);
 }
 @Post('children/:id/student-access-revocations') async revoke(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({expectedVersion:version,familyId:uuid.nullable(),reason:text(300)}).strict(),body);
  return this.service.once(req,actor,'student.revoke',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   const child=await this.service.child(db,actor,id);
   if(child.version!==data.expectedVersion||!child.studentAccountId)fail(409,'CONFLICT','Student access has changed.');
   if(data.familyId&&!await db.session.findFirst({where:{accountId:child.studentAccountId,familyId:data.familyId}}))fail(404,'NOT_FOUND','Student device not found.');
   await db.session.updateMany({where:{accountId:child.studentAccountId,...(data.familyId?{familyId:data.familyId}:{})},data:{revoked:true}});
   const updated=await db.child.update({where:{id},data:{...(data.familyId?{}:{studentAccessRevokedAt:new Date()}),version:{increment:1}}});
   await this.service.audit(db,actor,req,'STUDENT_ACCESS_REVOKED',id,data.reason,undefined,{familyId:data.familyId});
   return {status:'REVOKED',childVersion:updated.version};
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[StudentAccessController]})
export class StudentAccessModule{}
