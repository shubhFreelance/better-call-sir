import {Module,Controller,Get,Post,Param,Query,Req,Body,Inject} from '@nestjs/common';
import type {Child} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,uuid,parse,fail,text} from '../../shared';
import {schoolSubjects} from '../teachers/details';
const common={institutionName:text(160),subjects:schoolSubjects};
export const learnerEducation=z.discriminatedUnion('stage',[
 z.object({...common,stage:z.literal('EARLY_YEARS'),level:z.enum(['NURSERY','KG1','KG2'])}).strict(),
 z.object({...common,stage:z.literal('SCHOOL'),grade:z.number().int().min(1).max(12),board:text(80).transform(v=>v.toUpperCase())}).strict(),
 z.object({...common,stage:z.literal('COLLEGE'),courseName:text(160),university:text(160),studyYear:z.number().int().min(1).max(10)}).strict(),
]);
const profileInput=z.object({alias:text(40),education:learnerEducation}).strict();
const profileSelect={id:true,alias:true,educationStage:true,earlyYearsLevel:true,grade:true,board:true,schoolName:true,schoolSubjects:true,courseName:true,university:true,studyYear:true,version:true} as const;
export function learnerProjection(c:Pick<Child,keyof typeof profileSelect>) {
 const education={stage:c.educationStage,institutionName:c.schoolName,subjects:c.schoolSubjects,...(c.educationStage==='SCHOOL'?{grade:c.grade,board:c.board}:c.educationStage==='EARLY_YEARS'?{level:c.earlyYearsLevel}:{courseName:c.courseName,university:c.university,studyYear:c.studyYear})};
 return {id:c.id,alias:c.alias,education,version:c.version,enquiryEligible:c.educationStage==='SCHOOL'&&c.grade!==null&&c.grade>=6&&c.grade<=10&&['CBSE','CGBSE'].includes(c.board||'')&&!!c.schoolName&&c.schoolSubjects.length>0};
}
@Controller('api/v1')
class LearnersController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Post('learner-profiles') async create(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['GUARDIAN']),data=parse(profileInput,body);
  return this.service.once(req,actor,'learner.create',data,async db=>{
   await this.service.guardian(db,actor.id);
   const e=data.education;
   const child=await db.child.create({data:{guardianId:actor.id,alias:data.alias,educationStage:e.stage,schoolName:e.institutionName,schoolSubjects:e.subjects,grade:e.stage==='SCHOOL'?e.grade:null,board:e.stage==='SCHOOL'?e.board:null,earlyYearsLevel:e.stage==='EARLY_YEARS'?e.level:null,courseName:e.stage==='COLLEGE'?e.courseName:null,university:e.stage==='COLLEGE'?e.university:null,studyYear:e.stage==='COLLEGE'?e.studyYear:null}});
   await this.service.audit(db,actor,req,'LEARNER_PROFILE_CREATED',child.id,'Guardian saved learner education profile');
   return learnerProjection(child);
  });
 }
 @Get('learner-profiles') async list(@Req() req:HttpRequest,@Query() input:unknown){
  const actor=await this.service.actor(req,['GUARDIAN','STUDENT']),data=parse(z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict(),input);
  const scope=actor.role==='GUARDIAN'?{guardianId:actor.id}:{studentAccountId:actor.id};
  return this.service.db.$transaction(async db=>{
   if(data.cursor&&!await db.child.count({where:{...scope,id:data.cursor}}))fail(404,'NOT_FOUND','Learner cursor is unavailable.');
   const consent=actor.role==='GUARDIAN'?await db.consent.findUnique({where:{guardianId:actor.id}}):null;
   const paused=actor.role==='GUARDIAN'?!!await db.privacyRequest.count({where:{accountId:actor.id,kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'}}):false;
   const creationStatus=actor.role==='STUDENT'?'READ_ONLY':!actor.verified?'VERIFICATION_REQUIRED':paused?'PRIVACY_PAUSED':!consent||consent.withdrawnAt?'CONSENT_REQUIRED':'READY';
   const rows=await db.child.findMany({where:{...scope,...(data.cursor?{id:{gt:data.cursor}}:{})},orderBy:{id:'asc'},take:data.limit+1,select:profileSelect});
   return {creationStatus,items:rows.slice(0,data.limit).map(learnerProjection),nextCursor:rows.length>data.limit?rows[data.limit-1].id:null};
  },{isolationLevel:'RepeatableRead'});
 }
 @Get('learner-profiles/:id') async detail(@Req() req:HttpRequest,@Param('id') id:string){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']);
  return learnerProjection(await this.service.child(this.service.db,actor,id));
 }
}
@Module({imports:[PersistenceModule],controllers:[LearnersController]})
export class LearnersModule {}
