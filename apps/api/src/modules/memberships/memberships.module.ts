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
class MembershipsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('pro/calls') async call(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({placementId:uuid,startsAt:z.iso.datetime({offset:true})}).strict(),body);
    return this.service.once(req,actor,'call.request',data,async db=>{
      await this.service.guardian(db,actor.id);
      const flag=await db.featureFlag.findUnique({where:{name:'proCalls'}});if (!flag?.enabled) fail(503,'CALLS_PAUSED','Consultations are temporarily paused.');
      const membership=await db.membership.findUnique({where:{guardianId:actor.id}});
      if (!membership || membership.status!=='ACTIVE' || membership.periodEnd<new Date()) fail(403,'PRO_REQUIRED','An active Parent Pro pass is required. Ordinary support remains free.');
      if (membership.used+membership.reserved>=membership.allowance) fail(409,'ALLOWANCE_EXHAUSTED','Your consultation allowance is fully reserved or used.');
      const p=await db.placement.findUnique({where:{id:data.placementId}});
      if (!p || p.guardianId!==actor.id || p.status!=='ACTIVE') fail(404,'NOT_FOUND','Active teacher assignment not found.');
      const teacher=await db.teacher.findUniqueOrThrow({where:{id:p.teacherId}});
      if (teacher.status!=='APPROVED' || !teacher.consultationOptIn) fail(409,'UNAVAILABLE','This teacher is not accepting consultations.');
      const startsAt=new Date(data.startsAt);if (startsAt<new Date() || startsAt>membership.periodEnd) fail(400,'INVALID_SLOT','Select a future slot within your membership period.');
      return db.consultation.create({data:{guardianId:actor.id,teacherId:p.teacherId,placementId:p.id,startsAt}});
    });
  }

  @Post('pro/calls/:id/accept') async acceptCall(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const {expectedVersion}=parse(z.object({expectedVersion:version}).strict(),body);
    return this.db.$transaction(async db=>{
      const t=await db.teacher.findUniqueOrThrow({where:{accountId:actor.id}}),call=await db.consultation.findUnique({where:{id}});
      if (!call || call.teacherId!==t.id) fail(404,'NOT_FOUND','Consultation not found.');
      const p=await db.placement.findUniqueOrThrow({where:{id:call.placementId}});
      if (p.status!=='ACTIVE' || p.teacherId!==t.id || t.status!=='APPROVED' || !t.consultationOptIn) fail(409,'UNAVAILABLE','The teacher assignment is unavailable.');
      await this.service.guardian(db,call.guardianId);
      const flag=await db.featureFlag.findUnique({where:{name:'proCalls'}});if (!flag?.enabled) fail(503,'CALLS_PAUSED','Consultations are paused.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${call.guardianId},0))`;
      const m=await db.membership.findUnique({where:{guardianId:call.guardianId}});
      if (!m || m.status!=='ACTIVE' || m.periodEnd<call.startsAt || m.periodEnd<new Date() || m.used+m.reserved>=m.allowance) fail(409,'ALLOWANCE_UNAVAILABLE','No consultation allowance is available.');
      if (call.status!=='REQUESTED' || call.version!==expectedVersion || call.startsAt<new Date()) fail(409,'CONFLICT','Consultation has changed or expired.');
      const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(call.startsAt));
      if (hour<17 || hour>=20) fail(409,'OUTSIDE_CONSULTATION_WINDOW','Development consultation windows run from 5pm to 8pm IST.');
      await db.reservation.create({data:{teacherId:t.id,guardianId:call.guardianId,kind:'CONSULTATION',startsAt:call.startsAt,endsAt:new Date(call.startsAt.getTime()+600_000),status:'CONFIRMED',topic:call.id}});
      await db.membership.update({where:{id:m.id},data:{reserved:{increment:1},version:{increment:1}}});
      return db.consultation.update({where:{id},data:{status:'ACCEPTED',version:{increment:1}}});
    });
  }

  @Post('dev/pro/calls/:id/outcome') async callOutcome(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    if (!development()) fail(404,'NOT_FOUND','Not found.');parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const {outcome}=parse(z.object({outcome:z.enum(['CONNECTED','FAILED'])}).strict(),body);
    return this.service.once(req,actor,'call.outcome',body,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const t=await db.teacher.findUniqueOrThrow({where:{accountId:actor.id}}),call=await db.consultation.findUnique({where:{id}});
      if (!call || call.teacherId!==t.id) fail(404,'NOT_FOUND','Consultation not found.');
      if (call.status==='COMPLETED' || call.status==='FAILED') return call;
      if (call.status!=='ACCEPTED') fail(409,'CONFLICT','Consultation is not accepted.');
      await db.membership.update({where:{guardianId:call.guardianId},data:{reserved:{decrement:1},used:{increment:outcome==='CONNECTED'?1:0},version:{increment:1}}});
      await db.reservation.updateMany({where:{kind:'CONSULTATION',topic:id},data:{status:'COMPLETED',version:{increment:1}}});
      return db.consultation.update({where:{id},data:{status:outcome==='CONNECTED'?'COMPLETED':'FAILED',outcome,version:{increment:1}}});
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[MembershipsController]})
export class MembershipsModule {}
