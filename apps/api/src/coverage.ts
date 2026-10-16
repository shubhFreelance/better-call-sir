import {z} from 'zod';
import {Prisma} from '@prisma/client';
export const labelKey=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const commonSubjects=['Maths','Science','English','Hindi','Physics','Chemistry','Biology','Economics','Statistics','Computer Science','Language','Numbers'];
export const subjectLabel=(v:string)=>commonSubjects.find(s=>labelKey(s)===labelKey(v))||v.normalize('NFKC').trim().replace(/\s+/g,' ');
export const subjectSchema=z.string().trim().min(1).max(60).transform(subjectLabel).pipe(z.string().min(1).max(60));
export const boardSchema=z.string().trim().min(1).max(80).transform(v=>v.normalize('NFKC').replace(/\s+/g,' ').toUpperCase()).pipe(z.string().min(1).max(80));
const courseSchema=z.string().trim().min(1).max(160).transform(v=>v.normalize('NFKC').replace(/\s+/g,' ')).pipe(z.string().min(1).max(160));
const keys={subjectKey:z.string().max(400).optional(),boardKey:z.string().max(400).optional(),courseKey:z.string().max(400).optional()};
export const teachingScope=z.discriminatedUnion('stage',[
 z.object({stage:z.literal('SCHOOL'),subject:subjectSchema,grade:z.number().int().min(1).max(12),board:boardSchema,...keys}).strict(),
 z.object({stage:z.literal('EARLY_YEARS'),subject:subjectSchema,level:z.enum(['NURSERY','KG1','KG2']),...keys}).strict(),
 z.object({stage:z.literal('COLLEGE'),subject:subjectSchema,courseName:courseSchema,studyYear:z.number().int().min(1).max(10),...keys}).strict(),
]).transform(s=>{const {subjectKey,boardKey,courseKey,...scope}=s;return {...scope,subjectKey:labelKey(scope.subject),...('board' in scope?{boardKey:labelKey(scope.board)}:{}),...('courseName' in scope?{courseKey:labelKey(scope.courseName)}:{})};});
export type TeachingScope=z.infer<typeof teachingScope>;
const identity=(s:TeachingScope)=>JSON.stringify([s.stage,s.subjectKey,'grade' in s?s.grade:null,'board' in s?s.boardKey:null,'level' in s?s.level:null,'courseName' in s?s.courseKey:null,'studyYear' in s?s.studyYear:null]);
export const teachingScopes=z.array(teachingScope).min(1).max(200).refine(rows=>new Set(rows.map(s=>s.subjectKey)).size<=40&&new Set(rows.flatMap(s=>'board' in s?[s.boardKey]:[])).size<=20,'Use up to 40 subjects and 20 boards.').refine(rows=>new Set(rows.map(identity)).size===rows.length,'Do not repeat a teaching scope.').transform(rows=>rows.sort((a,b)=>identity(a).localeCompare(identity(b))));
type CoverageTeacher={subjects:string[];grades:number[];boards:string[];teachingCoverage?:unknown};
export function declaredScopes(t:CoverageTeacher):TeachingScope[]{
 if(t.teachingCoverage!==null&&t.teachingCoverage!==undefined){const parsed=teachingScopes.safeParse(t.teachingCoverage);return parsed.success?parsed.data:[];}
 const rows=[];for(const subject of t.subjects)for(const board of t.boards)for(const grade of t.grades){rows.push({stage:'SCHOOL' as const,subject,board,grade});if(rows.length>200)return [];}
 const parsed=teachingScopes.safeParse(rows);return parsed.success?parsed.data:[];
}
export function coverageProfile<T extends CoverageTeacher>(t:T){
 const scopes=declaredScopes(t);if(!scopes.length)throw new Error('Invalid teaching coverage');
 return {...t,subjects:[...new Set(scopes.map(s=>s.subject))],boards:[...new Set(scopes.flatMap(s=>'board' in s?[s.board]:[]))],grades:[...new Set(scopes.flatMap(s=>'grade' in s?[s.grade]:[]))].sort((a,b)=>a-b),...(t.teachingCoverage?{teachingCoverage:scopes}:{})};
}
export function sameCoverage(a:CoverageTeacher,b:unknown){const parsed=teachingScopes.safeParse(b);return parsed.success&&JSON.stringify(declaredScopes(a).map(identity))===JSON.stringify(parsed.data.map(identity));}
export const coverageQuery=z.object({stage:z.enum(['SCHOOL','EARLY_YEARS','COLLEGE']).optional(),subject:z.preprocess(v=>v===''?undefined:v,subjectSchema.optional()),grade:z.coerce.number().int().min(1).max(12).optional(),board:boardSchema.optional(),level:z.enum(['NURSERY','KG1','KG2']).optional(),courseName:courseSchema.optional(),studyYear:z.coerce.number().int().min(1).max(10).optional()});
export type CoverageQuery=z.infer<typeof coverageQuery>;
export function scopeFilter(q:CoverageQuery):Record<string,string|number>{
 const inferred=q.level?'EARLY_YEARS':q.courseName||q.studyYear?'COLLEGE':q.grade||q.board?'SCHOOL':undefined;
 const stage=q.stage||inferred;
 if((q.level&&stage!=='EARLY_YEARS')||((q.courseName||q.studyYear)&&stage!=='COLLEGE')||((q.grade||q.board)&&stage!=='SCHOOL'))throw new Error('Mixed education criteria');
 return {...(stage?{stage}:{}),...(q.subject?{subjectKey:labelKey(q.subject)}:{}),...(q.grade?{grade:q.grade}:{}),...(q.board?{boardKey:labelKey(q.board)}:{}),...(q.level?{level:q.level}:{}),...(q.courseName?{courseKey:labelKey(q.courseName)}:{}),...(q.studyYear?{studyYear:q.studyYear}:{})};
}
export function coverageWhere(q:CoverageQuery):Prisma.TeacherWhereInput{
 const filter=scopeFilter(q),legacyAllowed=!filter.stage||filter.stage==='SCHOOL';
 return {OR:[{teachingCoverage:{array_contains:[filter]}},...(legacyAllowed?[{teachingCoverage:{equals:Prisma.DbNull},...(q.subject?{subjects:{has:subjectLabel(q.subject)}}:{}),...(q.board?{boards:{has:q.board.toUpperCase()}}:{}),...(q.grade?{grades:{has:q.grade}}:{})}]:[])]};
}
export type LearnerScope={educationStage?:string;grade:number|null;board:string|null;earlyYearsLevel?:string|null;courseName?:string|null;studyYear?:number|null};
export function learnerScope(c:LearnerScope,subject?:string):CoverageQuery|null{
 const stage=c.educationStage||'SCHOOL';
 if(stage==='SCHOOL'&&c.grade&&c.board)return {stage,subject,grade:c.grade,board:c.board};
 if(stage==='EARLY_YEARS'&&['NURSERY','KG1','KG2'].includes(c.earlyYearsLevel||''))return {stage,subject,level:c.earlyYearsLevel as 'NURSERY'|'KG1'|'KG2'};
 if(stage==='COLLEGE'&&c.courseName&&c.studyYear)return {stage,subject,courseName:c.courseName,studyYear:c.studyYear};
 return null;
}
export function covers(t:CoverageTeacher,c:LearnerScope,subject:string){const q=learnerScope(c,subject);if(!q)return false;const filter=scopeFilter(q);return declaredScopes(t).some(s=>Object.entries(filter).every(([k,v])=>(s as Record<string,unknown>)[k]===v));}
export function educationCaption(c:LearnerScope){return c.educationStage==='COLLEGE'?`${c.courseName||'College'} · Year ${c.studyYear||'not recorded'}`:c.educationStage==='EARLY_YEARS'?(c.earlyYearsLevel==='NURSERY'?'Nursery':c.earlyYearsLevel||'Early years'):`Class ${c.grade} · ${c.board}`;}
