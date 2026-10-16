import {coverageQuery,coverageWhere,scopeFilter} from '../../coverage';
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

  @Get('catalog') catalog() {return {city:'Raipur',subjects:['Maths','Science','English','Hindi','Physics','Chemistry','Biology','Economics','Statistics','Computer Science','Language','Numbers'],boards:['CBSE','CGBSE'],grades:[1,2,3,4,5,6,7,8,9,10,11,12],educationStages:['EARLY_YEARS','SCHOOL','COLLEGE'],earlyYearsLevels:['NURSERY','KG1','KG2'],studyYears:[1,2,3,4,5,6,7,8,9,10],customSubjects:true,customBoards:true,customCourses:true,languages:['English','Hindi'],modes:['ONLINE','HOME'],localities:['Shankar Nagar','Avanti Vihar','Telibandha','Civil Lines','Mowa'],timezone:'Asia/Kolkata'};}

  @Get('teachers') async teachers(@Query() query:unknown) {
    const data=parse(z.object({q:z.string().trim().max(100).optional(),...coverageQuery.shape,mode:z.preprocess(v=>v===''?undefined:v,z.enum(['HOME','ONLINE']).optional()),language:z.enum(['English','Hindi']).optional(),locality:z.string().trim().min(1).max(80).optional(),maxMonthlyPaise:z.coerce.number().int().min(50000).max(2000000).optional(),limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict(),query);
    let academic:Prisma.TeacherWhereInput;try{academic=coverageWhere(data);}catch{fail(400,'INVALID_EDUCATION_FILTER','Use criteria from one education stage.');}
    const where:Prisma.TeacherWhereInput={AND:[academic!],...(data.mode?{modes:{has:data.mode}}:{}),...(data.q?{OR:[{name:{contains:data.q,mode:'insensitive'}},{headline:{contains:data.q,mode:'insensitive'}},{bio:{contains:data.q,mode:'insensitive'}},coverageWhere({subject:data.q})]}:{})};
    Object.assign(where,{...(data.language?{languages:{has:data.language}}:{}),...(data.locality?{localities:{has:data.locality},travelAccepted:true}:{}),...(data.maxMonthlyPaise?{monthlyPaise:{lte:data.maxMonthlyPaise}}:{})});
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
