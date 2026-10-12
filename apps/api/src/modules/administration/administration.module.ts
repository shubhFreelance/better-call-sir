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
class AdministrationController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Get('admin/jobs') async jobs(@Req() req:HttpRequest,@Query() query:unknown){const actor=await this.service.actor(req,['ADMIN']);const data=parse(z.object({status:z.enum(['PENDING','FAILED']).default('FAILED')}).strict(),query);const items=await this.db.outbox.findMany({where:{processedAt:null,...(data.status==='FAILED'?{attempts:{gte:5}}:{})},orderBy:{createdAt:'asc'},take:50,select:{id:true,type:true,aggregateId:true,attempts:true,createdAt:true}});await this.service.audit(this.db,actor,req,'JOB_QUEUE_READ','jobs','Administrator accessed sanitized recovery queue');return {items};}
  @Post('admin/jobs/:id/retries') async retryJob(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){parse(uuid,id);const actor=await this.service.actor(req,['ADMIN']),data=parse(z.object({expectedAttempts:z.number().int().min(5).max(50),reason:text(500),confirmed:z.literal(true)}).strict(),body);return this.service.once(req,actor,'job.retry',data,async db=>{const job=await db.outbox.findUnique({where:{id}});if(!job)fail(404,'NOT_FOUND','Job not found.');if(job.processedAt||job.attempts!==data.expectedAttempts||!['evidence.scan_requested','privacy.evidence_delete_requested'].includes(job.type))fail(409,'RETRY_UNAVAILABLE','This job changed or needs its dedicated recovery workflow.');const evidence=await db.evidence.findUnique({where:{id:job.aggregateId}});if(!evidence||evidence.status!==(job.type==='evidence.scan_requested'?'QUARANTINED':'DELETED'))fail(409,'RESOURCE_CHANGED','The media state no longer permits this job.');const changed=await db.outbox.updateMany({where:{id,processedAt:null,attempts:data.expectedAttempts},data:{attempts:0,payload:{version:evidence.version}}});if(!changed.count)fail(409,'CONFLICT','Job changed.');await this.service.audit(db,actor,req,'JOB_RETRY_REQUESTED',id,data.reason,undefined,{type:job.type});return {id,status:'PENDING',attempts:0};});}
  @Get('dashboard') async dashboard(@Req() req: Request) {
    const actor=await this.service.actor(req);const window=window30();
    if (actor.role==='ADMIN') return {role:actor.role,window,metrics:{requests:await this.db.tuitionRequest.count({where:{status:'OPEN'}}),pendingTeachers:await this.db.teacher.count({where:{status:'SUBMITTED'}}),activePlacements:await this.db.placement.count({where:{status:'ACTIVE'}}),openCases:await this.db.supportCase.count({where:{status:'OPEN'}})},cases:await this.db.supportCase.findMany({take:20,orderBy:{createdAt:'desc'}}),flags:await this.db.featureFlag.findMany(),audit:await this.db.audit.findMany({take:20,orderBy:{createdAt:'desc'},select:{id:true,action:true,aggregateId:true,reason:true,createdAt:true}}),jobs:{pending:await this.db.outbox.count({where:{processedAt:null}}),failed:await this.db.outbox.count({where:{processedAt:null,attempts:{gte:5}}})}};
    const teacher=actor.role==='TEACHER'?await this.db.teacher.findUnique({where:{accountId:actor.id}}):null;
    const children=await this.db.child.findMany({where:actor.role==='STUDENT'?{studentAccountId:actor.id}:actor.role==='GUARDIAN'?{guardianId:actor.id}:{id:{in:[]}}});
    const lessons=await this.db.lesson.findMany({where:teacher?{teacherId:teacher.id}:{childId:{in:children.map(c=>c.id)}},orderBy:{startsAt:'desc'},take:100});
    const period=await this.db.lesson.findMany({where:{...(teacher?{teacherId:teacher.id}:{childId:{in:children.map(c=>c.id)}}),startsAt:{gte:window.start,lte:window.end}}});
    const placements=await this.db.placement.findMany({where:teacher?{teacherId:teacher.id}:{childId:{in:children.map(c=>c.id)}}});
    const teachers=(await this.service.publicTeachers()).filter(t=>placements.some(p=>p.teacherId===t.id));
    return {role:actor.role,window,children,lessons,placements,teachers,metrics:{classesTaken:period.filter(verifiedAttendance).length,completedLessons:period.filter(l=>l.status==='COMPLETED').length,uniqueStudentsTaught:new Set(period.filter(verifiedAttendance).map(l=>l.childId)).size,activeStudents:new Set(placements.filter(p=>p.status==='ACTIVE').map(p=>p.childId)).size,pendingAttendance:period.filter(l=>l.attendance==='PENDING').length,disputed:period.filter(l=>l.disputed).length},
      ...(actor.role==='GUARDIAN'?{requests:await this.db.tuitionRequest.findMany({where:{guardianId:actor.id},orderBy:{createdAt:'desc'}}),reservations:await this.db.reservation.findMany({where:{guardianId:actor.id},orderBy:{startsAt:'asc'}}),membership:await this.db.membership.findUnique({where:{guardianId:actor.id}}),calls:await this.db.consultation.findMany({where:{guardianId:actor.id}}),consent:await this.db.consent.findUnique({where:{guardianId:actor.id}})}:{}),
      ...(teacher?{profile:teacher,reservations:await this.db.reservation.findMany({where:{teacherId:teacher.id},orderBy:{startsAt:'asc'}}),opportunities:await this.db.recommendation.findMany({where:{teacherId:teacher.id,response:'PENDING',runId:{not:null},expiresAt:{gt:new Date()}}}),invoices:await this.db.invoice.findMany({where:{payerId:actor.id}}),calls:await this.db.consultation.findMany({where:{teacherId:teacher.id}})}:{})};
  }

  @Post('admin/flags/:name') async flag(@Req() req: HttpRequest,@Param('name') name: string,@Body() body: unknown) {
    const actor=await this.service.actor(req,['ADMIN']);parse(z.enum(['revision','checkout','proCalls','ai']),name);
    const data=parse(z.object({enabled:z.boolean(),expectedVersion:version,reason:text(500),confirmed:z.literal(true)}).strict(),body);
    if (['ai','checkout','proCalls'].includes(name) && data.enabled) fail(409,'RELEASE_GATE','This integration requires reviewed provider and release evidence before activation.');
    return this.db.$transaction(async db=>{
      const changed=await db.featureFlag.updateMany({where:{name,version:data.expectedVersion},data:{enabled:data.enabled,version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','Configuration has changed.');
      await this.service.audit(db,actor,req,'FEATURE_FLAG_CHANGED',name,data.reason,undefined,{enabled:data.enabled});return db.featureFlag.findUniqueOrThrow({where:{name}});
    });
  }
}
@Module({imports:[PersistenceModule],controllers:[AdministrationController]})
export class AdministrationModule {}
