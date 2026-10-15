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

import {schoolSubjects} from '../teachers/details';
import {matched} from '../matching/eligibility';
import {preferenceSchema,preferenceUpdateSchema,normalizedPreferences} from './request-schedule';
import {AppService,PersistenceModule,hash,token,uuid,version,text,fail,parse,same,development,HttpRequest,DB} from '../../shared';

export const intakeSchema=z.object({schoolName:text(160).optional(),schoolSubjects:schoolSubjects.optional(),discoveryMethod:z.enum(['MANUAL','ASSISTED']).default('ASSISTED'),preferredTeacherId:uuid.optional(),childId:uuid.optional(),alias:text(40),grade:z.number().int().min(6).max(10),board:z.enum(['CBSE','CGBSE']),subject:z.enum(['Maths','Science']),mode:z.enum(['ONLINE','HOME']),language:z.enum(['English','Hindi']),locality:text(80),budgetPaise:z.number().int().min(50_000).max(2_000_000),schedule:text(300),preferences:preferenceSchema.optional()}).strict();
export async function createIntake(db:DB,service:AppService,account:Account,req:HttpRequest,data:z.infer<typeof intakeSchema>) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${account.id},0))`;
      await service.guardian(db,account.id);
      if(data.discoveryMethod==='MANUAL'?!data.preferredTeacherId:!!data.preferredTeacherId)fail(400,'INVALID_DISCOVERY_PATH','Direct search requires a chosen teacher; assisted search uses the eligible pool.');
      const region=await db.region.findUnique({where:{id:account.region}});if(!region?.enabled)fail(409,'UNSUPPORTED_REGION','This city is not enabled; use the unsupported-scope waitlist.');
      const preferences=data.preferences?normalizedPreferences(data.preferences):null;if(data.preferences&&!preferences)fail(400,'INVALID_SCHEDULE','Choose nonoverlapping weekly time ranges of at least 20 minutes, or dated 20–120 minute windows between one hour and 60 days ahead.');
      if(data.preferredTeacherId&&!((await service.publicTeachers({id:data.preferredTeacherId},1))[0]))fail(404,'NOT_FOUND','Selected teacher is unavailable.');
      if(!data.childId&&(!data.schoolName||!data.schoolSubjects))fail(400,'LEARNER_DETAILS_REQUIRED','Enter the school and subjects studied in the class.');
      const child=data.childId?await service.child(db,account,data.childId):await db.child.create({data:{guardianId:account.id,alias:data.alias,grade:data.grade,board:data.board,schoolName:data.schoolName,schoolSubjects:data.schoolSubjects}});
      if(child.grade!==data.grade||child.board!==data.board)fail(409,"CHILD_CHANGED","The linked learner grade or board differs from this request.");
      if(data.childId&&(data.schoolName||data.schoolSubjects)){
       if(!data.schoolName||!data.schoolSubjects)fail(400,'LEARNER_DETAILS_REQUIRED','Supply both school and class subjects.');
       if(child.schoolName&&(child.schoolName!==data.schoolName||JSON.stringify(child.schoolSubjects)!==JSON.stringify(data.schoolSubjects)))fail(409,'CHILD_CHANGED','The learner school details changed; review the current record.');
       if(!child.schoolName)await db.child.update({where:{id:child.id},data:{schoolName:data.schoolName,schoolSubjects:data.schoolSubjects,version:{increment:1}}});
      }
      const request=await db.tuitionRequest.create({data:{discoveryMethod:data.discoveryMethod,preferredTeacherId:data.preferredTeacherId,region:account.region,...(preferences?{schedulePreferences:preferences,scheduleStatus:'CONFIRMED'}:{}),guardianId:account.id,childId:child.id,subject:data.subject,mode:data.mode,language:data.language,locality:data.locality,budgetPaise:data.budgetPaise,schedule:data.schedule}});
      await service.audit(db,account,req,'REQUEST_CREATED',request.id,'Guardian submitted supported tuition need',undefined,{region:request.region,scheduleStatus:request.scheduleStatus});await service.event(db,'request.created',request.id);return request;
}

@Controller('api/v1')
class RequestsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('requests') async createRequest(@Req() req: HttpRequest,@Body() body: unknown) {
    const account=await this.service.actor(req,['GUARDIAN']);
    const data=parse(intakeSchema,body);
    return this.service.once(req,account,'request.create',data,async db=>{
      return createIntake(db,this.service,account,req,data);
    });
  }

  @Post('requests/:id/schedules') async schedule(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(preferenceUpdateSchema,body);const preferences=normalizedPreferences(data);if(!preferences)fail(400,'INVALID_SCHEDULE','Choose valid nonoverlapping weekly ranges, or future dated windows.');
    return this.service.once(req,actor,'request.schedule',data,async db=>{await this.service.guardian(db,actor.id);const request=await db.tuitionRequest.findUnique({where:{id}});if(!request||request.guardianId!==actor.id)fail(404,'NOT_FOUND','Request not found.');const changed=await db.tuitionRequest.updateMany({where:{id,version:data.expectedVersion,status:'OPEN'},data:{schedulePreferences:preferences,scheduleStatus:'CONFIRMED',matchStatus:'PENDING',selectedCandidateId:null,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Request changed or is not open.');await db.recommendation.updateMany({where:{requestId:id},data:{presentedAt:null,expiresAt:new Date(),version:{increment:1}}});await this.service.audit(db,actor,req,'REQUEST_SCHEDULE_CONFIRMED',id,'Guardian confirmed structured schedule',undefined,{timezone:preferences.timezone,windows:"weekly" in preferences?preferences.weekly!.length:preferences.slots!.length});await this.service.event(db,'request.schedule_confirmed',id,data.expectedVersion+1);return db.tuitionRequest.findUniqueOrThrow({where:{id}});});
  }
  @Post('waitlist') async waitlist(@Req() req:HttpRequest,@Body() body:unknown){
    const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({grade:z.number().int().min(1).max(12),board:text(30),subject:text(40),language:text(30),mode:z.enum(['HOME','ONLINE']),region:text(80)}).strict(),body);
    return this.service.once(req,actor,'waitlist.create',data,async db=>{await this.service.guardian(db,actor.id);const region=await db.region.findUnique({where:{id:data.region}});if(region?.enabled&&data.grade>=6&&data.grade<=10&&['CBSE','CGBSE'].includes(data.board)&&['Maths','Science'].includes(data.subject)&&['English','Hindi'].includes(data.language))fail(409,'SUPPORTED_SCOPE','Use ordinary free tuition intake for supported scope.');const entry=await db.waitlist.create({data:{...data,guardianId:actor.id}});await this.service.audit(db,actor,req,'WAITLIST_CREATED',entry.id,'Guardian requested unsupported scope without a child record');return entry;});
  }
  @Get('waitlist') async listWaitlist(@Req() req:HttpRequest){const actor=await this.service.actor(req,['GUARDIAN']);return {items:await this.service.db.waitlist.findMany({where:{guardianId:actor.id},orderBy:{createdAt:'desc'},take:50})};}

  @Get('requests') async requests(@Req() req: Request) {
    const account=await this.service.actor(req,['GUARDIAN','ADMIN','OPERATOR']);
    return {items:await this.db.tuitionRequest.findMany({where:account.role==='GUARDIAN'?{guardianId:account.id}:account.role==='OPERATOR'?{region:account.region}:{},orderBy:{createdAt:'desc'},take:50})};
  }

  @Get('requests/:id') async request(@Req() req: Request,@Param('id') id: string) {
    parse(uuid,id);const account=await this.service.actor(req,['GUARDIAN','ADMIN','OPERATOR']);
    const request=await this.db.tuitionRequest.findUnique({where:{id}});
    if (!request || (account.role==='GUARDIAN' && request.guardianId!==account.id) || (account.role==='OPERATOR'&&request?.region!==account.region)) fail(404,'NOT_FOUND','Request not found.');
    const child=await this.db.child.findUniqueOrThrow({where:{id:request.childId}}),candidates=[];
    const consent=await this.db.consent.findUnique({where:{guardianId:request.guardianId}});
    if(request.status==='OPEN'&&consent&&!consent.withdrawnAt)for(const candidate of await this.db.recommendation.findMany({where:{requestId:id,presentedAt:{not:null},expiresAt:{gt:new Date()}},orderBy:{position:'asc'}})){const teacher=await this.db.teacher.findUniqueOrThrow({where:{id:candidate.teacherId}});if(await matched(this.db,request,child,teacher))candidates.push(candidate);}
    return {...request,candidates};
  }

}
@Module({imports:[PersistenceModule],controllers:[RequestsController]})
export class RequestsModule {}
