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
class MatchingController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('admin/requests/:id/recommendations') async recommend(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const account=await this.service.actor(req,['ADMIN','OPERATOR']);
    const {expectedVersion}=parse(z.object({expectedVersion:version}).strict(),body);
    return this.db.$transaction(async db=>{
      const request=await db.tuitionRequest.findUnique({where:{id}});
      if (!request) fail(404,'NOT_FOUND','Request not found.');
      await this.service.guardian(db,request.guardianId);
      if (request.version!==expectedVersion || request.status!=='OPEN') fail(409,'CONFLICT','The request has changed.');
      const child=await db.child.findUniqueOrThrow({where:{id:request.childId}});
      const pool=(await db.teacher.findMany()).filter(t=>eligible(request,child,t));
      const items=[];
      for (const t of pool) items.push(await db.recommendation.upsert({where:{requestId_teacherId:{requestId:id,teacherId:t.id}},create:{requestId:id,teacherId:t.id,score:100,reasons:[`${request.subject} · Class ${child.grade} · ${child.board}`,`${request.language} instruction`,'Within your monthly budget',request.mode==='ONLINE'?'Online lessons':`Serves ${request.locality}`]},update:{}}));
      await this.service.audit(db,account,req,'RECOMMENDATIONS_CREATED',id,'Rules-v1 eligibility review',undefined,{candidateIds:items.map(x=>x.id)});
      return {items,rankerVersion:'rules-v1',scheduleStatus:'MANUAL_CONFIRMATION_REQUIRED'};
    });
  }

  @Post('candidates/:id/responses') async response(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const data=parse(z.object({response:z.enum(['ACCEPTED','DECLINED'])}).strict(),body);
    const teacher=await this.db.teacher.findUniqueOrThrow({where:{accountId:actor.id}});
    const candidate=await this.db.recommendation.findUnique({where:{id}});
    if (!candidate || candidate.teacherId!==teacher.id) fail(404,'NOT_FOUND','Opportunity not found.');
    return this.db.recommendation.update({where:{id},data});
  }

}
@Module({imports:[PersistenceModule],controllers:[MatchingController]})
export class MatchingModule {}
