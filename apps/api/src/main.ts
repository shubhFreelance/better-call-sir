import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module, Controller, Get, Post, Param, Query, Body, Req, Res, Injectable, Inject, HttpException, Catch, ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import {Prisma, PrismaClient, Account} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z} from 'zod';
import {eligible, placementFee, verifiedAttendance, revisionRefund, window30} from './policies';

import {AppModule} from './app.module';
import {HttpRequest,development} from './shared';

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res=host.switchToHttp().getResponse<Response>(),req=host.switchToHttp().getRequest<HttpRequest>();
    let status=500,body: Record<string,unknown>={code:'INTERNAL',message:'Something went wrong. Please retry or contact support.'};
    if (exception instanceof HttpException) {status=exception.getStatus();const response=exception.getResponse();body=typeof response==='object'?response as Record<string,unknown>:{code:'ERROR',message:response};}
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002','P2004','P2034','P2039'].includes(exception.code) || String(exception.meta?.message).includes('reservation_no_overlap')) {status=409;body={code:'CONFLICT',message:'This record or time slot is no longer available. Refresh and try again.'};}
      else if (exception.code==='P2025') {status=404;body={code:'NOT_FOUND',message:'Record not found.'};}
    }
    if (status===500) console.error(JSON.stringify({requestId:req.requestId,error:exception instanceof Error?exception.name:'UnknownError'}));
    res.status(status).json({...body,requestId:req.requestId});
  }
}
async function bootstrap() {
  if (!development()) throw new Error('Live mode is blocked until authentication, guardian verification, MFA and payment adapters pass release gates.');
  const app=await NestFactory.create(AppModule,{logger:['error','warn','log']});
  app.use(helmet());app.use(cookieParser());
  app.use((req: HttpRequest,res: Response,next: ()=>void)=>{
    req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);
    if (!req.path.startsWith('/api/v1/teachers') && !req.path.startsWith('/api/v1/catalog')) res.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('Origin')!== (process.env.WEB_ORIGIN || 'http://localhost:3000')) {res.status(403).json({code:'ORIGIN',message:'Request origin is not allowed.',requestId:req.requestId});return;}
    next();
  });
  app.useGlobalFilters(new ErrorFilter());app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000),'0.0.0.0');
}
bootstrap().catch(error=>{console.error(error.message);process.exit(1);});
