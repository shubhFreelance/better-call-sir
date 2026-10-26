import {Module,Controller,Get,Post,Param,Req,Body,Inject} from '@nestjs/common';
import {z} from 'zod';
import {AppService,PersistenceModule,HttpRequest,uuid,version,parse,fail} from '../../shared';
import {learningAuthority} from './learning-management';
import {learnerProjection} from './learners.module';
import {learnerSpaces,spacesSchema} from './learning-spaces';
@Controller('api/v1')
class LearningSpacesController {
 constructor(@Inject(AppService) private readonly service:AppService){}
 @Get('children/:id/learning-spaces') async get(@Req() req:HttpRequest,@Param('id') id:string){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']);
  return this.service.db.$transaction(async db=>{const child=await learningAuthority(db,this.service,actor,id);return {learner:learnerProjection(child),spaces:await learnerSpaces(db,child),version:child.learningSpacesVersion};});
 }
 @Post('children/:id/learning-spaces') async save(@Req() req:HttpRequest,@Param('id') id:string,@Body() body:unknown){
  parse(uuid,id);const actor=await this.service.actor(req,['GUARDIAN','STUDENT']),data=parse(z.object({expectedVersion:z.number().int().nonnegative(),educationVersion:version,confirmed:z.literal(true),spaces:spacesSchema}).strict(),body);
  return this.service.once(req,actor,'learner.spaces',data,async db=>{
   const child=await learningAuthority(db,this.service,actor,id,true);
   if(child.learningSpacesVersion!==data.expectedVersion||child.version!==data.educationVersion)fail(409,'CONFLICT','The learner or subject spaces changed. Reload and review them again.');
   if(!learnerProjection(child).enquiryEligible)fail(409,'EDUCATION_INCOMPLETE','Complete the learner education details before saving subject spaces.');
   const updated=await db.child.update({where:{id},data:{learningSpaces:data.spaces,learningSpacesVersion:{increment:1}}});
   if(child.studentAccountId){const progress=await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:child.studentAccountId,kind:'STUDENT'}}});if(progress)await db.onboardingProgress.update({where:{id:progress.id},data:{draft:{...(progress.draft as object),spaces:data.spaces,subjects:data.spaces.map(s=>s.subject)},version:{increment:1}}});}
   await this.service.audit(db,actor,req,'LEARNER_SPACES_SAVED',id,'Family member confirmed subject-specific learning preferences');
   return {learner:learnerProjection(updated),spaces:data.spaces,version:updated.learningSpacesVersion};
  },db=>learningAuthority(db,this.service,actor,id,true));
 }
}
@Module({imports:[PersistenceModule],controllers:[LearningSpacesController]})
export class LearningSpacesModule{}
