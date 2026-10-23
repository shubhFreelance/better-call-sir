import {requestOtp} from '../notifications/otp-delivery';
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

import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,privileged,HttpRequest,DB} from '../../shared';

import {emailAddress,otpDigest} from './email-otp';

@Controller('api/v1')
class IdentityController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Get('dev/accounts') async devAccounts() {
    if (!development()) fail(404,'NOT_FOUND','Not found.');
    return this.db.account.findMany({where:{phone:{startsWith:'+91000000'},disabled:false},select:{id:true,name:true,role:true,verified:true},orderBy:{role:'asc'},take:50});
  }

  @Post('dev/session') async devSession(@Body() body: unknown,@Res({passthrough:true}) res: Response,@Req() req: Request) {
    if (!development()) fail(404,'NOT_FOUND','Not found.'); await this.service.limit(`dev:${req.ip}`,30);
    const {accountId} = parse(z.object({accountId:uuid}).strict(),body);
    const account = await this.db.account.findUnique({where:{id:accountId}});
    if (!account || !account.phone?.startsWith('+91000000') || account.disabled) fail(404,'NOT_FOUND','Synthetic account not found.');
    return this.service.session(account,res);
  }

  @Post('auth/otp/request') async otpRequest(@Body() body: unknown,@Req() req: Request) {
    const {email,locale}=parse(z.object({email:emailAddress,locale:z.enum(['en','hi']).default('en')}).strict(),body);
    await this.service.limit(`otp-ip:${req.ip}`,10);
    if(!development())fail(503,'PROVIDER_UNAVAILABLE','Authentication is not qualified for live mode.');
    const key=req.get('Idempotency-Key')||randomUUID();if(!key||key.length>128)fail(400,'IDEMPOTENCY_REQUIRED','A valid Idempotency-Key is required.');
    return requestOtp(this.service,email,locale,key);
  }

  @Post('auth/otp/verify') async otpVerify(@Body() body: unknown,@Req() req: Request,@Res({passthrough:true}) res: Response) {
    const {email,code,name}=parse(z.object({email:emailAddress,code:z.string().regex(/^\d{6}$/),name:text(80).optional()}).strict(),body);
    await this.service.limit(`verify:${req.ip}`,10);
    let digest:string;try{digest=otpDigest(email,code);}catch{fail(503,'AUTH_UNAVAILABLE','Authentication is temporarily unavailable. Please retry later.');}
    const result = await this.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email},0))`;
      const otp = await db.otp.findUnique({where:{address:email}});
      if (!otp || otp.expiresAt < new Date() || otp.attempts >= 5) return null;
      await db.otp.update({where:{address:email},data:{attempts:{increment:1}}});
      if (!same(otp.hash,digest)) return null;
      await db.otp.delete({where:{address:email}});
      const existing=await db.account.findUnique({where:{email}});
      if(!existing&&!name)return {registrationRequired:true} as const;
      const account=existing
        ? await db.account.update({where:{id:existing.id},data:{emailLocale:otp.locale}})
        : await db.account.create({data:{email,name:name!,emailLocale:otp.locale}});
      return {account,accountCreated:!existing};
    });
    if(result&&'registrationRequired' in result)fail(409,'REGISTRATION_REQUIRED','No account exists for this verified email. Create an account to continue.');
    if (!result || result.account.disabled) fail(401,'INVALID_OTP','The code is invalid or expired.');
    return {...await this.service.session(result.account,res),accountCreated:result.accountCreated};
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
      if(account.disabled||original.authVersion!==account.authVersion) return {error:true} as const;
      if(account.role==='STUDENT'&&!await this.service.activeStudent(db,account.id,true))return {error:true} as const;
      // Family lock serializes every generation, replay and logout with replacement insertion.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${original.familyId},0))`;
      const session=await db.session.findUniqueOrThrow({where:{id:original.id}});
      if(session.revoked || session.expiresAt<=new Date()) return {error:true} as const;
      if(privileged(account.role)&&(session.createdAt.getTime()<Date.now()-8*3600000||session.lastSeenAt.getTime()<Date.now()-900000))return {error:true} as const;
      if(!same(req.get('X-CSRF-Token')||'',session.csrf)) fail(403,'CSRF','Refresh token validation failed.');
      if(session.rotated) {await db.session.updateMany({where:{familyId:session.familyId},data:{revoked:true}});return {error:true} as const;}
      await db.session.update({where:{id:session.id},data:{rotated:true}});
      const state=await this.service.issueSession(account,session.familyId,db,session.expiresAt,{createdAt:session.createdAt,mfaVerifiedAt:session.mfaVerifiedAt,deviceLabel:session.deviceLabel});
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

  async issueInvitation(db:DB,actor:Account,req:HttpRequest,id:string,secret:string,expectedVersion?:number) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
    await this.service.guardian(db,actor.id);const child=await this.service.child(db,actor,id);
    if(child.studentAccountId)fail(409,'ALREADY_LINKED','Student access is already active. Authorize or manage its devices instead.');
    if(expectedVersion!==undefined&&child.version!==expectedVersion)fail(409,'CONFLICT','Learner access changed. Refresh before replacing the invitation.');
    await db.invitation.updateMany({where:{childId:id,usedAt:null,expiresAt:{gt:new Date()}},data:{expiresAt:new Date()}});
    const invite=await db.invitation.create({data:{childId:id,guardianId:actor.id,tokenHash:hash(secret),expiresAt:new Date(Date.now()+86_400_000)}});
    const updated=await db.child.update({where:{id},data:{version:{increment:1}}});
    await this.service.audit(db,actor,req,'STUDENT_INVITATION_ISSUED',id,'Guardian issued an invitation and invalidated earlier codes');
    return {expiresAt:invite.expiresAt.toISOString(),childVersion:updated.version};
  }
  @Get('children/:id/invitation') async invitationStatus(@Req() req:HttpRequest,@Param('id') id:string) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
    return this.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
      await this.service.guardian(db,actor.id);const child=await this.service.child(db,actor,id);
      const latest=await db.invitation.findFirst({where:{childId:id},orderBy:{expiresAt:'desc'}});
      return {state:child.studentAccountId?'ACTIVATED':!latest?'NONE':latest.usedAt||latest.expiresAt<=new Date()?'EXPIRED':'ACTIVE',expiresAt:latest?.expiresAt.toISOString()||null,childVersion:child.version};
    });
  }
  @Post('children/:id/invitation-replacements') async replaceInvitation(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);
    const data=parse(z.object({expectedVersion:version,acknowledged:z.literal(true)}).strict(),body);
    await this.service.guardian(this.db,actor.id);await this.service.child(this.db,actor,id);
    // Replay confirms issuance without persisting or returning a recoverable code.
    let secret:string|null=null;
    const result=await this.service.once(req,actor,'invitation.replace',data,async db=>{
      secret=token();return this.issueInvitation(db,actor,req,id,secret,data.expectedVersion);
    });
    return {...result,status:secret?'ISSUED':'CODE_UNAVAILABLE',token:secret};
  }
  @Post('children/:id/invitations') async invitation(@Req() req: HttpRequest,@Param('id') id: string) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']),secret=token();
    const result=await this.db.$transaction(db=>this.issueInvitation(db,actor,req,id,secret));
    return {token:secret,expiresAt:result.expiresAt};
  }

  @Post('invitations/activate') async activate(@Req() req: HttpRequest,@Body() body: unknown,@Res({passthrough:true}) res: Response) {
    const guardian=await this.service.actor(req,['GUARDIAN']);const {token:secret}=parse(z.object({token:text(100)}).strict(),body);
    const account=await this.db.$transaction(async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guardian.id},0))`;
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
