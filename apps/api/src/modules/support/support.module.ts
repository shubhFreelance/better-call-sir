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
class SupportController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('cases') async support(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN','TEACHER','STUDENT']);const data=parse(z.object({category:z.enum(['SAFETY','REPLACEMENT','ATTENDANCE','PAYMENT','PRIVACY','GENERAL']),description:text(3000)}).strict(),body);
    return this.service.once(req,actor,'case.create',data,async db=>{const c=await db.supportCase.create({data:{...data,accountId:actor.id}});await this.service.event(db,'case.created',c.id);return c;});
  }

}
@Module({imports:[PersistenceModule],controllers:[SupportController]})
export class SupportModule {}
