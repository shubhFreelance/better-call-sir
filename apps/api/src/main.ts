import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module, Controller, Get, Post, Param, Query, Body, Req, Res, Injectable, Inject, HttpException, Catch, ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import {Prisma, PrismaClient, Account} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {Request, Response,json} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z} from 'zod';
import {eligible, placementFee, verifiedAttendance, revisionRefund, window30} from './policies';

import {AppModule} from './app.module';
import {AppService,HttpRequest,development} from './shared';

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res=host.switchToHttp().getResponse<Response>(),req=host.switchToHttp().getRequest<HttpRequest>();
    let status=500,body: Record<string,unknown>={code:'INTERNAL',message:'Something went wrong. Please retry or contact support.'};
    if (typeof exception==='object' && exception!==null && 'type' in exception && exception.type==='entity.too.large') {status=413;body={code:'UPLOAD_TOO_LARGE',message:'The request body exceeds the upload limit.'};}
    else if (typeof exception==='object' && exception!==null && 'type' in exception && exception.type==='entity.parse.failed') {status=400;body={code:'INVALID_JSON',message:'Request JSON is invalid.'};}
    else if (exception instanceof HttpException) {status=exception.getStatus();const response=exception.getResponse();body=typeof response==='object'?response as Record<string,unknown>:{code:'ERROR',message:response};}
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002','P2004','P2034','P2039'].includes(exception.code) || String(exception.meta?.message).includes('reservation_no_overlap')) {status=409;body={code:'CONFLICT',message:'This record or time slot is no longer available. Refresh and try again.'};}
      else if (exception.code==='P2025') {status=404;body={code:'NOT_FOUND',message:'Record not found.'};}
    }
    if (status===500) console.error(JSON.stringify({requestId:req.requestId,error:exception instanceof Error?exception.name:'UnknownError'}));
    if([401,403,429].includes(status))console.warn(JSON.stringify({event:'security-denied',status,code:body.code,requestId:req.requestId}));
    if(status===429)res.setHeader('Retry-After','60');
    res.status(status).json({...body,requestId:req.requestId});
  }
}
async function bootstrap() {
  if (!development()) throw new Error('Live mode is blocked until authentication, guardian verification, MFA and payment adapters pass release gates.');
  const app=await NestFactory.create(AppModule,{logger:['error','warn','log'],bodyParser:false});
  app.getHttpAdapter().getInstance().set('trust proxy',false);
  app.use(helmet());app.use(cookieParser());
  const service=app.get(AppService);
  app.use(async(req: HttpRequest,res: Response,next: (error?:unknown)=>void)=>{
    req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);
    res.setHeader('Cache-Control','no-store');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.path!=='/api/v1/billing/webhooks/razorpay' && req.get('Origin')!== (process.env.WEB_ORIGIN || 'http://localhost:3000')) {res.status(403).json({code:'ORIGIN',message:'Request origin is not allowed.',requestId:req.requestId});return;}
    try{if(!req.path.startsWith('/api/v1/health/'))await service.limit('request:'+req.ip,3000);next();}catch(error){next(error);}
  });
  const normal=json({limit:'64kb'}),upload=json({limit:'8mb'}),webhook=json({limit:'128kb',verify:(req,_,buffer)=>{(req as HttpRequest).rawBody=Buffer.from(buffer);}});
  app.use((req:HttpRequest,res:Response,next:(error?:unknown)=>void)=>{const parser=req.path==='/api/v1/billing/webhooks/razorpay'?webhook:req.method==='POST'&&/^\/api\/v1\/teachers\/[^/]+\/evidence$/.test(req.path)?upload:normal;parser(req,res,error=>{if(!error)return next();const large=error.type==='entity.too.large';res.status(large?413:400).json({code:large?'UPLOAD_TOO_LARGE':'INVALID_JSON',message:large?'The request body exceeds the upload limit.':'Request JSON is invalid.',requestId:req.requestId});});});
  app.useGlobalFilters(new ErrorFilter());app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000),'0.0.0.0');
  const server=app.getHttpServer();server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=30000;server.keepAliveTimeout=5000;
}
bootstrap().catch(error=>{console.error(error instanceof Error&&error.message.startsWith('Live mode is blocked')?error.message:'API startup failed. Check restricted server configuration and dependencies.');process.exit(1);});
