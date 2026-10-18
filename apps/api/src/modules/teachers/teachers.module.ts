import {pageQuery,pageResult} from '../../pagination';
import {subjectSchema,boardSchema,teachingScopes,coverageProfile,declaredScopes} from '../../coverage';
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

import {detailsShape} from './details';
import {reviewed} from '../verification/verification.module';
import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,HttpRequest,DB} from '../../shared';

export const applicationSchema=z.object({...detailsShape,name:text(80),headline:text(120),bio:text(1500),teachingCoverage:teachingScopes.optional(),subjects:z.array(subjectSchema).min(1).max(40),boards:z.array(boardSchema).max(20),grades:z.array(z.number().int().min(1).max(12)).max(12),languages:z.array(z.enum(['English','Hindi'])).min(1).max(2),modes:z.array(z.enum(['ONLINE','HOME'])).min(1).max(2),localities:z.array(text(80)).max(20),monthlyPaise:z.number().int().min(50_000).max(2_000_000),experience:z.number().int().min(0).max(60),consultationOptIn:z.boolean(),feeTermsAccepted:z.literal(true)}).strict();
export async function submitTeacher(db:DB,service:AppService,account:Account,data:z.infer<typeof applicationSchema>) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
  const current=await db.account.findUniqueOrThrow({where:{id:account.id}});
  if(current.disabled||!['GUARDIAN','TEACHER'].includes(current.role))fail(403,'FORBIDDEN','This account cannot submit a teacher application.');
  const {feeTermsAccepted,...declared}=data;
  if(!declaredScopes(declared).length)fail(400,'INVALID_COVERAGE','Declare at least one valid teaching scope, up to 200 combinations.');const profile=coverageProfile(declared);
      const existing=await db.teacher.findUnique({where:{accountId:account.id}});
      if (existing) fail(409,'EXISTING_APPLICATION','Your application is already saved.');
      const teacher=await db.teacher.create({data:{...profile,accountId:account.id,feeTermsAcceptedAt:new Date(),region:account.region,slug:`${profile.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${randomBytes(3).toString('hex')}`}});
      await db.account.update({where:{id:account.id},data:{role:'TEACHER'}});
      await service.event(db,'teacher.submitted',teacher.id);return teacher;
}

export async function reviseTeacher(db:DB,service:AppService,actor:Account,req:HttpRequest,id:string,data:z.infer<typeof applicationSchema>&{expectedVersion:number}) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
  const teacher=await db.teacher.findUnique({where:{id}});if(!teacher||teacher.accountId!==actor.id)fail(404,'NOT_FOUND','Application not found.');
  if(teacher.teachingCoverage&&!data.teachingCoverage)fail(400,'COVERAGE_REQUIRED','Retain explicit teaching scopes when revising this application.');
  if(teacher.version!==data.expectedVersion)fail(409,'CONFLICT','Application changed. Reload it before resubmitting.');
  const {expectedVersion,feeTermsAccepted,...declared}=data;
  if(!declaredScopes(declared).length)fail(400,'INVALID_COVERAGE','Declare valid teaching coverage.');const profile=coverageProfile(declared);
  const updated=await db.teacher.update({where:{id},data:{...profile,feeTermsAcceptedAt:new Date(),status:'SUBMITTED',screeningComplete:false,screeningValidUntil:null,profileRevision:{increment:1},version:{increment:1}}});
  await db.onboardingProgress.updateMany({where:{accountId:actor.id,kind:'TEACHER_REVISION'},data:{draft:{},version:{increment:1}}});
  await db.note.updateMany({where:{sharedTeacherId:id},data:{sharedTeacherId:null}});
  await service.audit(db,actor,req,'TEACHER_REVIEW_REOPENED',id,'Material profile resubmission',undefined,{profileRevision:updated.profileRevision});await service.event(db,'teacher.review_reopened',id,updated.version);return updated;
}

@Controller('api/v1')
class TeachersController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('teacher-applications') async application(@Req() req: HttpRequest,@Body() body: unknown) {
    const account=await this.service.actor(req,['GUARDIAN','TEACHER']);
    const data=parse(applicationSchema,body);
    return this.service.once(req,account,'teacher.apply',data,async db=>{
      return submitTeacher(db,this.service,account,data);
    });
  }

  @Post('teacher-applications/:id/revisions') async revise(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);
    const data=parse(applicationSchema.extend({expectedVersion:version}),body);
    return this.service.once(req,actor,'teacher.revise',data,async db=>{
      return reviseTeacher(db,this.service,actor,req,id,data);
    });
  }

  async revisionDraft(db:DB,actor:Account,id:string) {
    const teacher=await db.teacher.findUnique({where:{id}});if(!teacher||teacher.accountId!==actor.id)fail(404,'NOT_FOUND','Application not found.');
    const progress=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:actor.id,kind:'TEACHER_REVISION'}}});
    const saved=progress?.draft as {profile?:unknown;applicationVersion?:number}|undefined;
    return {draft:saved?.profile||{},version:progress?.version||0,applicationVersion:saved?.applicationVersion||teacher.version,stale:!!saved?.applicationVersion&&saved.applicationVersion!==teacher.version};
  }
  @Get('teacher-applications/:id/revision-draft') async getRevisionDraft(@Req() req:HttpRequest,@Param('id') id:string) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);return this.db.$transaction(db=>this.revisionDraft(db,actor,id));
  }
  @Post('teacher-applications/:id/revision-drafts') async saveRevisionDraft(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);
    const data=parse(z.object({expectedVersion:z.number().int().nonnegative(),expectedApplicationVersion:version,draft:applicationSchema.omit({feeTermsAccepted:true}).partial()}).strict(),body);
    return this.service.once(req,actor,'teacher.revision_draft.save',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const current=await this.revisionDraft(db,actor,id);
      const teacher=await db.teacher.findUniqueOrThrow({where:{id}});
      if(current.version!==data.expectedVersion||teacher.version!==data.expectedApplicationVersion||current.stale)fail(409,'CONFLICT','The application or saved revision changed. Reload before editing.');
      const draft={applicationVersion:teacher.version,profile:data.draft};
      await db.onboardingProgress.upsert({where:{accountId_kind:{accountId:actor.id,kind:'TEACHER_REVISION'}},create:{accountId:actor.id,kind:'TEACHER_REVISION',draft},update:{draft,version:{increment:1}}});
      await this.service.audit(db,actor,req,'TEACHER_REVISION_DRAFT_SAVED',id,'Owner saved private revision progress');
      return this.revisionDraft(db,actor,id);
    });
  }
  @Post('teacher-applications/:id/revision-draft-discards') async discardRevisionDraft(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);
    const data=parse(z.object({expectedVersion:version,expectedApplicationVersion:version,acknowledged:z.literal(true)}).strict(),body);
    return this.service.once(req,actor,'teacher.revision_draft.discard',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const current=await this.revisionDraft(db,actor,id),teacher=await db.teacher.findUniqueOrThrow({where:{id}});
      if(current.version!==data.expectedVersion||teacher.version!==data.expectedApplicationVersion)fail(409,'CONFLICT','The application or saved revision changed. Reload before discarding.');
      const changed=await db.onboardingProgress.updateMany({where:{accountId:actor.id,kind:'TEACHER_REVISION',version:data.expectedVersion},data:{draft:{},version:{increment:1}}});
      if(!changed.count)fail(409,'CONFLICT','There is no current saved revision to discard.');
      await this.service.audit(db,actor,req,'TEACHER_REVISION_DRAFT_DISCARDED',id,'Owner explicitly discarded revision progress');
      return this.revisionDraft(db,actor,id);
    });
  }
  @Post('teacher-applications/:id/revision-draft-submissions') async submitRevisionDraft(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);
    const data=parse(z.object({expectedVersion:version,expectedApplicationVersion:version,feeTermsAccepted:z.literal(true)}).strict(),body);
    return this.service.once(req,actor,'teacher.revision_draft.submit',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const current=await this.revisionDraft(db,actor,id);
      if(current.version!==data.expectedVersion||current.applicationVersion!==data.expectedApplicationVersion||current.stale)fail(409,'CONFLICT','The application or saved revision changed. Reload before resubmitting.');
      return reviseTeacher(db,this.service,actor,req,id,{...parse(applicationSchema,{...current.draft,feeTermsAccepted:true}),expectedVersion:data.expectedApplicationVersion});
    });
  }

  @Get('admin/teachers') async adminTeachers(@Req() req: Request,@Query() query:unknown) {
    const actor=await this.service.actor(req,['ADMIN','REVIEWER']),data=parse(pageQuery.extend({status:z.enum(['SUBMITTED','APPROVED','CHANGES_REQUESTED','SUSPENDED']).optional()}),query),where={...(actor.role==='ADMIN'?{}:{region:actor.region}),...(data.status?{status:data.status}:{})};
    if(data.cursor&&!await this.db.teacher.count({where:{...where,id:data.cursor}}))fail(404,'NOT_FOUND','Teacher cursor is unavailable.');
    return pageResult(await this.db.teacher.findMany({where:{...where,...(data.cursor?{id:{gt:data.cursor}}:{})},orderBy:{id:'asc'},take:data.limit+1}),data.limit);
  }

  @Post('admin/teachers/:id/reviews') async review(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','REVIEWER']);
    const data=parse(z.object({expectedVersion:version,status:z.enum(['APPROVED','CHANGES_REQUESTED','SUSPENDED']),reason:text(500)}).strict(),body);
    return this.service.once(req,actor,'teacher.review',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const before=await db.teacher.findUnique({where:{id}});
      if (!before || (actor.role!=='ADMIN'&&before.region!==actor.region)) fail(404,'NOT_FOUND','Teacher not found.');
      if (before.accountId===actor.id) fail(403,'SELF_REVIEW','You cannot review your own application.');
      const validUntil=data.status==='APPROVED'?await reviewed(db,before):null;
      if (data.status==='APPROVED' && (!validUntil || !before.feeTermsAcceptedAt)) fail(409,'SCREENING_REQUIRED','Current identity, qualification, capability and reference checks with clean evidence and accepted fee terms are required.');
      if(data.status==='APPROVED'&&!z.object(detailsShape).safeParse({address:before.address,education:before.education,employment:before.employment,demoOptIn:before.demoOptIn}).success)fail(409,'PROFILE_DETAILS_REQUIRED','Complete the private address, education, work history and demo preference before approval.');
      const changed=await db.teacher.updateMany({where:{id,version:data.expectedVersion},data:{status:data.status,screeningComplete:data.status==='APPROVED',screeningValidUntil:validUntil,version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','The application has changed.');
      if (data.status==='SUSPENDED') {
        await db.note.updateMany({where:{sharedTeacherId:id},data:{sharedTeacherId:null}});
        const bookings=await db.reservation.findMany({where:{teacherId:id,status:'CONFIRMED',endsAt:{gt:new Date()}},select:{id:true}});
        const paid=await db.payment.findMany({where:{reservationId:{in:bookings.map(b=>b.id)}},select:{reservationId:true}});
        if (paid.length) {
          const support=await db.supportCase.create({data:{accountId:actor.id,region:before.region,category:'PAID_BOOKING_REVIEW',description:`Suspended teacher ${id}; ${paid.length} paid confirmed bookings require review. First 50 booking IDs: ${paid.slice(0,50).map(p=>p.reservationId).join(',')}`}});
          await this.service.audit(db,actor,req,'SUSPENDED_TEACHER_BOOKINGS_FLAGGED',support.id,data.reason,undefined,{teacherId:id,bookingCount:paid.length});
          await this.service.event(db,'support.booking_review_requested',support.id);
        }
      }
      await this.service.audit(db,actor,req,'TEACHER_REVIEW',id,data.reason,{status:before.status},{status:data.status});return db.teacher.findUniqueOrThrow({where:{id}});
    });
  }

}
@Module({imports:[PersistenceModule],controllers:[TeachersController]})
export class TeachersModule {}
