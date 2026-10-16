import type {components} from './generated';
export type {paths,components} from './generated';
export interface Account {id:string;name:string;role:string;verified:boolean}
export interface Session {account:Account;csrfToken:string}
export interface Teacher {teachingCoverage?:components["schemas"]["TeachingScope"][]|null;lockInDays?:0|15|30|null;demoAvailable?:boolean;id:string;slug:string;name:string;headline:string;bio:string;subjects:string[];boards:string[];grades:number[];languages:string[];modes:string[];localities:string[];monthlyPaise:number;experience:number;avatarColor:string;capabilityLabel:string;consultationOptIn:boolean;status?:string;version?:number;screeningComplete?:boolean}
export interface Child {schoolName?:string|null;schoolSubjects?:string[];id:string;alias:string;grade:number|null;board:string|null;educationStage?:string;earlyYearsLevel?:string|null;courseName?:string|null;studyYear?:number|null}
export interface Lesson {id:string;childId:string;subject:string;kind:string;startsAt:string;endsAt:string;status:string;attendance:string;disputed:boolean;version:number}
export interface TuitionRequest {id:string;childId:string;discoveryMethod:'MANUAL'|'ASSISTED';preferredTeacherId:string|null;subject:string;mode:string;language:string;locality:string;budgetPaise:number;schedule:string;status:string;version:number;createdAt:string}
export interface Candidate {id:string;teacherId:string;score:number;reasons:string[];response:string;version:number;runId:string|null;expiresAt:string|null;presentedAt:string|null}
export interface Placement {id:string;teacherId:string;childId:string;monthlyPaise:number;status:string;version:number;guardianAccepted:boolean;teacherAccepted:boolean;guardianStarted:boolean;teacherReceiptConfirmed:boolean}
export interface Reservation {id:string;teacherId:string;childId:string|null;kind:string;startsAt:string;endsAt:string;status:string;version:number;topic:string;subject:string;language:string;scopeAccepted:boolean;amountPaise:number;payablePaise:number;pricePolicyVersion:string;expiresAt:string|null}
export interface Note {id:string;childId:string;text:string;sharedTeacherId:string|null;acknowledgedAt:string|null;version:number;createdAt:string}
export interface Membership {cancelAtPeriodEnd:boolean;status:string;periodEnd:string;allowance:number;used:number;reserved:number}
export interface Call {id:string;teacherId:string;placementId:string;startsAt:string;status:string;version:number}
export interface Dashboard {role:string;window:{start:string;end:string;timezone:string;metricVersion:string};metrics:Record<string,number>;children?:Child[];lessons?:Lesson[];placements?:Placement[];teachers?:Teacher[];requests?:TuitionRequest[];reservations?:Reservation[];membership?:Membership|null;calls?:Call[];consent?:{withdrawnAt:string|null}|null;profile?:Teacher;opportunities?:Candidate[];invoices?:{id:string;amountPaise:number;status:string}[];cases?:{id:string;category:string;description:string;status:string}[];flags?:{name:string;enabled:boolean;version:number}[];audit?:{id:string;action:string;reason:string;createdAt:string}[];jobs?:{pending:number;failed:number}}
export class ApiError extends Error {constructor(public status:number,public code:string,message:string,public fieldErrors?:Record<string,string[]>){super(message);}}
export async function api<T>(path:string,options:{method?:string;body?:unknown;csrf?:string;key?:string;signal?:AbortSignal}={}):Promise<T> {
  const base=process.env.NEXT_PUBLIC_API_BASE||'/api/v1';
  if(base!=='/api/v1'||!path.startsWith('/')||path.startsWith('//')||!new URL(base+path,'https://api.invalid').pathname.startsWith(base+'/'))throw new ApiError(400,'INVALID_REQUEST','Use the same-origin application API.');
  const timeout=AbortSignal.timeout(15000),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  const response=await fetch(`${base}${path}`,{method:options.method || 'GET',credentials:'include',cache:'no-store',redirect:'error',signal,headers:{'Content-Type':'application/json',...(options.csrf?{'X-CSRF-Token':options.csrf}:{}),...(options.key?{'Idempotency-Key':options.key}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
  let result;try {result=await response.json();}catch {throw new ApiError(response.status,'INVALID_RESPONSE','The service returned an unreadable response. Please retry.');}
  if (!response.ok) throw new ApiError(response.status,typeof result?.code==='string'?result.code:'ERROR',typeof result?.message==='string'?result.message:'Unable to complete this action.',result?.fieldErrors);
  return result as T;
}
export const rupees=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100);

export interface Demo {id:string;requestId:string;teacherId:string;guardianId:string;reservationId:string;status:string;guardianAccepted:boolean;teacherAccepted:boolean;guardianOutcome:string|null;teacherOutcome:string|null;supportCaseId:string|null;version:number;createdAt:string;reservation:Reservation}
