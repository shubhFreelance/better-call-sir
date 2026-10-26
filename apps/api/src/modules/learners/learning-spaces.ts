import type { Child } from '@prisma/client';
import {z} from 'zod';
import {DB,fail,text} from '../../shared';
import {subjectSchema} from '../../coverage';
export const subjectSpace=z.object({subject:subjectSchema,language:z.enum(['English','Hindi']).optional(),learningPreferences:text(500).optional()}).strict();
export const spacesSchema=z.array(subjectSpace).max(20).refine(spaces=>new Set(spaces.map(s=>s.subject.toLowerCase())).size===spaces.length,'You cannot change the subject because you have already created a space for it.');
export async function learnerSpaces(db:DB,child:Child) {
 if(child.learningSpaces!==null)return spacesSchema.parse(child.learningSpaces);
 const progress=child.studentAccountId?await db.onboardingProgress.findUnique({where:{accountId_kind:{accountId:child.studentAccountId,kind:'STUDENT'}}}):null;
 const draft=progress?.draft as {spaces?:unknown;subjects?:string[];language?:string;learningPreferences?:string}|undefined;
 if(draft?.spaces)return spacesSchema.parse(draft.spaces);
 return spacesSchema.parse((draft?.subjects||[]).map(subject=>({subject,...(draft?.language?{language:draft.language}:{}),...(draft?.learningPreferences?{learningPreferences:draft.learningPreferences}:{})})));
}
export async function requireLearningSpace(db:DB,child:Child,subject?:string) {
 if(!subject || !(await learnerSpaces(db,child)).some(space=>space.subject.toLowerCase()===subject.toLowerCase()))fail(409,'LEARNING_SPACE_REQUIRED','Create a subject space and select it before searching for a teacher or sending an enquiry.');
}
