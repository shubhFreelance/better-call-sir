import {sponsoredTeachers} from '../promotions/delivery';
import {placement} from '../promotions/policy';
import {coverageQuery,coverageWhere,scopeFilter,learnerScope} from '../../coverage';
import {learningAuthority} from '../learners/learning-management';
import {requireLearningSpace} from '../learners/learning-spaces';
import {studentContext} from '../requests/student-enquiries.module';
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
  async learnerAcademic(req:HttpRequest,id:string,subject?:string,space=false){
    const actor=await this.service.actor(req,['GUARDIAN','STUDENT','INDEPENDENT_STUDENT']);
    return this.db.$transaction(async db=>{
      let learner,spaceLanguage:string|undefined;
      if(actor.role==='INDEPENDENT_STUDENT'){
        if(id!==actor.id)fail(404,'NOT_FOUND','Learner unavailable.');
        const context=await studentContext(db,actor.id);if(context.gate!=='READY')fail(403,'LEARNER_DETAILS_REQUIRED','Complete your learning setup before choosing a teacher.');
        if(space&&(!subject||!context.subjects.some(s=>s.toLowerCase()===subject.toLowerCase())))fail(409,'LEARNING_SPACE_REQUIRED','Select a subject from your learning profile.');
        const e=context.educationScope;learner={educationStage:e.stage,grade:'grade' in e?e.grade??null:null,board:'board' in e?e.board??null:null,courseName:'courseName' in e?e.courseName:null,studyYear:'studyYear' in e?e.studyYear:null};
      }else {learner=await learningAuthority(db,this.service,actor,id);const preference=await requireLearningSpace(db,learner,subject);if(space)spaceLanguage=preference.language;}
      const academic=learnerScope(learner,subject);if(!academic)fail(409,'LEARNER_DETAILS_REQUIRED','Complete the learner education profile before requesting a teacher.');
      return space?{AND:[coverageWhere(academic),...(spaceLanguage?[{languages:{has:spaceLanguage}}]:[]),{OR:[{modes:{has:"ONLINE"}},{region:actor.region,travelAccepted:true}]}]}:coverageWhere(academic);
    });
  }
  @Get('health/live') live() {return {status:'ok'};}

  @Get('health/ready') async ready() {await this.db.$queryRaw`SELECT 1`; return {status:'ready',mode:development()?'synthetic-development':'production'};}

  @Get('catalog') catalog() {return {city:'Raipur',subjects:['Maths','Science','English','Hindi','Physics','Chemistry','Biology','Economics','Statistics','Computer Science','Language','Numbers'],boards:['CBSE','CGBSE'],grades:[1,2,3,4,5,6,7,8,9,10,11,12],educationStages:['EARLY_YEARS','SCHOOL','COLLEGE'],earlyYearsLevels:['NURSERY','KG1','KG2'],studyYears:[1,2,3,4,5,6,7,8,9,10],customSubjects:true,customBoards:true,customCourses:true,languages:['English','Hindi'],modes:['ONLINE','HOME'],localities:['Shankar Nagar','Avanti Vihar','Telibandha','Civil Lines','Mowa'],timezone:'Asia/Kolkata'};}

  @Get('sponsored-teachers') async sponsored(@Query() query:unknown,@Req() req:HttpRequest) {return this.teachers(query,req,true);}

  @Get('teachers') async teachers(@Query() query:unknown,@Req() req:HttpRequest,sponsoredOnly=false) {
    const data=parse(z.object({promotionPlacement:placement.optional(),learnerId:uuid.optional(),q:z.string().trim().max(100).optional(),...coverageQuery.shape,mode:z.preprocess(v=>v===''?undefined:v,z.enum(['HOME','ONLINE']).optional()),language:z.enum(['English','Hindi']).optional(),locality:z.string().trim().min(1).max(80).optional(),maxMonthlyPaise:z.coerce.number().int().min(50000).max(2000000).optional(),limit:z.coerce.number().int().min(1).max(50).default(50),cursor:uuid.optional()}).strict(),query);
    if(sponsoredOnly&&!data.promotionPlacement)fail(400,'VALIDATION','Choose a promotion placement.');
    if(data.promotionPlacement==='SPACE'&&(!data.learnerId||!data.subject))fail(400,'LEARNING_SPACE_REQUIRED','Select a learner and subject space for sponsored recommendations.');
    let academic:Prisma.TeacherWhereInput;if(data.learnerId)academic=await this.learnerAcademic(req,data.learnerId,data.subject,data.promotionPlacement==='SPACE');else try{academic=coverageWhere(data);}catch{fail(400,'INVALID_EDUCATION_FILTER','Use criteria from one education stage.');}
    const where:Prisma.TeacherWhereInput={AND:[academic!],...(data.mode?{modes:{has:data.mode}}:{}),...(data.q?{OR:[{name:{contains:data.q,mode:'insensitive'}},{headline:{contains:data.q,mode:'insensitive'}},{bio:{contains:data.q,mode:'insensitive'}},coverageWhere({subject:data.q})]}:{})};
    Object.assign(where,{...(data.language?{languages:{has:data.language}}:{}),...(data.locality?{localities:{has:data.locality},travelAccepted:true}:{}),...(data.maxMonthlyPaise?{monthlyPaise:{lte:data.maxMonthlyPaise}}:{})});
    if(sponsoredOnly)return {items:await sponsoredTeachers(this.service,data.promotionPlacement!,where)};
    const rows=await this.service.publicTeachers(where,data.limit+1,data.cursor);
    const sponsored=data.promotionPlacement?await sponsoredTeachers(this.service,data.promotionPlacement,where):undefined;
    return {...(sponsored?{sponsored}:{}),items:rows.slice(0,data.limit),nextCursor:rows.length>data.limit?rows[data.limit-1].id:null};
  }

  @Get('teachers/:slug') async teacher(@Param('slug') slug: string,@Query() query:unknown,@Req() req:HttpRequest) {
    const data=parse(z.object({learnerId:uuid.optional(),subject:coverageQuery.shape.subject}).strict(),query);
    const academic=data.learnerId?await this.learnerAcademic(req,data.learnerId,data.subject):{};
    const profile = (await this.service.publicTeachers({AND:[{slug},academic]},1))[0];
    if (!profile) fail(404,'NOT_FOUND','Teacher profile is unavailable.'); return profile;
  }

}
@Module({imports:[PersistenceModule],controllers:[CatalogController]})
export class CatalogModule {}
