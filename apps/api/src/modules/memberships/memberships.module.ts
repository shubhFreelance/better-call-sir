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

@Controller('api/v1')
class MembershipsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Get('pro/membership') async membership(@Req() req:HttpRequest){const actor=await this.service.actor(req,['GUARDIAN']);const m=await this.db.membership.findUnique({where:{guardianId:actor.id}});return {membership:m,active:!!m&&m.status==='ACTIVE'&&m.periodStart<=new Date()&&m.periodEnd>new Date(),automaticRenewal:false,callsEnabled:!!(await this.db.featureFlag.findUnique({where:{name:'proCalls'}}))?.enabled};}
  @Post('pro/membership/cancellations') async cancelMembership(@Req() req:HttpRequest,@Body() body:unknown){const actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({expectedVersion:version,reason:text(300)}).strict(),body);return this.service.once(req,actor,'membership.cancel',data,async db=>{await this.service.guardian(db,actor.id);const changed=await db.membership.updateMany({where:{guardianId:actor.id,status:'ACTIVE',version:data.expectedVersion,periodEnd:{gt:new Date()}},data:{cancelAtPeriodEnd:true,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Membership changed or expired.');const m=await db.membership.findUniqueOrThrow({where:{guardianId:actor.id}});await this.service.audit(db,actor,req,'MEMBERSHIP_CANCEL_AT_PERIOD_END',m.id,data.reason);return m;});}
  @Post('pro/calls/:id/cancellations') async cancelCall(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER']),data=parse(z.object({expectedVersion:version,reason:text(300)}).strict(),body);return this.service.once(req,actor,'call.cancel',data,async db=>{const own=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null,initial=await db.consultation.findUnique({where:{id}});if(!initial||(actor.role==='GUARDIAN'?initial.guardianId!==actor.id:initial.teacherId!==own?.id))fail(404,'NOT_FOUND','Consultation not found.');await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.guardianId},0))`;const call=await db.consultation.findUniqueOrThrow({where:{id}});if(call.version!==data.expectedVersion||!['REQUESTED','ACCEPTED'].includes(call.status))fail(409,'CONFLICT','Consultation changed.');if(call.status==='ACCEPTED')await db.membership.update({where:{guardianId:call.guardianId},data:{reserved:{decrement:1},version:{increment:1}}});await db.reservation.updateMany({where:{kind:'CONSULTATION',topic:id,status:'CONFIRMED'},data:{status:'CANCELLED',version:{increment:1}}});const updated=await db.consultation.update({where:{id},data:{status:'CANCELLED',version:{increment:1}}});await this.service.audit(db,actor,req,'CONSULTATION_CANCELLED',id,data.reason);return updated;});}
  @Post('pro/calls') async call(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({placementId:uuid,startsAt:z.iso.datetime({offset:true})}).strict(),body);
    return this.service.once(req,actor,'call.request',data,async db=>{
      await this.service.guardian(db,actor.id);
      const flag=await db.featureFlag.findUnique({where:{name:'proCalls'}});if (!flag?.enabled) fail(503,'CALLS_PAUSED','Consultations are temporarily paused.');
      const membership=await db.membership.findUnique({where:{guardianId:actor.id}});
      if (!membership || membership.status!=='ACTIVE' || membership.periodStart>new Date() || membership.periodEnd<=new Date()) fail(403,'PRO_REQUIRED','An active Parent Pro pass is required. Ordinary support remains free.');
      if (membership.used+membership.reserved>=membership.allowance) fail(409,'ALLOWANCE_EXHAUSTED','Your consultation allowance is fully reserved or used.');
      const p=await db.placement.findUnique({where:{id:data.placementId}});
      if (!p || p.guardianId!==actor.id || p.status!=='ACTIVE') fail(404,'NOT_FOUND','Active teacher assignment not found.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${p.teacherId},0))`;
      const teacher=await db.teacher.findUniqueOrThrow({where:{id:p.teacherId}});
      if (teacher.status!=='APPROVED' || !teacher.screeningComplete || !teacher.screeningValidUntil || teacher.screeningValidUntil<=new Date() || !teacher.consultationOptIn) fail(409,'UNAVAILABLE','This teacher is not accepting consultations.');
      const startsAt=new Date(data.startsAt);if (startsAt<new Date() || startsAt>membership.periodEnd) fail(400,'INVALID_SLOT','Select a future slot within your membership period.');
      const account=await db.account.findUnique({where:{id:teacher.accountId}});
      if (!account || account.disabled || !await available(db,teacher.id,'CALL',startsAt,new Date(startsAt.getTime()+600_000))) fail(409,'SLOT_UNAVAILABLE','Choose a currently advertised free consultation slot.');
      return db.consultation.create({data:{guardianId:actor.id,teacherId:p.teacherId,placementId:p.id,startsAt}});
    });
  }

  @Post('pro/calls/:id/accept') async acceptCall(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const {expectedVersion}=parse(z.object({expectedVersion:version}).strict(),body);
    return this.service.once(req,actor,'call.accept',{id,expectedVersion},async db=>{
      const initialTeacher=await db.teacher.findUniqueOrThrow({where:{accountId:actor.id}}),initial=await db.consultation.findUnique({where:{id}});
      if (!initial || initial.teacherId!==initialTeacher.id) fail(404,'NOT_FOUND','Consultation not found.');
      await this.service.guardian(db,initial.guardianId);
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
      const t=await db.teacher.findUniqueOrThrow({where:{id:initial.teacherId}}),call=await db.consultation.findUnique({where:{id}});
      if (!call || call.teacherId!==t.id) fail(404,'NOT_FOUND','Consultation not found.');
      const p=await db.placement.findUniqueOrThrow({where:{id:call.placementId}});
      if (p.status!=='ACTIVE' || p.teacherId!==t.id || t.status!=='APPROVED' || !t.screeningComplete || !t.screeningValidUntil || t.screeningValidUntil<=new Date() || !t.consultationOptIn) fail(409,'UNAVAILABLE','The teacher assignment is unavailable.');
      await this.service.guardian(db,call.guardianId);
      const flag=await db.featureFlag.findUnique({where:{name:'proCalls'}});if (!flag?.enabled) fail(503,'CALLS_PAUSED','Consultations are paused.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${call.guardianId},0))`;
      const m=await db.membership.findUnique({where:{guardianId:call.guardianId}});
      if (!m || m.status!=='ACTIVE' || m.periodEnd<call.startsAt || m.periodEnd<new Date() || m.used+m.reserved>=m.allowance) fail(409,'ALLOWANCE_UNAVAILABLE','No consultation allowance is available.');
      if (call.status!=='REQUESTED' || call.version!==expectedVersion || call.startsAt<new Date()) fail(409,'CONFLICT','Consultation has changed or expired.');
      const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(call.startsAt));
      if (hour<17 || hour>=20) fail(409,'OUTSIDE_CONSULTATION_WINDOW','Development consultation windows run from 5pm to 8pm IST.');
      const pattern=await available(db,t.id,'CALL',call.startsAt,new Date(call.startsAt.getTime()+600_000));
      if (!pattern) fail(409,'SLOT_UNAVAILABLE','The consultation slot is no longer available.');
      await db.reservation.updateMany({where:{teacherId:t.id,status:'HOLD',expiresAt:{lt:new Date()}},data:{status:'EXPIRED',version:{increment:1}}});
      await this.service.audit(db,actor,req,'CONSULTATION_ACCEPTED',id,'Teacher accepted declared consultation slot');
      await db.reservation.create({data:{teacherId:t.id,guardianId:call.guardianId,kind:'CONSULTATION',source:'ADVERTISED',sourceId:pattern.id,startsAt:call.startsAt,endsAt:new Date(call.startsAt.getTime()+600_000),status:'CONFIRMED',topic:call.id}});
      await db.membership.update({where:{id:m.id},data:{reserved:{increment:1},version:{increment:1}}});
      return db.consultation.update({where:{id},data:{status:'ACCEPTED',version:{increment:1}}});
    });
  }

  @Post('dev/pro/calls/:id/outcome') async callOutcome(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    if (!development()) fail(404,'NOT_FOUND','Not found.');parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const {outcome}=parse(z.object({outcome:z.enum(['CONNECTED','FAILED'])}).strict(),body);
    return this.service.once(req,actor,'call.outcome',body,async db=>{
      const initial=await db.consultation.findUnique({where:{id}});if(!initial)fail(404,'NOT_FOUND','Consultation not found.');await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.guardianId},0))`;await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
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
