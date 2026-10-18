import {coverageWhere,declaredScopes} from './coverage';
import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module, Controller, Get, Post, Param, Query, Body, Req, Res, Injectable, Inject, HttpException, Catch, ExceptionFilter, ArgumentsHost, Global} from '@nestjs/common';
import {Prisma, PrismaClient, Account, Teacher} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {Request, Response} from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import {z} from 'zod';
import {eligible, placementFee, verifiedAttendance, revisionRefund, window30} from './policies';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const uuid = z.string().uuid();
export const version = z.number().int().positive();
export const text = (max = 200) => z.string().trim().min(1).max(max);
export function fail(status: number, code: string, message: string): never {throw new HttpException({code, message}, status);}
export const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpException({code:'VALIDATION',message:'Please check the highlighted fields.',fieldErrors:result.error.flatten().fieldErrors},400);
  return result.data;
};
export const same = (a: string, b: string) => {const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
export const development = () => process.env.APP_MODE === 'development' && process.env.NODE_ENV !== 'production';
export const privileged = (role:string) => ['ADMIN','OPERATOR','REVIEWER','FINANCE'].includes(role);
export type HttpRequest = Request & {requestId?:string;rawBody?:Buffer};
export type DB = Prisma.TransactionClient;

@Injectable()
export class AppService {
  db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,query_timeout:15000,statement_timeout:15000})});
  async limit(key: string, max = 5, seconds = 60) {
    const digest=hash(key);
    const rows=await this.db.$queryRaw<{count:number}[]>`INSERT INTO "RateBucket" (key,count,"resetsAt") VALUES (${digest},1,CURRENT_TIMESTAMP+${seconds}*interval '1 second') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateBucket"."resetsAt"<=CURRENT_TIMESTAMP THEN 1 ELSE "RateBucket".count+1 END,"resetsAt"=CASE WHEN "RateBucket"."resetsAt"<=CURRENT_TIMESTAMP THEN EXCLUDED."resetsAt" ELSE "RateBucket"."resetsAt" END RETURNING count`;
    if(rows[0].count>max)fail(429,'RATE_LIMIT','Too many attempts. Try again after the current limit window.');
  }
  async actor(req: Request, roles?: string[]): Promise<Account> {
    const secret = req.cookies?.bcs_access;
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) fail(401,'SESSION_REQUIRED','Sign in to continue.');
    const session = await this.db.session.findUnique({where:{accessHash:hash(secret)}});
    if (!session || session.revoked || session.rotated || session.accessExpiresAt < new Date() || session.expiresAt < new Date()) fail(401,'SESSION_EXPIRED','Your session has expired. Sign in again.');
    const account = await this.db.account.findUnique({where:{id:session.accountId}});
    if (!account || account.disabled || session.authVersion!==account.authVersion) fail(401,'SESSION_REVOKED','This account is unavailable.');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !same(req.get('X-CSRF-Token') || '',session.csrf)) fail(403,'CSRF','Refresh this page before continuing.');
    if (account.role === 'STUDENT') {
      const child=await this.db.child.findUnique({where:{studentAccountId:account.id}});
      const consent=child?await this.db.consent.findUnique({where:{guardianId:child.guardianId}}):null;
      if (!child || child.studentAccessRevokedAt || !consent || consent.withdrawnAt) fail(401,'STUDENT_ACCESS_REVOKED','Guardian authorization is no longer active.');
    }
    if (roles && !roles.includes(account.role)) fail(403,'FORBIDDEN','Your role cannot perform this action.');
    if(privileged(account.role)){
      if(session.createdAt.getTime()<Date.now()-8*3600000||session.lastSeenAt.getTime()<Date.now()-900000)fail(401,'SESSION_EXPIRED','Staff session expired. Sign in again.');
      const securityRoute=/^\/api\/v1\/auth\/(session|logout|mfa(?:\/(?:enrollment|verification|recovery-codes))?)$/.test(req.path);
      if(!securityRoute&&(!session.mfaVerifiedAt||session.mfaVerifiedAt.getTime()<Date.now()-600000))fail(403,'MFA_REQUIRED','Verify your authenticator before accessing staff records.');
      if(session.lastSeenAt.getTime()<Date.now()-60000)await this.db.session.updateMany({where:{id:session.id,lastSeenAt:{lt:new Date(Date.now()-60000)}},data:{lastSeenAt:new Date()}});
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method))await this.limit('write:'+account.id,300);
    if(req.method==='POST'&&/^\/api\/v1\/teachers\/[^/]+\/evidence$/.test(req.path))await this.limit('upload:'+account.id,30,86400);
    return account;
  }
  async guardian(db: DB, id: string) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    const account = await db.account.findUnique({where:{id}});
    const consent = await db.consent.findUnique({where:{guardianId:id}});
    if(await db.privacyRequest.findFirst({where:{accountId:id,kind:'DELETION',scope:{in:['ACCOUNT','CHILD']},status:'PENDING'}}))fail(403,'PRIVACY_PENDING','Processing is paused while the deletion request is reviewed.');
    if (!account?.verified || account.disabled || !consent || consent.withdrawnAt) fail(403,'CONSENT_REQUIRED','Adult verification and active guardian consent are required.');
  }
  async child(db: DB, account: Account, id: string) {
    const child = await db.child.findUnique({where:{id}});
    if (!child || (account.role === 'GUARDIAN' && child.guardianId !== account.id) || (account.role === 'STUDENT' && child.studentAccountId !== account.id)) fail(404,'NOT_FOUND','Student not found.');
    return child;
  }
  async audit(db: DB, actor: Account, req: HttpRequest, action: string, id: string, reason: string, before?: Prisma.InputJsonValue, after?: Prisma.InputJsonValue) {
    return db.audit.create({data:{actorId:actor.id,action,aggregateId:id,reason,requestId:req.requestId || randomUUID(),before,after}});
  }
  async event(db: DB,type: string,id: string,version=1) {return db.outbox.create({data:{type,aggregateId:id,payload:{version}}});}
  async once<T>(req: Request, actor: Account, operation: string, body: unknown, fn: (db: DB) => Promise<T>): Promise<T> {
    operation += ':' + req.path;
    const key = req.get('Idempotency-Key');
    if (!key || key.length > 128) fail(400,'IDEMPOTENCY_REQUIRED','A valid Idempotency-Key is required.');
    const digest = hash(JSON.stringify(body));
    return this.db.$transaction(async db => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id + operation + key},0))`;
      const prior = await db.idempotency.findUnique({where:{accountId_operation_key:{accountId:actor.id,operation,key}}});
      if (prior) {if (prior.hash !== digest) fail(409,'IDEMPOTENCY_CONFLICT','This retry key was used for a different request.'); return prior.result as T;}
      const result = await fn(db);
      await db.idempotency.create({data:{accountId:actor.id,operation,key,hash:digest,result:JSON.parse(JSON.stringify(result))}});
      return result;
    });
  }
  async issueSession(account: Account, familyId: string, db: Pick<DB,'session'> = this.db, expiresAt = new Date(Date.now()+30*86_400_000),security?:{createdAt:Date;mfaVerifiedAt:Date|null;deviceLabel?:string|null}) {
    if(privileged(account.role))expiresAt=new Date(Math.min(expiresAt.getTime(),Date.now()+8*3600000));
    const access=token(),refresh=token(),csrf=token();
    await db.session.create({data:{accountId:account.id,authVersion:account.authVersion,familyId,accessHash:hash(access),refreshHash:hash(refresh),csrf,accessExpiresAt:new Date(Math.min(Date.now()+600_000,expiresAt.getTime())),expiresAt,...security}});
    return {access,refresh,csrf,expiresAt,familyId};
  }
  sessionResponse(account: Account, state: {access:string;refresh:string;csrf:string;expiresAt:Date}, res: Response) {
    const cookie={httpOnly:true,secure:!development(),sameSite:'lax' as const,path:'/api/v1'};
    const remaining=Math.max(0,state.expiresAt.getTime()-Date.now());
    res.cookie('bcs_access',state.access,{...cookie,maxAge:Math.min(600_000,remaining)});
    res.cookie('bcs_refresh',state.refresh,{...cookie,maxAge:remaining});
    res.setHeader('Cache-Control','no-store');
    return {account:{id:account.id,name:account.name,role:account.role,verified:account.verified},csrfToken:state.csrf};
  }
  async session(account: Account, res: Response, familyId: string = randomUUID()) {
    return this.sessionResponse(account,await this.issueSession(account,familyId),res);
  }
  async publicTeachers(where:Prisma.TeacherWhereInput={},limit=50,cursor?:string) {
    const active=await this.db.account.findMany({where:{disabled:false,role:'TEACHER'},select:{id:true}});
    const teachers=await this.db.teacher.findMany({where:{AND:[where,coverageWhere({}),{accountId:{in:active.map(a=>a.id)},status:'APPROVED',screeningComplete:true,screeningValidUntil:{gt:new Date()}}]},orderBy:[{name:'asc'},{id:'asc'}],take:limit,...(cursor?{cursor:{id:cursor},skip:1}:{})});
    return teachers.map(t=>this.publicProjection(t));
  }
  publicProjection(t:Teacher) {return {id:t.id,slug:t.slug,name:t.name,headline:t.headline,bio:t.bio,subjects:t.subjects,boards:t.boards,grades:t.grades,teachingCoverage:declaredScopes(t),languages:t.languages,modes:t.modes,localities:t.localities,monthlyPaise:t.monthlyPaise,experience:t.experience,avatarColor:t.avatarColor,demoAvailable:t.demoOptIn===true,lockInDays:t.lockInDays,capabilityLabel:'Reviewed subject coverage',consultationOptIn:t.consultationOptIn};}

}


@Global()
@Module({providers:[AppService],exports:[AppService]})
export class PersistenceModule {}
