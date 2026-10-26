import {Module,Controller,Get,Post,Req,Body,Inject} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,DB,parse,fail} from '../../shared';
@Controller('api/v1')
class StudentGuardianController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 async detail(db:DB,studentId:string){
  const child=await this.service.recoverableStudent(db,studentId);if(!child)fail(403,'GUARDIAN_ACCESS_UNAVAILABLE','Guardian details are unavailable for this account.');
  const guardian=await db.account.findUniqueOrThrow({where:{id:child.guardianId}}),proof=child.guardianVerificationId?await db.guardianVerification.findUnique({where:{id:child.guardianVerificationId}}):null;
  const verified=guardian.verified&&proof?.status==='APPROVED';
  const actionPath='/guardian-verification'+(proof?'?verification='+proof.id:'');
  const last=await db.inboxNotification.findFirst({where:{accountId:guardian.id,topic:'guardian-verification.ping',actionPath},orderBy:{createdAt:'desc'}});
  const nextPingAt=last?new Date(last.createdAt.getTime()+86400000).toISOString():null;
  return {child,actionPath,view:{learnerId:child.id,learnerName:child.alias,guardianName:guardian.name,guardianEmail:guardian.email,relationship:proof?.relationship||null,relationshipStatus:proof?.status||'NOT_RECORDED',verified,managementMode:child.learningManagementMode,canPing:!verified&&(!nextPingAt||Date.parse(nextPingAt)<=Date.now()),nextPingAt}};
 }
 @Get('student/guardian') async get(@Req() req:HttpRequest){const actor=await this.service.actor(req,['STUDENT'],true,true);return this.service.db.$transaction(async db=>(await this.detail(db,actor.id)).view);}
 @Post('student/guardian/pings') async ping(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['STUDENT'],true,true),data=parse(z.object({confirmed:z.literal(true)}).strict(),body);
  return this.service.once(req,actor,'student.guardian.ping',data,async db=>{
   const {child,actionPath,view}=await this.detail(db,actor.id);
   if(view.verified)fail(409,'ALREADY_VERIFIED','Your guardian relationship is already verified.');
   if(!view.canPing)return {sent:false,nextPingAt:view.nextPingAt!};
   const notification=await db.inboxNotification.create({data:{accountId:child.guardianId,eventId:randomUUID(),topic:'guardian-verification.ping',actionPath,important:true}});
   await this.service.audit(db,actor,req,'GUARDIAN_VERIFICATION_PINGED',child.id,'Student requested guardian verification');
   return {sent:true,nextPingAt:new Date(notification.createdAt.getTime()+86400000).toISOString()};
  },async db=>{await this.detail(db,actor.id);},true);
 }
}
@Module({imports:[PersistenceModule],controllers:[StudentGuardianController]})
export class StudentGuardianModule{}
