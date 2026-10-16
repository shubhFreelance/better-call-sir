import {subjectSchema} from '../../coverage';
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

import {matched} from '../matching/eligibility';
import {closePlacement} from './closure';
import {preferenceSchema,normalizedPreferences} from '../requests/request-schedule';

@Controller('api/v1')
class PlacementsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  async closing(db:DB,actor:Account,id:string,expectedVersion:number){
    await this.service.guardian(db,actor.id);
    const initial=await db.placement.findUnique({where:{id}});if(!initial||initial.guardianId!==actor.id)fail(404,'NOT_FOUND','Placement not found.');
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    const p=await db.placement.findUniqueOrThrow({where:{id}});if(p.version!==expectedVersion||p.status==='CLOSED')fail(409,'CONFLICT','Placement changed or is closed.');return p;
  }
  @Post('placements/:id/closures') async close(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({expectedVersion:version,reason:text(1000)}).strict(),body);
    return this.service.once(req,actor,'placement.close',data,async db=>{const p=await this.closing(db,actor,id,data.expectedVersion),updated=await closePlacement(db,p);const support=await db.supportCase.create({data:{accountId:actor.id,region:actor.region,placementId:id,category:'GENERAL',description:`Placement closed: ${data.reason}`}});await this.service.audit(db,actor,req,'PLACEMENT_CLOSED',id,data.reason);await this.service.event(db,'placement.closed',id,updated.version);return {placement:updated,caseId:support.id};});
  }
  @Post('placements/:id/rematches') async rematch(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']),data=parse(z.object({expectedVersion:version,reason:text(1000),preferences:preferenceSchema,criteria:z.object({subject:subjectSchema,mode:z.enum(['ONLINE','HOME']),language:z.enum(['English','Hindi']),locality:text(80),budgetPaise:z.number().int().min(50_000).max(2_000_000)}).strict().optional()}).strict(),body),preferences=normalizedPreferences(data.preferences);if(!preferences)fail(400,'INVALID_SCHEDULE','Supply current future schedule criteria for replacement.');
    return this.service.once(req,actor,'placement.rematch',data,async db=>{const p=await this.closing(db,actor,id,data.expectedVersion),old=await db.tuitionRequest.findUniqueOrThrow({where:{id:p.requestId}});await closePlacement(db,p);
      const request=await db.tuitionRequest.create({data:{guardianId:p.guardianId,childId:p.childId,rematchFromPlacementId:id,discoveryMethod:'ASSISTED',subject:old.subject,mode:old.mode,language:old.language,locality:old.locality,budgetPaise:old.budgetPaise,schedule:old.schedule,region:old.region,schedulePreferences:preferences,scheduleStatus:'CONFIRMED',...data.criteria}});
      const support=await db.supportCase.create({data:{accountId:actor.id,region:old.region,placementId:id,category:'REPLACEMENT',description:`Replacement request ${request.id}: ${data.reason}`}});await this.service.audit(db,actor,req,'PLACEMENT_REMATCH_REQUESTED',id,data.reason,undefined,{requestId:request.id});await this.service.event(db,'request.created',request.id);return {request,caseId:support.id};
    });
  }
  @Post('placements') async placement(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({requestId:uuid,teacherId:uuid}).strict(),body);
    return this.service.once(req,actor,'placement.create',data,async db=>{
      await this.service.guardian(db,actor.id);const request=await db.tuitionRequest.findUnique({where:{id:data.requestId}});
      if (!request || request.guardianId!==actor.id || request.status!=='OPEN') fail(404,'NOT_FOUND','Active request not found.');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.teacherId},0))`;
      const child=await db.child.findUniqueOrThrow({where:{id:request.childId}}),teacher=await db.teacher.findUnique({where:{id:data.teacherId}});
      const candidate=await db.recommendation.findUnique({where:{requestId_teacherId:{requestId:request.id,teacherId:data.teacherId}}});
      if (!teacher || !candidate || candidate.response!=='ACCEPTED' || !await matched(db,request,child,teacher)) fail(409,'INELIGIBLE','An eligible, accepted recommendation is required.');
      const existingDemo=await db.demo.findFirst({where:{requestId:request.id,teacherId:teacher.id},orderBy:{createdAt:'desc'}});
      if(existingDemo&&!['COMPLETED','CANCELLED'].includes(existingDemo.status))fail(409,'DEMO_PENDING_REVIEW','An already requested demo must be completed, cancelled or resolved before opening terms.');
      const placement=await db.placement.create({data:{guardianId:actor.id,teacherId:teacher.id,childId:child.id,requestId:request.id,monthlyPaise:teacher.monthlyPaise}});
      await this.service.event(db,'placement.terms_requested',placement.id);return placement;
    });
  }

  @Post('placements/:id/acceptances') async acceptPlacement(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);const data=parse(z.object({expectedVersion:version,action:z.enum(['ACCEPT_TERMS','CONFIRM_START'])}).strict(),body);
    return this.service.once(req,actor,'placement.accept',data,async db=>{
      const initial=await db.placement.findUnique({where:{id}});
      const own=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null;
      if (!initial || (actor.role==='GUARDIAN'?initial.guardianId!==actor.id:initial.teacherId!==own?.id)) fail(404,'NOT_FOUND','Placement not found.');
      await this.service.guardian(db,initial.guardianId);
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const p=await db.placement.findUnique({where:{id}});const teacher=await db.teacher.findUnique({where:{accountId:actor.id}});
      if (!p || (actor.role==='GUARDIAN'?p.guardianId!==actor.id:p.teacherId!==teacher?.id)) fail(404,'NOT_FOUND','Placement not found.');
      await this.service.guardian(db,p.guardianId);
      if (p.version!==data.expectedVersion || p.status==='CLOSED') fail(409,'CONFLICT','Placement has changed.');
      if (data.action==='CONFIRM_START' && !(p.guardianAccepted && p.teacherAccepted)) fail(409,'TERMS_PENDING','Both parties must first accept tuition terms.');
      if (data.action==='CONFIRM_START' && !await db.recurringSchedule.findFirst({where:{placementId:id,status:'ACCEPTED'}})) fail(409,'SCHEDULE_PENDING','Both parties must accept the recurring timetable before starting tuition.');
      const changes=data.action==='ACCEPT_TERMS'?(actor.role==='GUARDIAN'?{guardianAccepted:true}:{teacherAccepted:true}):(actor.role==='GUARDIAN'?{guardianStarted:true}:{teacherReceiptConfirmed:true});
      let updated=await db.placement.update({where:{id},data:{...changes,version:{increment:1}}});
      if (updated.guardianStarted && updated.teacherReceiptConfirmed) {
        updated=await db.placement.update({where:{id},data:{status:'ACTIVE',startedAt:p.startedAt||new Date()}});
        const t=await db.teacher.findUniqueOrThrow({where:{id:p.teacherId}});
        await db.invoice.upsert({where:{placementId:id},create:{placementId:id,payerId:t.accountId,amountPaise:placementFee(p.monthlyPaise),policyVersion:p.policyVersion},update:{}});
        await this.service.event(db,'placement.started',id);
      }
      return updated;
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[PlacementsController]})
export class PlacementsModule {}
