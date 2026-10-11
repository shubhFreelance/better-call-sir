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
class LearningRecordsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('lessons/:id/attendance') async attendance(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const data=parse(z.object({expectedVersion:version,attendance:z.enum(['PRESENT','LATE','ABSENT']),reason:text(300)}).strict(),body);
    return this.service.once(req,actor,'lesson.attendance',data,async db=>{
      const teacher=await db.teacher.findUniqueOrThrow({where:{accountId:actor.id}});
      const before=await db.lesson.findUnique({where:{id}});
      if (!before || before.teacherId!==teacher.id) fail(404,'NOT_FOUND','Lesson not found.');
      if (before.startsAt>new Date() || before.status==='CANCELLED') fail(409,'LESSON_NOT_READY','Only a past, non-cancelled lesson can be completed.');
      const changed=await db.lesson.updateMany({where:{id,version:data.expectedVersion},data:{attendance:data.attendance,status:'COMPLETED',version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','Attendance has changed.');
      await this.service.audit(db,actor,req,'ATTENDANCE_CHANGED',id,data.reason,{attendance:before.attendance},{attendance:data.attendance});
      await this.service.event(db,'attendance.changed',id);return db.lesson.findUniqueOrThrow({where:{id}});
    });
  }

  @Post('lessons/:id/disputes') async dispute(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']);const {reason}=parse(z.object({reason:text(500)}).strict(),body);
    return this.db.$transaction(async db=>{
      const lesson=await db.lesson.findUnique({where:{id}});if (!lesson) fail(404,'NOT_FOUND','Lesson not found.');
      await this.service.child(db,actor,lesson.childId);
      await db.lesson.update({where:{id},data:{disputed:true,version:{increment:1}}});
      await this.service.audit(db,actor,req,'ATTENDANCE_DISPUTED',id,reason);return {status:'DISPUTED'};
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[LearningRecordsController]})
export class LearningRecordsModule {}
