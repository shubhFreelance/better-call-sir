import {Module,Controller,Get,Post,Param,Body,Req,Inject} from '@nestjs/common';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,uuid,version,text,parse,fail} from '../../shared';
import {mode} from '@bcs/meetings';
@Controller('api/v1')
class MeetingsController{
  constructor(@Inject(AppService) private readonly service:AppService){}
  @Get('meetings/:id') async get(@Req() req:HttpRequest,@Param('id') id:string){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT']);const meeting=await this.service.db.meeting.findUnique({where:{id}});if(!meeting)fail(404,'NOT_FOUND','Meeting not found.');
    const reservation=await this.service.db.reservation.findUniqueOrThrow({where:{id:meeting.reservationId}}),teacher=actor.role==='TEACHER'?await this.service.db.teacher.findUnique({where:{accountId:actor.id}}):null,child=actor.role==='STUDENT'?await this.service.db.child.findUnique({where:{studentAccountId:actor.id}}):null;
    if(actor.role==='GUARDIAN'?reservation.guardianId!==actor.id:actor.role==='TEACHER'?reservation.teacherId!==teacher?.id:reservation.childId!==child?.id)fail(404,'NOT_FOUND','Meeting not found.');
    const now=Date.now(),canJoin=meeting.status==='READY'&&reservation.status==='CONFIRMED'&&now>=reservation.startsAt.getTime()-10*60000&&now<=reservation.endsAt.getTime()+15*60000;
    return {id:meeting.id,reservationId:reservation.id,status:meeting.status,startsAt:reservation.startsAt,endsAt:reservation.endsAt,provider:'GOOGLE_MEET',canJoin,joinUrl:canJoin?meeting.joinUrl:null,version:meeting.version};
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
