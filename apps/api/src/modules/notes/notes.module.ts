import {pageQuery,pageBefore,pageResult} from '../../pagination';
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
class NotesController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {return this.service.db;}
  @Post('notes') async note(@Req() req: HttpRequest,@Body() body: unknown) {
    const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({childId:uuid,text:text(5000)}).strict(),body);
    return this.service.once(req,actor,'note.create',data,async db=>{await this.service.guardian(db,actor.id);await this.service.child(db,actor,data.childId);return db.note.create({data:{...data,guardianId:actor.id}});});
  }

  @Post('notes/:id/updates') async update(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({expectedVersion:version,text:text(5000)}).strict(),body);
    return this.service.once(req,actor,'note.update',data,async db=>{await this.service.guardian(db,actor.id);const note=await db.note.findUnique({where:{id}});if(!note||note.guardianId!==actor.id)fail(404,'NOT_FOUND','Note not found.');const changed=await db.note.updateMany({where:{id,version:data.expectedVersion},data:{text:data.text,sharedTeacherId:null,acknowledgedAt:null,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Note changed. Refresh before saving edits.');await this.service.audit(db,actor,req,'NOTE_UPDATED_PRIVATE',id,'Guardian saved edits and withdrew previous sharing');return db.note.findUniqueOrThrow({where:{id}});});
  }

  @Post('notes/:id/shares') async share(@Req() req: HttpRequest,@Param('id') id: string,@Body() body: unknown) {
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({teacherId:uuid.nullable(),expectedVersion:version}).strict(),body);
    return this.service.once(req,actor,'note.share',data,async db=>{
      await this.service.guardian(db,actor.id);const note=await db.note.findUnique({where:{id}});
      if (!note || note.guardianId!==actor.id) fail(404,'NOT_FOUND','Note not found.');
      if (data.teacherId) {
        const p=await db.placement.findFirst({where:{guardianId:actor.id,childId:note.childId,teacherId:data.teacherId,status:'ACTIVE'}});
        const teacher=await db.teacher.findUnique({where:{id:data.teacherId}});
        if (!p || teacher?.status!=='APPROVED') fail(403,'SHARING_FORBIDDEN','Sharing requires an active placement with this teacher.');
      }
      const changed=await db.note.updateMany({where:{id,version:data.expectedVersion},data:{sharedTeacherId:data.teacherId,acknowledgedAt:null,version:{increment:1}}});
      if (!changed.count) fail(409,'CONFLICT','Note has changed.');
      await this.service.audit(db,actor,req,data.teacherId?'NOTE_SHARED':'NOTE_REVOKED',id,'Guardian sharing decision');return db.note.findUniqueOrThrow({where:{id}});
    });
  }

  @Post('notes/:id/acknowledgements') async acknowledge(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']),data=parse(z.object({expectedVersion:version}).strict(),body);
    return this.service.once(req,actor,'note.acknowledge',data,async db=>{const teacher=await db.teacher.findUniqueOrThrow({where:{accountId:actor.id}}),note=await db.note.findUnique({where:{id}});if(!note||note.sharedTeacherId!==teacher.id||teacher.status!=='APPROVED')fail(404,'NOT_FOUND','Shared note not found.');await this.service.guardian(db,note.guardianId);if(!await db.placement.findFirst({where:{guardianId:note.guardianId,childId:note.childId,teacherId:teacher.id,status:'ACTIVE'}}))fail(404,'NOT_FOUND','Shared note not found.');const changed=await db.note.updateMany({where:{id,version:data.expectedVersion,acknowledgedAt:null},data:{acknowledgedAt:new Date(),version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Sharing changed or was acknowledged.');await this.service.audit(db,actor,req,'NOTE_SHARING_ACKNOWLEDGED',id,'Named teacher acknowledged the current shared note');return db.note.findUniqueOrThrow({where:{id},select:{id:true,acknowledgedAt:true,version:true}});});
  }

  @Get('notes') async notes(@Req() req: Request,@Query() query:unknown) {
    const actor=await this.service.actor(req,['GUARDIAN','TEACHER']);
    const data=parse(pageQuery,query);
    let where:Prisma.NoteWhereInput={guardianId:actor.id};
    if(actor.role!=='GUARDIAN') {
      const teacher=await this.db.teacher.findUnique({where:{accountId:actor.id}});if(!teacher||teacher.status!=='APPROVED')return {items:[],nextCursor:null};
      const placements=await this.db.placement.findMany({where:{teacherId:teacher.id,status:'ACTIVE'}});
      const guardians=await this.db.account.findMany({where:{id:{in:placements.map(p=>p.guardianId)},verified:true,disabled:false,role:'GUARDIAN'},select:{id:true}});
      const consents=await this.db.consent.findMany({where:{guardianId:{in:guardians.map(g=>g.id)},withdrawnAt:null}});
      const paused=await this.db.privacyRequest.findMany({where:{accountId:{in:guardians.map(g=>g.id)},kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'},select:{accountId:true}});
      where={sharedTeacherId:teacher.id,childId:{in:placements.filter(p=>consents.some(c=>c.guardianId===p.guardianId)&&!paused.some(g=>g.accountId===p.guardianId)).map(p=>p.childId)}};
    }
    const anchor=data.cursor?await this.db.note.findFirst({where:{...where,id:data.cursor},select:{id:true,createdAt:true}}):null;
    if(data.cursor&&!anchor)fail(404,'NOT_FOUND','Note cursor is unavailable.');
    const page=pageResult(await this.db.note.findMany({where:{...where,...pageBefore(anchor)},orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),data.limit),notes=page.items,records=[];
    for(const note of notes){
      const {guardianId,...record}=note,learner=await this.db.child.findUniqueOrThrow({where:{id:note.childId},select:{alias:true,grade:true,board:true}}),profile=note.sharedTeacherId?await this.db.teacher.findUnique({where:{id:note.sharedTeacherId},select:{id:true,name:true,status:true,accountId:true}}):null;
      let sharingActive=actor.role==='TEACHER';
      if(actor.role==='GUARDIAN'&&profile?.status==='APPROVED'){
        const consent=await this.db.consent.findUnique({where:{guardianId}}),teacherAccount=await this.db.account.findUnique({where:{id:profile.accountId}}),placement=await this.db.placement.findFirst({where:{guardianId,childId:note.childId,teacherId:profile.id,status:'ACTIVE'}}),paused=await this.db.privacyRequest.findFirst({where:{accountId:guardianId,kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'}});
        sharingActive=actor.verified&&!!consent&&!consent.withdrawnAt&&!paused&&!!placement&&!!teacherAccount&&!teacherAccount.disabled;
      }
      records.push({...record,learner,sharedTeacher:profile?{id:profile.id,name:profile.name}:null,sharingActive});
    }
    return {items:records,nextCursor:page.nextCursor};
  }

}
@Module({imports:[PersistenceModule],controllers:[NotesController]})
export class NotesModule {}
