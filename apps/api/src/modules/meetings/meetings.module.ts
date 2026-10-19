import {Module,Controller,Get,Post,Param,Body,Req,Inject} from '@nestjs/common';
import {z} from 'zod';
import {Account,Meeting,Reservation} from '@prisma/client';
import {AppService,PersistenceModule,HttpRequest,uuid,version,text,parse,fail} from '../../shared';
import {mode} from '@bcs/meetings';
@Controller('api/v1')
class MeetingsController{
  constructor(@Inject(AppService) private readonly service:AppService){}
  async visible(actor:Account,reservation:Reservation,meeting:Meeting|null){
    return this.service.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reservation.guardianId},0))`;
      const teacher=await db.teacher.findUnique({where:{id:reservation.teacherId}}),child=reservation.childId?await db.child.findUnique({where:{id:reservation.childId}}):null;
      if(actor.role==='GUARDIAN'?reservation.guardianId!==actor.id:actor.role==='TEACHER'?teacher?.accountId!==actor.id:child?.studentAccountId!==actor.id)fail(404,'NOT_FOUND','Meeting not found.');
      if(!meeting)return null;
      const guardian=await db.account.findUnique({where:{id:reservation.guardianId}}),consent=await db.consent.findUnique({where:{guardianId:reservation.guardianId}}),teacherAccount=teacher?await db.account.findUnique({where:{id:teacher.accountId}}):null;
      const proof=!!child&&(!child.guardianVerificationId||!!await db.guardianVerification.count({where:{id:child.guardianVerificationId,status:'APPROVED'}}));
      const paused=await db.privacyRequest.count({where:{accountId:reservation.guardianId,kind:'DELETION',status:'PENDING',OR:[{scope:'ACCOUNT'},...(reservation.childId?[{scope:'CHILD' as const,resourceId:reservation.childId}]:[])]}});
      const current=guardian?.role==='GUARDIAN'&&guardian.verified&&!guardian.disabled&&consent&&!consent.withdrawnAt&&proof&&!paused&&teacherAccount?.role==='TEACHER'&&!teacherAccount.disabled&&teacher?.status==='APPROVED'&&teacher.screeningComplete&&teacher.screeningValidUntil&&teacher.screeningValidUntil>new Date();
      const now=Date.now(),canJoin=!!current&&meeting.status==='READY'&&reservation.status==='CONFIRMED'&&now>=reservation.startsAt.getTime()-10*60000&&now<=reservation.endsAt.getTime()+15*60000;
      return {id:meeting.id,reservationId:reservation.id,status:meeting.status,startsAt:reservation.startsAt,endsAt:reservation.endsAt,provider:'GOOGLE_MEET',providerMode:meeting.providerMode,canJoin,joinUrl:canJoin?meeting.joinUrl:null,version:meeting.version};
    });
  }
  @Get('meetings/:id') async get(@Req() req:HttpRequest,@Param('id') id:string){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT']);const meeting=await this.service.db.meeting.findUnique({where:{id}});if(!meeting)fail(404,'NOT_FOUND','Meeting not found.');
    return this.visible(actor,await this.service.db.reservation.findUniqueOrThrow({where:{id:meeting.reservationId}}),meeting);
  }
  @Get('reservations/:id/meeting') async reservationMeeting(@Req() req:HttpRequest,@Param('id') id:string){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT']);const reservation=await this.service.db.reservation.findUnique({where:{id}});if(!reservation)fail(404,'NOT_FOUND','Booking not found.');
    return {meeting:await this.visible(actor,reservation,await this.service.db.meeting.findUnique({where:{reservationId:id}}))};
  }
  @Post('admin/meetings/:id/retries') async retry(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','OPERATOR']);const data=parse(z.object({expectedVersion:version,reason:text(500)}).strict(),body);
    return this.service.once(req,actor,'meeting.retry',data,async db=>{
      const meeting=await db.meeting.findUnique({where:{id}});if(!meeting)fail(404,'NOT_FOUND','Meeting not found.');const reservation=await db.reservation.findUniqueOrThrow({where:{id:meeting.reservationId}}),guardian=await db.account.findUniqueOrThrow({where:{id:reservation.guardianId}});
      if(actor.role==='OPERATOR'&&actor.region!==guardian.region)fail(404,'NOT_FOUND','Meeting not found.');
      if(meeting.version!==data.expectedVersion||meeting.status!=='FAILED'||reservation.status!=='CONFIRMED'||reservation.endsAt<=new Date())fail(409,'CONFLICT','Meeting is not eligible for retry.');
      const updated=await db.meeting.update({where:{id},data:{status:'PENDING',failureCode:null,retryAt:new Date(),attempts:0,providerMode:mode(),version:{increment:1}}});await this.service.audit(db,actor,req,'MEETING_RETRY_REQUESTED',id,data.reason);await this.service.event(db,'meeting.create_requested',id,updated.version);return {id:updated.id,status:updated.status,failureCode:updated.failureCode,retryAt:updated.retryAt,attempts:updated.attempts,version:updated.version};
    });
  }
}
@Module({imports:[PersistenceModule],controllers:[MeetingsController]})
export class MeetingsModule{}
