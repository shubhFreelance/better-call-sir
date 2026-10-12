import {Module,Controller,Get,Post,Param,Query,Body,Req,Inject} from '@nestjs/common';
import {Account} from '@prisma/client';
import {z} from 'zod';
import {AppService,PersistenceModule,uuid,version,text,fail,parse,HttpRequest,DB} from '../../shared';

@Controller('api/v1')
class LearningRecordsController {
  constructor(@Inject(AppService) private readonly service:AppService){}
  async visible(db:DB,actor:Account,id:string){
    const lesson=await db.lesson.findUnique({where:{id}});if(!lesson)fail(404,'NOT_FOUND','Lesson not found.');
    if(actor.role==='TEACHER'){
      const teacher=await db.teacher.findUnique({where:{accountId:actor.id}});if(lesson.teacherId!==teacher?.id)fail(404,'NOT_FOUND','Lesson not found.');
    }else await this.service.child(db,actor,lesson.childId);
    return lesson;
  }
  @Get('lessons') async lessons(@Req() req:HttpRequest,@Query() query:unknown){
    const actor=await this.service.actor(req,['GUARDIAN','STUDENT','TEACHER']);
    const data=parse(z.object({from:z.iso.datetime({offset:true}),to:z.iso.datetime({offset:true}),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:uuid.optional()}).strict(),query);
    const from=new Date(data.from),to=new Date(data.to);if(to<=from||to.getTime()-from.getTime()>366*86400000)fail(400,'INVALID_RANGE','Choose a date range of up to one year.');
    const teacher=actor.role==='TEACHER'?await this.service.db.teacher.findUnique({where:{accountId:actor.id}}):null;
    const children=actor.role==='GUARDIAN'?await this.service.db.child.findMany({where:{guardianId:actor.id},select:{id:true}}):actor.role==='STUDENT'?await this.service.db.child.findMany({where:{studentAccountId:actor.id},select:{id:true}}):[];
    const items=await this.service.db.lesson.findMany({where:{startsAt:{gte:from,lte:to},...(teacher?{teacherId:teacher.id}:{childId:{in:children.map(c=>c.id)}})},orderBy:[{startsAt:'desc'},{id:'desc'}],take:data.limit+1,...(data.cursor?{cursor:{id:data.cursor},skip:1}:{})});
    const page=items.slice(0,data.limit),records=[];
    for(const lesson of page){
      const child=await this.service.db.child.findUniqueOrThrow({where:{id:lesson.childId},select:{alias:true,grade:true,board:true}}),profile=await this.service.db.teacher.findUniqueOrThrow({where:{id:lesson.teacherId},select:{name:true}});
      records.push({...lesson,learner:child,teacher:{id:lesson.teacherId,name:profile.name},confirmations:await this.service.db.lessonConfirmation.findMany({where:{lessonId:lesson.id},select:{action:true,createdAt:true},orderBy:{createdAt:'asc'}})});
    }
    return {items:records,nextCursor:items.length>data.limit?page.at(-1)!.id:null};
  }
  @Post('lessons/:id/attendance') async attendance(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['TEACHER']);const data=parse(z.object({expectedVersion:version,attendance:z.enum(['PRESENT','LATE','ABSENT']),reason:text(300),recap:z.string().trim().min(1).max(2000).optional()}).strict(),body);
    return this.service.once(req,actor,'lesson.attendance',data,async db=>{
      const before=await this.visible(db,actor,id);if(before.startsAt>new Date()||before.status==='CANCELLED')fail(409,'LESSON_NOT_READY','Only a past, non-cancelled lesson can be completed.');if(before.kind==='REVISION'&&['PRESENT','LATE'].includes(data.attendance)&&!data.recap)fail(400,'RECAP_REQUIRED','A short expert recap is required for a delivered revision session.');
      const changed=await db.lesson.updateMany({where:{id,version:data.expectedVersion},data:{attendance:data.attendance,status:'COMPLETED',recap:data.recap,recapSubmittedAt:data.recap?new Date():undefined,version:{increment:1}}});if(!changed.count)fail(409,'CONFLICT','Attendance has changed.');
      if(before.kind==='REVISION')await db.teacherPayable.updateMany({where:{lessonId:id},data:{status:'HELD_CONFIRMATION',version:{increment:1}}});
      await this.service.audit(db,actor,req,'ATTENDANCE_CHANGED',id,data.reason,{attendance:before.attendance},{attendance:data.attendance});await this.service.event(db,'attendance.changed',id);return db.lesson.findUniqueOrThrow({where:{id}});
    });
  }
  @Post('lessons/:id/confirmations') async confirmation(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']);const data=parse(z.object({expectedVersion:version,action:z.enum(['CONFIRMED','DISPUTED']),reason:text(500)}).strict(),body);
    return this.service.once(req,actor,'lesson.confirmation',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;const lesson=await this.visible(db,actor,id);
      if(lesson.version!==data.expectedVersion||lesson.status!=='COMPLETED'||lesson.attendance==='PENDING')fail(409,'CONFLICT','Attendance is not ready or changed.');
      const record=await db.lessonConfirmation.create({data:{lessonId:id,actorId:actor.id,action:data.action,reason:data.reason,lessonVersion:lesson.version}});
      if(data.action==='DISPUTED'){await db.lesson.update({where:{id},data:{disputed:true,version:{increment:1}}});await db.teacherPayable.updateMany({where:{lessonId:id},data:{status:'HELD_DISPUTE',eligibleAt:null,version:{increment:1}}});await db.supportCase.create({data:{accountId:actor.id,category:'ATTENDANCE',description:`Lesson ${id}: ${data.reason}`}});}
      else {const child=await db.child.findUniqueOrThrow({where:{id:lesson.childId}});if(actor.id===child.guardianId)await db.teacherPayable.updateMany({where:{lessonId:id,status:'HELD_CONFIRMATION'},data:{status:'ELIGIBLE',eligibleAt:new Date(),version:{increment:1}}});}
      await this.service.audit(db,actor,req,'ATTENDANCE_'+data.action,id,data.reason,undefined,{lessonVersion:lesson.version});await this.service.event(db,'attendance.'+data.action.toLowerCase(),id);return record;
    });
  }
  @Post('lessons/:id/disputes') async dispute(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']);const {reason}=parse(z.object({reason:text(500)}).strict(),body),lesson=await this.visible(this.service.db,actor,id);
    await this.confirmation(req,id,{expectedVersion:lesson.version,action:'DISPUTED',reason});return {status:'DISPUTED'};
  }
  @Post('admin/lessons/:id/dispute-resolutions') async resolve(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','OPERATOR']);const data=parse(z.object({expectedVersion:version,attendance:z.enum(['PRESENT','LATE','ABSENT']),reason:text(1000)}).strict(),body);
    return this.service.once(req,actor,'lesson.dispute.resolve',data,async db=>{
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;const before=await db.lesson.findUnique({where:{id}});if(!before)fail(404,'NOT_FOUND','Lesson not found.');
      if(actor.role==='OPERATOR'){
        const placement=before.placementId?await db.placement.findUnique({where:{id:before.placementId}}):null,request=placement?await db.tuitionRequest.findUnique({where:{id:placement.requestId}}):null;if(!request||request.region!==actor.region)fail(404,'NOT_FOUND','Lesson not found.');
      }
      if(before.version!==data.expectedVersion||!before.disputed)fail(409,'CONFLICT','Dispute is no longer open.');
      const updated=await db.lesson.update({where:{id},data:{attendance:data.attendance,disputed:false,version:{increment:1}}});await db.supportCase.updateMany({where:{category:'ATTENDANCE',status:'OPEN',description:{contains:id}},data:{status:'RESOLVED'}});await db.teacherPayable.updateMany({where:{lessonId:id,status:'HELD_DISPUTE'},data:{status:['PRESENT','LATE'].includes(data.attendance)?'ELIGIBLE':'REVIEW_REQUIRED',eligibleAt:['PRESENT','LATE'].includes(data.attendance)?new Date():null,version:{increment:1}}});
      await this.service.audit(db,actor,req,'ATTENDANCE_DISPUTE_RESOLVED',id,data.reason,{attendance:before.attendance},{attendance:data.attendance});await this.service.event(db,'attendance.dispute_resolved',id);return updated;
    });
  }
  @Post('lessons/:id/feedback') async feedback(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
    parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN']);const data=parse(z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().max(1000)}).strict(),body);
    return this.service.once(req,actor,'lesson.feedback',data,async db=>{
      const lesson=await this.visible(db,actor,id);if(lesson.status!=='COMPLETED'||lesson.disputed)fail(409,'LESSON_NOT_CONFIRMED','Resolve attendance before feedback.');
      if(!await db.lessonConfirmation.findFirst({where:{lessonId:id,actorId:actor.id,action:'CONFIRMED'}}))fail(409,'CONFIRMATION_REQUIRED','Confirm attendance before feedback.');
      const feedback=await db.lessonFeedback.create({data:{lessonId:id,guardianId:actor.id,...data}});await this.service.audit(db,actor,req,'LESSON_FEEDBACK_RECORDED',id,'Guardian submitted private lesson feedback',undefined,{rating:data.rating});return feedback;
    });
  }
}
@Module({imports:[PersistenceModule],controllers:[LearningRecordsController]})
export class LearningRecordsModule {}
