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

@Controller('api/v1')
class RevisionController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('revision/holds') async hold(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN']);
    const data=parse(z.object({teacherId:uuid,startsAt:z.iso.datetime({offset:true}),duration:z.union([z.literal(20),z.literal(40),z.literal(60)]),topic:text(1000)}).strict(),body);
    return this.service.once(req,actor,'revision.hold',data,async db=>{
      await this.service.guardian(db,actor.id);
      const enabled=await db.featureFlag.findUnique({where:{name:'revision'}});
      if (!enabled?.enabled) fail(503,'FEATURE_PAUSED','New revision bookings are temporarily paused.');
      const teacher=await db.teacher.findUnique({where:{id:data.teacherId}});
      if (!teacher || teacher.status!=='APPROVED' || !teacher.screeningComplete) fail(409,'TEACHER_UNAVAILABLE','This expert is unavailable.');
      const startsAt=new Date(data.startsAt);
      if (startsAt.getTime()<Date.now()+3_600_000 || startsAt.getTime()>Date.now()+60*86_400_000) fail(400,'INVALID_TIME','Choose a slot between one hour and 60 days from now.');
      const localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(startsAt));
      if (localHour<9 || localHour>=20) fail(400,'OUTSIDE_WINDOW','Development revision slots run from 9am to 8pm IST.');
      await db.reservation.updateMany({where:{status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED'}});
      const reservation=await db.reservation.create({data:{teacherId:teacher.id,guardianId:actor.id,kind:'REVISION',startsAt,endsAt:new Date(startsAt.getTime()+data.duration*60_000),expiresAt:new Date(Date.now()+600_000),topic:data.topic,amountPaise:data.duration*1500}});
      await this.service.event(db,'revision.scope_requested',reservation.id);return reservation;
    });
  }

  @Post('reservations/:id/scope') async scope(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const {expectedVersion}=parse(z.object({expectedVersion:version}).strict(),body);
    const teacher=await this.db.teacher.findUniqueOrThrow({where:{accountId:actor.id}});
    const changed=await this.db.reservation.updateMany({where:{id,teacherId:teacher.id,status:'HOLD',expiresAt:{gt:new Date()},version:expectedVersion},data:{scopeAccepted:true,version:{increment:1}}});
    if (!changed.count) fail(409,'CONFLICT','The hold changed or expired.');return this.db.reservation.findUniqueOrThrow({where:{id}});
  }

  @Post('dev/reservations/:id/capture') async capture(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    if (!development()) fail(404,'NOT_FOUND','Not found.');parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
    const data=parse(z.object({providerEventId:text(100),amountPaise:z.number().int().positive(),currency:z.literal('INR')}).strict(),body);
    return this.service.once(req,actor,'sandbox.capture',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const r=await db.reservation.findUnique({where:{id}});
      if (!r || r.guardianId!==actor.id) fail(404,'NOT_FOUND','Booking not found.');
      await this.service.guardian(db,actor.id);
      const existing=await db.payment.findUnique({where:{reservationId:id}});
      if (existing) return {payment:existing,reservation:r};
      if (!r.scopeAccepted || r.amountPaise!==data.amountPaise || r.kind!=='REVISION') fail(409,'PAYMENT_MISMATCH','Expert scope acceptance and exact INR amount are required.');
      const teacher=await db.teacher.findUniqueOrThrow({where:{id:r.teacherId}});
      const payment=await db.payment.create({data:{reservationId:id,providerEventId:data.providerEventId,amountPaise:data.amountPaise}});
      await db.reservation.updateMany({where:{status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED'}});
      const collision=await db.reservation.findFirst({where:{id:{not:id},teacherId:r.teacherId,status:{in:['HOLD','CONFIRMED']},startsAt:{lt:r.endsAt},endsAt:{gt:r.startsAt}}});
      if (teacher.status!=='APPROVED' || collision || r.status==='CANCELLED' || r.startsAt<new Date()) {
        const reservation=await db.reservation.update({where:{id},data:{status:'PAID_UNALLOCATED',version:{increment:1}}});
        await db.refund.create({data:{paymentId:payment.id,amountPaise:payment.amountPaise,reason:'SLOT_UNAVAILABLE'}});
        await this.service.event(db,'refund.requested',payment.id);return {payment,reservation};
      }
      const reservation=await db.reservation.update({where:{id},data:{status:'CONFIRMED',expiresAt:null,version:{increment:1}}});
      await this.service.event(db,'revision.confirmed',id);return {payment,reservation};
    });
  }

  @Post('reservations/:id/cancel') async cancel(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({expectedVersion:version,reason:text(300)}).strict(),body);
    return this.service.once(req,actor,'reservation.cancel',data,async db=>{
      const r=await db.reservation.findUnique({where:{id}});
      if (!r || r.guardianId!==actor.id) fail(404,'NOT_FOUND','Booking not found.');
      if (!['HOLD','CONFIRMED'].includes(r.status) || r.version!==data.expectedVersion) fail(409,'CONFLICT','Booking has changed.');
      const payment=await db.payment.findUnique({where:{reservationId:id}});
      if (payment && !revisionRefund(r.startsAt,new Date(),'GUARDIAN_CANCELLED')) fail(409,'POLICY_REVIEW','Late-cancellation policy is unapproved. Contact support; no automated charge or refund decision was made.');
      const updated=await db.reservation.update({where:{id},data:{status:'CANCELLED',version:{increment:1}}});
      if (payment) {await db.refund.upsert({where:{paymentId:payment.id},create:{paymentId:payment.id,amountPaise:payment.amountPaise,reason:data.reason},update:{}});await this.service.event(db,'refund.requested',payment.id);}
      return updated;
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[RevisionController]})
export class RevisionModule {}
