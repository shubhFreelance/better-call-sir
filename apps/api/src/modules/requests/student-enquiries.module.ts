import {Module,Controller,Get,Post,Param,Query,Req,Body,Inject} from '@nestjs/common';
import {z} from 'zod';
import type {Account,StudentEnquiry} from '@prisma/client';
import {AppService,PersistenceModule,HttpRequest,DB,uuid,version,text,parse,fail} from '../../shared';
import {learnerEducation} from '../learners/learners.module';
import {subjectSchema} from '../../coverage';
import {eligible} from '../../policies';
import {weeklyPreferenceSchema,normalizedPreferences} from './request-schedule';
const input=z.object({expectedProfileVersion:version,discoveryMethod:z.enum(['MANUAL','ASSISTED']),preferredTeacherId:uuid.optional(),subject:subjectSchema,mode:z.enum(['ONLINE','HOME']),language:z.enum(['English','Hindi']),locality:text(80),budgetPaise:z.number().int().min(50_000).max(2_000_000),preferences:weeklyPreferenceSchema,confirmed:z.literal(true)}).strict();
const page=z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(50).default(10),status:z.enum(['SUBMITTED','WITHDRAWN']).optional()}).strict();
async function context(db:DB,id:string){
 const account=await db.account.findUniqueOrThrow({where:{id}}),profile=await db.independentStudentProfile.findUnique({where:{accountId:id}});
 if(account.disabled||account.role!=='INDEPENDENT_STUDENT'||!profile)fail(403,'FORBIDDEN','An active independent student profile is required.');
 const education=parse(learnerEducation,profile.education);
 if(education.stage==='EARLY_YEARS')fail(403,'FORBIDDEN','Early-years learners require guardian setup.');
 const educationScope=education.stage==='SCHOOL'?{stage:education.stage,grade:education.grade,board:education.board}:{stage:education.stage,courseName:education.courseName,studyYear:education.studyYear};
 const paused=!!await db.privacyRequest.count({where:{accountId:id,kind:'DELETION',scope:'ACCOUNT',status:'PENDING'}}),region=await db.region.findUnique({where:{id:account.region}});
 return {profileVersion:profile.version,educationScope,subjects:education.subjects,region:account.region,gate:paused?'PRIVACY_PAUSED':!region?.enabled?'UNSUPPORTED_REGION':'READY'};
}
function projection(row:StudentEnquiry){
 return {id:row.id,discoveryMethod:row.discoveryMethod,preferredTeacherId:row.preferredTeacherId,educationScope:row.educationScope,profileVersion:row.profileVersion,subject:row.subject,mode:row.mode,language:row.language,locality:row.locality,budgetPaise:row.budgetPaise,preferences:row.preferences,region:row.region,status:row.status,version:row.version,createdAt:row.createdAt};
}
function scope(actor:Account){return actor.role==='INDEPENDENT_STUDENT'?{studentAccountId:actor.id}:actor.role==='OPERATOR'?{region:actor.region}:{};}
@Controller('api/v1')
class StudentEnquiriesController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('independent-student/enquiry-context') async context(@Req() req:HttpRequest){
  const actor=await this.service.actor(req,['INDEPENDENT_STUDENT']);
  return this.service.db.$transaction(db=>context(db,actor.id),{isolationLevel:'RepeatableRead'});
 }
 @Post('student-enquiries') async create(@Req() req:HttpRequest,@Body() body:unknown){
  const actor=await this.service.actor(req,['INDEPENDENT_STUDENT']),data=parse(input,body);
  if((await context(this.service.db,actor.id)).gate!=='READY')fail(403,'ENQUIRY_PAUSED','Enquiries are paused for privacy review or this region is not enabled.');
  const result=await this.service.once(req,actor,'student-enquiry.create',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   const current=await context(db,actor.id);
   if(current.gate!=='READY')fail(403,current.gate,'Enquiries are paused for privacy review or this region is not enabled.');
   if(current.profileVersion!==data.expectedProfileVersion)fail(409,'PROFILE_CHANGED','Your education profile changed. Reload and review it again.');
   if(data.discoveryMethod==='MANUAL'?!data.preferredTeacherId:!!data.preferredTeacherId)fail(400,'INVALID_DISCOVERY_PATH','Manual enquiries require a teacher; assisted enquiries use your criteria.');
   const preferences=normalizedPreferences(data.preferences);if(!preferences)fail(400,'INVALID_SCHEDULE','Choose nonoverlapping weekly windows of at least 20 minutes.');
   if(data.preferredTeacherId){
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.preferredTeacherId},0))`;
    const teacher=await db.teacher.findUnique({where:{id:data.preferredTeacherId}}),owner=teacher?await db.account.findUnique({where:{id:teacher.accountId}}):null;
    const learner={educationStage:current.educationScope.stage,grade:'grade' in current.educationScope?current.educationScope.grade??null:null,board:'board' in current.educationScope?current.educationScope.board??null:null,...('courseName' in current.educationScope?{courseName:current.educationScope.courseName,studyYear:current.educationScope.studyYear}:{})};
    if(!teacher||!owner||owner.disabled||owner.role!=='TEACHER'||!eligible(data,learner,teacher)||(data.mode==='HOME'&&(teacher.region!==current.region||!teacher.travelAccepted)))fail(409,'TEACHER_UNAVAILABLE','This teacher does not currently fit the reviewed criteria. Use assisted search or choose another teacher.');
   }
   const row=await db.studentEnquiry.create({data:{studentAccountId:actor.id,profileVersion:current.profileVersion,educationScope:current.educationScope,region:current.region,discoveryMethod:data.discoveryMethod,preferredTeacherId:data.preferredTeacherId,subject:data.subject,mode:data.mode,language:data.language,locality:data.locality,budgetPaise:data.budgetPaise,preferences}});
   await this.service.audit(db,actor,req,'STUDENT_ENQUIRY_SUBMITTED',row.id,'Student submitted criteria for staff review; no match, hire or booking created',undefined,{discoveryMethod:data.discoveryMethod,profileVersion:current.profileVersion});
   return {id:row.id};
  });
  const row=await this.service.db.studentEnquiry.findFirst({where:{id:result.id,studentAccountId:actor.id}});if(!row)fail(404,'NOT_FOUND','Enquiry is no longer available.');
  return projection(row);
 }
 @Get('student-enquiries') async list(@Req() req:HttpRequest,@Query() query:unknown){
  const actor=await this.service.actor(req,['INDEPENDENT_STUDENT','ADMIN','OPERATOR']),data=parse(page,query),where={...scope(actor),...(data.status?{status:data.status}:{})};
  return this.service.db.$transaction(async db=>{
   if(data.cursor&&!await db.studentEnquiry.count({where:{...where,id:data.cursor}}))fail(404,'NOT_FOUND','Enquiry cursor is outside this queue.');
   const rows=await db.studentEnquiry.findMany({where,orderBy:{id:'asc'},take:data.limit+1,...(data.cursor?{cursor:{id:data.cursor},skip:1}:{})});
   if(actor.role!=='INDEPENDENT_STUDENT')await this.service.audit(db,actor,req,'STUDENT_ENQUIRY_QUEUE_READ','student-enquiries','Staff read region-scoped student criteria without account or institution details');
   return {items:rows.slice(0,data.limit).map(projection),nextCursor:rows.length>data.limit?rows[data.limit-1].id:null};
  },{isolationLevel:'RepeatableRead'});
 }
 @Get('student-enquiries/:id') async detail(@Req() req:HttpRequest,@Param('id') id:string){
  parse(uuid,id);const actor=await this.service.actor(req,['INDEPENDENT_STUDENT','ADMIN','OPERATOR']);
  const row=await this.service.db.studentEnquiry.findFirst({where:{id,...scope(actor)}});if(!row)fail(404,'NOT_FOUND','Enquiry not found.');
  if(actor.role!=='INDEPENDENT_STUDENT')await this.service.audit(this.service.db,actor,req,'STUDENT_ENQUIRY_READ',id,'Staff read scoped student enquiry criteria');
  return projection(row);
 }
 @Post('student-enquiries/:id/withdrawals') async withdraw(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['INDEPENDENT_STUDENT']),data=parse(z.object({expectedVersion:version,confirmed:z.literal(true)}).strict(),body);
  return this.service.once(req,actor,'student-enquiry.withdraw',data,async db=>{
   await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
   const row=await db.studentEnquiry.findFirst({where:{id,studentAccountId:actor.id}});if(!row)fail(404,'NOT_FOUND','Enquiry not found.');
   if(row.version!==data.expectedVersion||row.status!=='SUBMITTED')fail(409,'CONFLICT','Enquiry changed or was already withdrawn.');
   const updated=await db.studentEnquiry.update({where:{id},data:{status:'WITHDRAWN',version:{increment:1}}});
   await this.service.audit(db,actor,req,'STUDENT_ENQUIRY_WITHDRAWN',id,'Student withdrew their own enquiry');return projection(updated);
  });
 }
}
@Module({imports:[PersistenceModule],controllers:[StudentEnquiriesController]})
export class StudentEnquiriesModule {}
