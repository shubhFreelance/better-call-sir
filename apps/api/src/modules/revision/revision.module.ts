import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module, Controller, Get, Post, Param, Query, Body, Req, Res, Injectable, Inject, HttpException, Catch, ExceptionFilter, ArgumentsHost, Global} from '@nestjs/common';
import {Prisma, PrismaClient, Account} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z} from 'zod';
import {eligible, placementFee, verifiedAttendance, revisionRefund, window30} from '../../policies';

import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,HttpRequest,DB} from '../../shared';

import {available} from '../scheduling/calendar';
import {mode as meetingMode} from '@bcs/meetings';
import {createRevisionFulfillment} from './fulfillment';

@Controller('api/v1')
class RevisionController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('revision/holds') async hold(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN']);
    const data=parse(z.object({childId:uuid.optional(),teacherId:uuid,startsAt:z.iso.datetime({offset:true}),duration:z.union([z.literal(20),z.literal(40)]),subject:z.enum(['Maths','Science']).default('Maths'),language:z.enum(['English','Hindi']).default('English'),topic:text(1000)}).strict(),body);
    return this.service.once(req,actor,'revision.hold',data,async db=>{
      await this.service.guardian(db,actor.id);
      const children=await db.child.findMany({where:{guardianId:actor.id},take:2});
      const activePlacements=data.childId?[]:await db.placement.findMany({where:{guardianId:actor.id,status:'ACTIVE'},select:{childId:true},distinct:['childId'],take:2});
      const inferredId=children.length===1?children[0].id:activePlacements.length===1?activePlacements[0].childId:null;
      const child=data.childId?await this.service.child(db,actor,data.childId):inferredId?await this.service.child(db,actor,inferredId):null;if(!child)fail(400,'CHILD_REQUIRED','Choose the learner for this revision booking.');
      const enabled=await db.featureFlag.findUnique({where:{name:'revision'}});
      if (!enabled?.enabled) fail(503,'FEATURE_PAUSED','New revision bookings are temporarily paused.');
      if(await db.reservation.count({where:{guardianId:actor.id,kind:'REVISION',status:'HOLD',expiresAt:{gt:new Date()}}})>=5)fail(409,'HOLD_LIMIT','Finish or cancel an existing revision hold before reserving another slot. Up to five active holds are allowed.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.teacherId},0))`;
      const teacher=await db.teacher.findUnique({where:{id:data.teacherId}});
      if (!teacher || teacher.status!=='APPROVED' || !teacher.screeningComplete || !teacher.screeningValidUntil || teacher.screeningValidUntil<=new Date() || !teacher.subjects.includes(data.subject) || !teacher.languages.includes(data.language) || !teacher.grades.includes(child.grade) || !teacher.boards.includes(child.board)) fail(409,'TEACHER_UNAVAILABLE','This expert is unavailable for the selected learner and subject.');
      const startsAt=new Date(data.startsAt);
      if (startsAt.getTime()<Date.now()+3_600_000 || startsAt.getTime()>Date.now()+60*86_400_000) fail(400,'INVALID_TIME','Choose a slot between one hour and 60 days from now.');
      const endsAt=new Date(startsAt.getTime()+data.duration*60_000);
      const account=await db.account.findUnique({where:{id:teacher.accountId}});
      const pattern=await available(db,teacher.id,'REVISION',startsAt,endsAt);
      if (!account || account.disabled || !pattern) fail(409,'SLOT_UNAVAILABLE','Choose a currently advertised free slot.');
      const localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(startsAt));
      if (localHour<9 || localHour>=20) fail(400,'OUTSIDE_WINDOW','Development revision slots run from 9am to 8pm IST.');
      await db.reservation.updateMany({where:{teacherId:teacher.id,status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED'}});
      const price=data.duration*1500;const reservation=await db.reservation.create({data:{teacherId:teacher.id,guardianId:actor.id,childId:child.id,kind:'REVISION',source:'ADVERTISED',sourceId:pattern.id,startsAt,endsAt:new Date(startsAt.getTime()+data.duration*60_000),expiresAt:new Date(Date.now()+600_000),topic:data.topic,subject:data.subject,language:data.language,amountPaise:price,payablePaise:price}});
      await this.service.audit(db,actor,req,'REVISION_HELD',reservation.id,'Guardian reserved declared expert availability');
      await this.service.event(db,'revision.scope_requested',reservation.id);return reservation;
    });
  }

  @Post('reservations/:id/scope') async scope(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const {expectedVersion}=parse(z.object({expectedVersion:version}).strict(),body);
    return this.service.once(req,actor,'revision.scope',{id,expectedVersion},async db=>{
      const initial=await db.reservation.findUnique({where:{id}});
      const own=await db.teacher.findUnique({where:{accountId:actor.id}});
      if (!initial || initial.kind!=='REVISION' || initial.teacherId!==own?.id) fail(404,'NOT_FOUND','Booking not found.');
      await this.service.guardian(db,initial.guardianId);
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
      const teacher=await db.teacher.findUniqueOrThrow({where:{id:initial.teacherId}});
      const r=await db.reservation.findUniqueOrThrow({where:{id}});
      if (teacher.status!=='APPROVED' || !teacher.screeningComplete || !teacher.screeningValidUntil || teacher.screeningValidUntil<=new Date() || !await available(db,teacher.id,'REVISION',r.startsAt,r.endsAt,id,0)) fail(409,'UNAVAILABLE','The expert or slot is unavailable.');
      const changed=await db.reservation.updateMany({where:{id,status:'HOLD',expiresAt:{gt:new Date()},version:expectedVersion},data:{scopeAccepted:true,version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','The hold changed or expired.');
      await this.service.audit(db,actor,req,'REVISION_SCOPE_ACCEPTED',id,'Expert accepted current scope');
      return db.reservation.findUniqueOrThrow({where:{id}});
    });
  }

  @Post('dev/reservations/:id/capture') async capture(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    if (!development()) fail(404,'NOT_FOUND','Not found.');parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
    const data=parse(z.object({providerEventId:text(100),amountPaise:z.number().int().positive(),currency:z.literal('INR')}).strict(),body);
    return this.service.once(req,actor,'sandbox.capture',data,async db=>{
      const initial=await db.reservation.findUnique({where:{id}});
      if (!initial || initial.guardianId!==actor.id) fail(404,'NOT_FOUND','Booking not found.');
      await this.service.guardian(db,actor.id);
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const r=await db.reservation.findUnique({where:{id}});
      if (!r || r.kind!=='REVISION' || r.guardianId!==actor.id) fail(404,'NOT_FOUND','Booking not found.');
      await this.service.guardian(db,actor.id);
      const existing=await db.payment.findUnique({where:{reservationId:id}});
      if (existing) {if(existing.providerEventId!==data.providerEventId || existing.amountPaise!==data.amountPaise) fail(409,'PAYMENT_MISMATCH','Capture replay differs from the stored payment.');return {payment:existing,reservation:r};}
      if (!r.scopeAccepted || r.amountPaise!==data.amountPaise || r.kind!=='REVISION') fail(409,'PAYMENT_MISMATCH','Expert scope acceptance and exact INR amount are required.');
      const teacher=await db.teacher.findUniqueOrThrow({where:{id:r.teacherId}});
      const payment=await db.payment.create({data:{reservationId:id,providerEventId:data.providerEventId,amountPaise:data.amountPaise}});
      await db.reservation.updateMany({where:{teacherId:teacher.id,status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED'}});
      const collision=await db.reservation.findFirst({where:{id:{not:id},teacherId:r.teacherId,status:{in:['HOLD','CONFIRMED']},startsAt:{lt:r.endsAt},endsAt:{gt:r.startsAt}}});
      const account=await db.account.findUnique({where:{id:teacher.accountId}});
      if (teacher.status!=='APPROVED' || !teacher.screeningComplete || !teacher.screeningValidUntil || teacher.screeningValidUntil<=new Date() || !account || account.disabled || !await available(db,teacher.id,'REVISION',r.startsAt,r.endsAt,id,0) || collision || r.status==='CANCELLED' || r.startsAt<new Date()) {
        const reservation=await db.reservation.update({where:{id},data:{status:'PAID_UNALLOCATED',version:{increment:1}}});
        await db.refund.create({data:{paymentId:payment.id,amountPaise:payment.amountPaise,reason:'SLOT_UNAVAILABLE'}});
        await this.service.audit(db,actor,req,'SANDBOX_CAPTURE_UNALLOCATED',id,'Captured sandbox payment could not allocate a current slot');
        await this.service.event(db,'refund.requested',payment.id);return {payment,reservation};
      }
      const reservation=await db.reservation.update({where:{id},data:{status:'CONFIRMED',expiresAt:null,version:{increment:1}}});
      await createRevisionFulfillment(db,reservation,payment);
      const meeting=await db.meeting.upsert({where:{reservationId:id},create:{reservationId:id,providerMode:meetingMode()},update:{status:'PENDING',joinUrl:null,providerSpaceId:null,failureCode:null,retryAt:null,providerMode:meetingMode(),version:{increment:1}}});await this.service.event(db,'meeting.create_requested',meeting.id,meeting.version);
      await this.service.audit(db,actor,req,'SANDBOX_REVISION_CONFIRMED',id,'Exact sandbox capture confirmed current expert availability');
      await this.service.event(db,'revision.confirmed',id);return {payment,reservation};
    });
  }

  @Post('reservations/:id/cancel') async cancel(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({expectedVersion:version,reason:text(300)}).strict(),body);
    return this.service.once(req,actor,'reservation.cancel',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
      const initial=await db.reservation.findUnique({where:{id}});
      if (!initial || initial.guardianId!==actor.id) fail(404,'NOT_FOUND','Booking not found.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const r=await db.reservation.findUnique({where:{id}});
      if (!r || r.kind!=='REVISION' || r.guardianId!==actor.id) fail(404,'NOT_FOUND','Booking not found.');
      if (!['HOLD','CONFIRMED'].includes(r.status) || r.version!==data.expectedVersion) fail(409,'CONFLICT','Booking has changed.');
      const payment=await db.payment.findUnique({where:{reservationId:id}});
      if (payment && !revisionRefund(r.startsAt,new Date(),'GUARDIAN_CANCELLED')) fail(409,'POLICY_REVIEW','Late-cancellation policy is unapproved. Contact support; no automated charge or refund decision was made.');
      const lesson=await db.lesson.findUnique({where:{reservationId:id}});await db.lesson.updateMany({where:{reservationId:id,status:'SCHEDULED'},data:{status:'CANCELLED',version:{increment:1}}});const updated=await db.reservation.update({where:{id},data:{status:'CANCELLED',version:{increment:1}}});if(lesson)await db.teacherPayable.updateMany({where:{lessonId:lesson.id},data:{status:'REFUND_PENDING',version:{increment:1}}});
      await db.meeting.updateMany({where:{reservationId:id},data:{status:'CANCELLED',joinUrl:null,version:{increment:1}}});
      if (payment) {await db.refund.upsert({where:{paymentId:payment.id},create:{paymentId:payment.id,amountPaise:payment.amountPaise,reason:data.reason},update:{}});await this.service.event(db,'refund.requested',payment.id);}
      await this.service.audit(db,actor,req,'REVISION_CANCELLED',id,data.reason);
      return updated;
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[RevisionController]})
export class RevisionModule {}
