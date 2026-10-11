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
      const teacher=await db.teacher.create({data:{...profile,accountId:account.id,slug:`${profile.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${randomBytes(3).toString('hex')}`}});
      await db.account.update({where:{id:account.id},data:{role:'TEACHER'}});
      await this.service.event(db,'teacher.submitted',teacher.id);return teacher;
    });
  }

  @Get('admin/teachers') async adminTeachers(@Req() req: Request) {await this.service.actor(req,['ADMIN','REVIEWER']);return {items:await this.db.teacher.findMany({orderBy:{status:'asc'},take:50})};}

  @Post('admin/teachers/:id/reviews') async review(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','REVIEWER']);
    const data=parse(z.object({expectedVersion:version,status:z.enum(['APPROVED','CHANGES_REQUESTED','SUSPENDED']),reason:text(500)}).strict(),body);
    return this.db.$transaction(async db=>{
      const before=await db.teacher.findUnique({where:{id}});
      if (!before) fail(404,'NOT_FOUND','Teacher not found.');
      if (data.status==='APPROVED' && !before.screeningComplete) fail(409,'SCREENING_REQUIRED','Private evidence and capability screening must be completed by an approved reviewer before approval.');
      const changed=await db.teacher.updateMany({where:{id,version:data.expectedVersion},data:{status:data.status,version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','The application has changed.');
      if (data.status==='SUSPENDED') await db.note.updateMany({where:{sharedTeacherId:id},data:{sharedTeacherId:null}});
      await this.service.audit(db,actor,req,'TEACHER_REVIEW',id,data.reason,{status:before.status},{status:data.status});return db.teacher.findUniqueOrThrow({where:{id}});
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[TeachersController]})
export class TeachersModule {}
