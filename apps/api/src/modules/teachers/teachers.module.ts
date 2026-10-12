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

import {reviewed} from '../verification/verification.module';
import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,HttpRequest,DB} from '../../shared';

@Controller('api/v1')
class TeachersController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('teacher-applications') async application(@Req() req: HttpRequest,@Body() body: unknown) {
    const account=await this.service.actor(req,['GUARDIAN','TEACHER']);
    const data=parse(z.object({name:text(80),headline:text(120),bio:text(1500),subjects:z.array(z.enum(['Maths','Science'])).min(1).max(2),boards:z.array(z.enum(['CBSE','CGBSE'])).min(1).max(2),grades:z.array(z.number().int().min(6).max(10)).min(1).max(5),languages:z.array(z.enum(['English','Hindi'])).min(1).max(2),modes:z.array(z.enum(['ONLINE','HOME'])).min(1).max(2),localities:z.array(text(80)).max(20),monthlyPaise:z.number().int().min(50_000).max(2_000_000),experience:z.number().int().min(0).max(60),consultationOptIn:z.boolean(),feeTermsAccepted:z.literal(true)}).strict(),body);
    const {feeTermsAccepted,...profile}=data;
    return this.service.once(req,account,'teacher.apply',data,async db=>{
      const existing=await db.teacher.findUnique({where:{accountId:account.id}});
      if (existing) fail(409,'EXISTING_APPLICATION','Your application is already saved.');
      const teacher=await db.teacher.create({data:{...profile,accountId:account.id,feeTermsAcceptedAt:new Date(),region:account.region,slug:`${profile.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${randomBytes(3).toString('hex')}`}});
      await db.account.update({where:{id:account.id},data:{role:'TEACHER'}});
      await this.service.event(db,'teacher.submitted',teacher.id);return teacher;
    });
  }

  @Post('teacher-applications/:id/revisions') async revise(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);
    const data=parse(z.object({expectedVersion:version,name:text(80),headline:text(120),bio:text(1500),subjects:z.array(z.enum(['Maths','Science'])).min(1).max(2),boards:z.array(z.enum(['CBSE','CGBSE'])).min(1).max(2),grades:z.array(z.number().int().min(6).max(10)).min(1).max(5),languages:z.array(z.enum(['English','Hindi'])).min(1).max(2),modes:z.array(z.enum(['ONLINE','HOME'])).min(1).max(2),localities:z.array(text(80)).max(20),monthlyPaise:z.number().int().min(50000).max(2000000),experience:z.number().int().min(0).max(60),consultationOptIn:z.boolean(),feeTermsAccepted:z.literal(true)}).strict(),body);
    return this.service.once(req,actor,'teacher.revise',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const teacher=await db.teacher.findUnique({where:{id}});if(!teacher||teacher.accountId!==actor.id)fail(404,'NOT_FOUND','Application not found.');
      if(teacher.version!==data.expectedVersion)fail(409,'CONFLICT','Application changed.');
      const {expectedVersion,feeTermsAccepted,...profile}=data;
      const updated=await db.teacher.update({where:{id},data:{...profile,feeTermsAcceptedAt:new Date(),status:'SUBMITTED',screeningComplete:false,screeningValidUntil:null,profileRevision:{increment:1},version:{increment:1}}});
      await db.note.updateMany({where:{sharedTeacherId:id},data:{sharedTeacherId:null}});
      await this.service.audit(db,actor,req,'TEACHER_REVIEW_REOPENED',id,'Material profile resubmission',undefined,{profileRevision:updated.profileRevision});await this.service.event(db,'teacher.review_reopened',id,updated.version);return updated;
    });
  }

  @Get('admin/teachers') async adminTeachers(@Req() req: Request) {const actor=await this.service.actor(req,['ADMIN','REVIEWER']);return {items:await this.db.teacher.findMany({where:actor.role==='ADMIN'?{}:{region:actor.region},orderBy:{status:'asc'},take:50})};}

  @Post('admin/teachers/:id/reviews') async review(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','REVIEWER']);
    const data=parse(z.object({expectedVersion:version,status:z.enum(['APPROVED','CHANGES_REQUESTED','SUSPENDED']),reason:text(500)}).strict(),body);
    return this.service.once(req,actor,'teacher.review',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const before=await db.teacher.findUnique({where:{id}});
      if (!before || (actor.role!=='ADMIN'&&before.region!==actor.region)) fail(404,'NOT_FOUND','Teacher not found.');
      if (before.accountId===actor.id) fail(403,'SELF_REVIEW','You cannot review your own application.');
      const validUntil=data.status==='APPROVED'?await reviewed(db,before):null;
      if (data.status==='APPROVED' && (!validUntil || !before.feeTermsAcceptedAt)) fail(409,'SCREENING_REQUIRED','Current identity, qualification, capability and reference checks with clean evidence and accepted fee terms are required.');
      const changed=await db.teacher.updateMany({where:{id,version:data.expectedVersion},data:{status:data.status,screeningComplete:data.status==='APPROVED',screeningValidUntil:validUntil,version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','The application has changed.');
      if (data.status==='SUSPENDED') {
        await db.note.updateMany({where:{sharedTeacherId:id},data:{sharedTeacherId:null}});
        const bookings=await db.reservation.findMany({where:{teacherId:id,status:'CONFIRMED',endsAt:{gt:new Date()}},select:{id:true}});
        const paid=await db.payment.findMany({where:{reservationId:{in:bookings.map(b=>b.id)}},select:{reservationId:true}});
        if (paid.length) {
          const support=await db.supportCase.create({data:{accountId:actor.id,category:'PAID_BOOKING_REVIEW',description:`Suspended teacher ${id}; ${paid.length} paid confirmed bookings require review. First 50 booking IDs: ${paid.slice(0,50).map(p=>p.reservationId).join(',')}`}});
          await this.service.audit(db,actor,req,'SUSPENDED_TEACHER_BOOKINGS_FLAGGED',support.id,data.reason,undefined,{teacherId:id,bookingCount:paid.length});
          await this.service.event(db,'support.booking_review_requested',support.id);
        }
      }
      await this.service.audit(db,actor,req,'TEACHER_REVIEW',id,data.reason,{status:before.status},{status:data.status});return db.teacher.findUniqueOrThrow({where:{id}});
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[TeachersController]})
export class TeachersModule {}
