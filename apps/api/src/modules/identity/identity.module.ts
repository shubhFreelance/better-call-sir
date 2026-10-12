import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module, Controller, Get, Post, Param, Query, Body, Req, Res, Injectable, Inject, HttpException, Catch, ExceptionFilter, ArgumentsHost, Global} from '@nestjs/common';
import {Prisma, PrismaClient, Account} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomBytes, randomInt, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z} from 'zod';
import {eligible, placementFee, verifiedAttendance, revisionRefund, window30} from '../../policies';

import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,HttpRequest,DB} from '../../shared';

import {emailAddress,sendEmailOtp} from './email-otp';

@Controller('api/v1')
class IdentityController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Get('dev/accounts') async devAccounts() {
    if (!development()) fail(404,'NOT_FOUND','Not found.');
    return this.db.account.findMany({where:{phone:{startsWith:'+91000000'}},select:{id:true,name:true,role:true,verified:true},orderBy:{role:'asc'}});
  }

  @Post('dev/session') async devSession(@Body() body: unknown,@Res({passthrough:true}) res: Response,@Req() req: Request) {
    if (!development()) fail(404,'NOT_FOUND','Not found.'); this.service.limit(`dev:${req.ip}`,30);
    const {accountId} = parse(z.object({accountId:uuid}).strict(),body);
    const account = await this.db.account.findUnique({where:{id:accountId}});
    if (!account || !account.phone?.startsWith('+91000000') || account.disabled) fail(404,'NOT_FOUND','Synthetic account not found.');
    return this.service.session(account,res);
  }

  @Post('auth/otp/request') async otpRequest(@Body() body: unknown,@Req() req: Request) {
    const {email}=parse(z.object({email:emailAddress}).strict(),body);
    this.service.limit(`otp:${email}`,3);this.service.limit(`otp-ip:${req.ip}`,10);
    if(!development())fail(503,'PROVIDER_UNAVAILABLE','Authentication is not qualified for live mode.');
    const code=String(randomInt(1000000)).padStart(6,'0'),digest=hash(code);
    await this.db.otp.upsert({where:{address:email},create:{address:email,hash:digest,expiresAt:new Date(Date.now()+300000)},update:{hash:digest,expiresAt:new Date(Date.now()+300000),attempts:0}});
    try{return await sendEmailOtp(email,code,randomUUID());}
    catch{await this.db.otp.deleteMany({where:{address:email,hash:digest}});fail(503,'EMAIL_UNAVAILABLE','Email delivery is unavailable. Please retry later.');}
  }

  @Post('auth/otp/verify') async otpVerify(@Body() body: unknown,@Req() req: Request,@Res({passthrough:true}) res: Response) {
    const {email,code,name}=parse(z.object({email:emailAddress,code:z.string().regex(/^\d{6}$/),name:text(80)}).strict(),body);
    this.service.limit(`verify:${req.ip}`,10);
    const account = await this.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email},0))`;
      const otp = await db.otp.findUnique({where:{address:email}});
      if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) return null;
      await db.otp.update({where:{address:email},data:{attempts:{increment:1}}});
      if (!same(otp.hash,hash(code))) return null;
      await db.otp.delete({where:{address:email}});
      return db.account.upsert({where:{email},create:{email,name},update:{}});
    });
    if (!account || account.disabled) fail(401,'INVALID_OTP','The code is invalid or expired.');
    return this.service.session(account,res);
  }

  @Get('auth/session') async session(@Req() req: Request) {
    const account = await this.service.actor(req);
    const current = await this.db.session.findUniqueOrThrow({where:{accessHash:hash(req.cookies.bcs_access)}});
    return {account:{id:account.id,name:account.name,role:account.role,verified:account.verified},csrfToken:current.csrf};
  }

  @Post('auth/refresh') async refresh(@Req() req: Request,@Res({passthrough:true}) res: Response) {
    const value=req.cookies?.bcs_refresh;
    if (typeof value!=='string' || !value || value.length>256) fail(401,'SESSION_REQUIRED','Sign in again.');
    const result=await this.db.$transaction(async db=>{
      const original=await db.session.findUnique({where:{refreshHash:hash(value)}});
      if(!original) return {error:true} as const;
      const account=await db.account.findUniqueOrThrow({where:{id:original.accountId}});
      if(account.disabled) return {error:true} as const;
      if(account.role==='STUDENT') {
        const child=await db.child.findUnique({where:{studentAccountId:account.id}});
        if(!child) return {error:true} as const;
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${child.guardianId},0))`;
        const consent=await db.consent.findUnique({where:{guardianId:child.guardianId}});
        const freshChild=await db.child.findUniqueOrThrow({where:{id:child.id}});
        if(freshChild.studentAccessRevokedAt || !consent || consent.withdrawnAt) return {error:true} as const;
      }
      // Family lock serializes every generation, replay and logout with replacement insertion.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${original.familyId},0))`;
      const session=await db.session.findUniqueOrThrow({where:{id:original.id}});
      if(session.revoked || session.expiresAt<=new Date()) return {error:true} as const;
      if(!same(req.get('X-CSRF-Token')||'',session.csrf)) fail(403,'CSRF','Refresh token validation failed.');
      if(session.rotated) {await db.session.updateMany({where:{familyId:session.familyId},data:{revoked:true}});return {error:true} as const;}
      await db.session.update({where:{id:session.id},data:{rotated:true}});
      const state=await this.service.issueSession(account,session.familyId,db,session.expiresAt);
      return {account,state};
    });
    if('error' in result) fail(401,'REFRESH_REPLAY','Session expired or refresh replay detected. Sign in again.');
    return this.service.sessionResponse(result.account,result.state,res);
  }

  @Post('auth/logout') async logout(@Req() req: Request,@Res({passthrough:true}) res: Response) {
    await this.service.actor(req);
    const session=await this.db.session.findUniqueOrThrow({where:{accessHash:hash(req.cookies.bcs_access)}});
    await this.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${session.familyId},0))`;
      await db.session.updateMany({where:{familyId:session.familyId},data:{revoked:true}});
    });
    res.clearCookie('bcs_access',{path:'/api/v1'});res.clearCookie('bcs_refresh',{path:'/api/v1'});return {status:'SIGNED_OUT'};
  }

  @Post('consents') async consent(@Req() req: Request,@Body() body: unknown) {
    const account=await this.service.actor(req,['GUARDIAN']);
    parse(z.object({purpose:z.literal('tuition-and-learning-records'),policyVersion:z.literal('development-v1'),accepted:z.literal(true)}).strict(),body);
    if (!account.verified) fail(403,'VERIFICATION_PENDING','An approved adult-verification method is required before child intake.');
    return this.db.consent.upsert({where:{guardianId:account.id},create:{guardianId:account.id},update:{withdrawnAt:null,grantedAt:new Date()}});
  }

  @Post('consents/withdraw') async withdraw(@Req() req: HttpRequest) {
    const account=await this.service.actor(req,['GUARDIAN']);
    return this.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
      await db.consent.updateMany({where:{guardianId:account.id},data:{withdrawnAt:new Date()}});
      await db.tuitionRequest.updateMany({where:{guardianId:account.id},data:{status:'WITHDRAWN',version:{increment:1}}});
      await db.note.updateMany({where:{guardianId:account.id},data:{sharedTeacherId:null,version:{increment:1}}});
      const children=await db.child.findMany({where:{guardianId:account.id}});
      await db.session.updateMany({where:{accountId:{in:children.flatMap(c=>c.studentAccountId?[c.studentAccountId]:[]) }},data:{revoked:true}});
      await this.service.audit(db,account,req,'CONSENT_WITHDRAWN',account.id,'Guardian withdrawal');
      await this.service.event(db,'consent.withdrawn',account.id);return {status:'WITHDRAWN'};
    });
  }

  @Get('children') async children(@Req() req: Request) {
    const account=await this.service.actor(req,['GUARDIAN','STUDENT']);
    return {items:await this.db.child.findMany({where:account.role==='GUARDIAN'?{guardianId:account.id}:{studentAccountId:account.id}})};
  }

  @Post('children/:id/invitations') async invitation(@Req() req: HttpRequest,@Param('id') id: string) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
    const secret=token();return this.db.$transaction(async db=>{
      await this.service.guardian(db,actor.id);await this.service.child(db,actor,id);
      const invite=await db.invitation.create({data:{childId:id,guardianId:actor.id,tokenHash:hash(secret),expiresAt:new Date(Date.now()+86_400_000)}});
      return {token:secret,expiresAt:invite.expiresAt};
    });
  }

  @Post('invitations/activate') async activate(@Req() req: HttpRequest,@Body() body: unknown,@Res({passthrough:true}) res: Response) {
    const guardian=await this.service.actor(req,['GUARDIAN']);const {token:secret}=parse(z.object({token:text(100)}).strict(),body);
    const account=await this.db.$transaction(async db=>{
      const invite=await db.invitation.findUnique({where:{tokenHash:hash(secret)}});
      if (!invite || invite.guardianId!==guardian.id || invite.usedAt || invite.expiresAt<new Date()) fail(409,'INVITATION_INVALID','Invitation expired, used, or belongs to another guardian.');
      await this.service.guardian(db,guardian.id);
      const changed=await db.invitation.updateMany({where:{id:invite.id,usedAt:null},data:{usedAt:new Date()}});
      if (!changed.count) fail(409,'INVITATION_USED','Invitation has already been used.');
      const child=await db.child.findUniqueOrThrow({where:{id:invite.childId}});
      if (child.studentAccountId) fail(409,'ALREADY_LINKED','Student access is already active.');
      const account=await db.account.create({data:{phone:`student:${child.id}`,name:child.alias,role:'STUDENT'}});
      await db.child.update({where:{id:child.id},data:{studentAccountId:account.id,version:{increment:1}}});return account;
    });
    return this.service.session(account,res);
  }

}
@Module({imports:[PersistenceModule],controllers:[IdentityController]})
export class IdentityModule {}
