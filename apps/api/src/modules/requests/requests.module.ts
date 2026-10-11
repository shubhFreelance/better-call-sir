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
class RequestsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('requests') async createRequest(@Req() req: HttpRequest,@Body() body: unknown) {
    const account=await this.service.actor(req,['GUARDIAN']);
    const data=parse(z.object({childId:uuid.optional(),alias:text(40),grade:z.number().int().min(6).max(10),board:z.enum(['CBSE','CGBSE']),subject:z.enum(['Maths','Science']),mode:z.enum(['ONLINE','HOME']),language:z.enum(['English','Hindi']),locality:text(80),budgetPaise:z.number().int().min(50_000).max(2_000_000),schedule:text(300)}).strict(),body);
    return this.service.once(req,account,'request.create',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
      await this.service.guardian(db,account.id);
      const child=data.childId?await this.service.child(db,account,data.childId):await db.child.create({data:{guardianId:account.id,alias:data.alias,grade:data.grade,board:data.board}});
      const request=await db.tuitionRequest.create({data:{guardianId:account.id,childId:child.id,subject:data.subject,mode:data.mode,language:data.language,locality:data.locality,budgetPaise:data.budgetPaise,schedule:data.schedule}});
      await this.service.event(db,'request.created',request.id);return request;
    });
  }

  @Get('requests') async requests(@Req() req: Request) {
    const account=await this.service.actor(req,['GUARDIAN','ADMIN','OPERATOR']);
    return {items:await this.db.tuitionRequest.findMany({where:account.role==='GUARDIAN'?{guardianId:account.id}:{},orderBy:{createdAt:'desc'},take:50})};
  }

  @Get('requests/:id') async request(@Req() req: Request,@Param('id') id: string) {
    parse(uuid,id);const account=await this.service.actor(req,['GUARDIAN','ADMIN','OPERATOR']);
    const request=await this.db.tuitionRequest.findUnique({where:{id}});
    if (!request || (account.role==='GUARDIAN' && request.guardianId!==account.id)) fail(404,'NOT_FOUND','Request not found.');
    return {...request,candidates:await this.db.recommendation.findMany({where:{requestId:id}})};
  }

}
@Module({imports:[PersistenceModule],controllers:[RequestsController]})
export class RequestsModule {}
