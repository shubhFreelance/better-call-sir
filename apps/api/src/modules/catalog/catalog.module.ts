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
class CatalogController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Get('health/live') live() {return {status:'ok'};}

  @Get('health/ready') async ready() {await this.db.$queryRaw`SELECT 1`; return {status:'ready',mode:development()?'synthetic-development':'production'};}

  @Get('catalog') catalog() {return {city:'Raipur',subjects:['Maths','Science'],boards:['CBSE','CGBSE'],grades:[6,7,8,9,10],languages:['English','Hindi'],modes:['ONLINE','HOME'],localities:['Shankar Nagar','Avanti Vihar','Telibandha','Civil Lines','Mowa'],timezone:'Asia/Kolkata'};}

  @Get('teachers') async teachers(@Query() query:unknown) {
    const data=parse(z.object({q:z.string().trim().max(100).optional(),subject:z.preprocess(v=>v===''?undefined:v,z.enum(['Maths','Science']).optional()),mode:z.preprocess(v=>v===''?undefined:v,z.enum(['HOME','ONLINE']).optional()),limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict(),query);
    const where:Prisma.TeacherWhereInput={...(data.subject?{subjects:{has:data.subject}}:{}),...(data.mode?{modes:{has:data.mode}}:{}),...(data.q?{OR:[{name:{contains:data.q,mode:'insensitive'}},{headline:{contains:data.q,mode:'insensitive'}},{subjects:{has:data.q}}]}:{})};
    const rows=await this.service.publicTeachers(where,data.limit+1,data.cursor);
    return {items:rows.slice(0,data.limit),nextCursor:rows.length>data.limit?rows[data.limit-1].id:null};
  }

  @Get('teachers/:slug') async teacher(@Param('slug') slug: string) {
    const profile = (await this.service.publicTeachers({slug},1))[0];
    if (!profile) fail(404,'NOT_FOUND','Teacher profile is unavailable.'); return profile;
  }

}
@Module({imports:[PersistenceModule],controllers:[CatalogController]})
export class CatalogModule {}
