import {pageQuery,pageResult} from '../../pagination';
import {coverageWhere,learnerScope,educationCaption} from '../../coverage';
import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Inject,
} from "@nestjs/common";
import { Account, Prisma, TuitionRequest } from "@prisma/client";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  uuid,
  version,
  text,
  parse,
  fail,
  HttpRequest,
  DB,
} from "../../shared";
import { matched, ruleRanker } from "./eligibility";
import {
  preferenceSchema,
  normalizedPreferences,
} from "../requests/request-schedule";
@Controller("api/v1")
class MatchingController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  async request(db: DB, actor: Account, id: string) {
    let request = await db.tuitionRequest.findUnique({ where: { id } });
    if (
      !request ||
      (actor.role === "GUARDIAN"
        ? request.guardianId !== actor.id
        : actor.role === "OPERATOR" && request.region !== actor.region)
    )
      fail(404, "NOT_FOUND", "Request not found.");
    await this.service.guardian(db, request.guardianId);
    request = await db.tuitionRequest.findUniqueOrThrow({ where: { id } });
    if (request.status !== "OPEN")
      fail(409, "CONFLICT", "Request is not open.");
    return request;
  }
  @Post("admin/requests/:id/recommendations") async recommend(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    const data = parse(z.object({ expectedVersion: version }).strict(), body);
    return this.service.once(req, actor, "matching.run", data, async (db) => {
      const request = await this.request(db, actor, id);
      if (request.version !== data.expectedVersion)
        fail(409, "CONFLICT", "Request changed.");
      const child = await db.child.findUniqueOrThrow({
          where: { id: request.childId },
        }),
        parsed = preferenceSchema.safeParse(request.schedulePreferences);
      const scheduleReady =
        request.scheduleStatus === "CONFIRMED" &&
        parsed.success &&
        !!normalizedPreferences(parsed.data);
      const teachers = scheduleReady && learnerScope(child,request.subject)
        ? await db.teacher.findMany({
            where: {
              ...(request.preferredTeacherId ? {id:request.preferredTeacherId} : {}),
              status: "APPROVED",
              screeningComplete: true,
              screeningValidUntil: { gt: new Date() },
              ...coverageWhere(learnerScope(child,request.subject)!),
              languages: { has: request.language },
              modes: { has: request.mode },
              monthlyPaise: { lte: request.budgetPaise },
              ...(request.mode === "HOME"
                ? {
                    region: request.region,
                    travelAccepted: true,
                    localities: { has: request.locality },
                  }
                : {}),
            },
            orderBy: { id: "asc" },
            take: 201,
          })
        : [];
      const pool = [];
      for (const teacher of teachers.slice(0, 200)) {
        const fit = await matched(db, request, child, teacher);
        if (fit) pool.push(fit);
      }
      const ranking = ruleRanker.rank(
          { budgetPaise: request.budgetPaise },
          pool,
          { mode: request.mode },
        ),
        result = !scheduleReady
          ? "NEEDS_SCHEDULE"
          : pool.length
            ? "MATCHED"
            : "NO_MATCH";
      const run = await db.recommendationRun.create({
        data: {
          requestId: id,
          requestVersion: request.version,
          operatorId: actor.id,
          rankerVersion: ranking.rankerVersion,
          featureVersion: ranking.featureVersion,
          requestFeatures: {
            subject: request.subject,
            mode: request.mode,
            language: request.language,
            budgetPaise: request.budgetPaise,
            region: request.region,
            locality: request.locality,
            educationStage:child.educationStage,earlyYearsLevel:child.earlyYearsLevel,courseName:child.courseName,studyYear:child.studyYear,
            grade: child.grade,
            board: child.board,
            preferences: parsed.success ? parsed.data : null,
          } as Prisma.InputJsonValue,
          eligiblePool: {
            candidates: pool,
            poolLimited: teachers.length > 200,
          } as Prisma.InputJsonValue,
          rankedCandidates: ranking.items as Prisma.InputJsonValue,
          result,
        },
      });
      await db.recommendation.updateMany({
        where: { requestId: id },
        data: {
          presentedAt: null,
          version: { increment: 1 },
          expiresAt: new Date(),
        },
      });
      const items = [];
      for (const ranked of ranking.items.slice(0, 10)) {
        const candidateData = {
          score: ranked.score,
          reasons: [
            `${request.subject} · ${educationCaption(child)}`,
            `${request.language} instruction`,
            "Within budget and capacity, with overlapping availability",
            ...(request.mode === "HOME"
              ? [`Accepted travel to ${request.locality}`]
              : ["Online lessons"]),
          ],
          rankerVersion: ranking.rankerVersion,
          response: "PENDING",
          runId: run.id,
          expiresAt: new Date(Date.now() + 48 * 3600000),
          presentedAt: null,
          position: null,
        };
        items.push(
          await db.recommendation.upsert({
            where: {
              requestId_teacherId: {
                requestId: id,
                teacherId: ranked.teacherId,
              },
            },
            create: {
              ...candidateData,
              requestId: id,
              teacherId: ranked.teacherId,
            },
            update: candidateData,
          }),
        );
      }
      const updated = await db.tuitionRequest.update({
        where: { id },
        data: {
          matchStatus: result,
          selectedCandidateId: null,
          version: { increment: 1 },
        },
      });
      await this.service.audit(
        db,
        actor,
        req,
        "RECOMMENDATION_RUN_CREATED",
        id,
        "Rules-v2 eligible-pool review",
        undefined,
        { runId: run.id, candidateIds: items.map((c) => c.id), result },
      );
      await this.service.event(
        db,
        "matching.review_ready",
        id,
        updated.version,
      );
      return {
        items,
        runId: run.id,
        requestVersion: updated.version,
        rankerVersion: ranking.rankerVersion,
        featureVersion: ranking.featureVersion,
        matchStatus: result,
        scheduleStatus: request.scheduleStatus,
        poolLimited: teachers.length > 200,
      };
    });
  }
  @Get("admin/requests/:id/recommendations") async candidates(@Req() req:HttpRequest,@Param('id') id:string){
    parse(uuid,id);const actor=await this.service.actor(req,['ADMIN','OPERATOR']);
    return this.service.db.$transaction(async db=>{
      const request=await this.request(db,actor,id),child=await db.child.findUniqueOrThrow({where:{id:request.childId}});
      const run=await db.recommendationRun.findFirst({where:{requestId:id},orderBy:[{requestVersion:'desc'},{createdAt:'desc'},{id:'desc'}]});
      const items=[];
      if(run)for(const c of await db.recommendation.findMany({where:{requestId:id,runId:run.id},orderBy:[{score:'desc'},{teacherId:'asc'}],take:10})){
        const teacher=await db.teacher.findUniqueOrThrow({where:{id:c.teacherId}});
        items.push({...c,teacherName:teacher.name,eligibleNow:!!c.expiresAt&&c.expiresAt>new Date()&&c.response!=='DECLINED'&&!!await matched(db,request,child,teacher)});
      }
      await this.service.audit(db,actor,req,'OPERATOR_SHORTLIST_READ',id,'Authorized current matching shortlist read');
      return {runId:run?.id||null,items};
    });
  }
  @Get("admin/requests/:id/recommendation-runs") async history(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Query() query:unknown,
  ) {
    const data=parse(pageQuery,query);
    parse(uuid, id);
    const actor = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    return this.service.db.$transaction(async (db) => {
      await this.request(db, actor, id);
      const anchor=data.cursor?await db.recommendationRun.findFirst({where:{requestId:id,id:data.cursor}}):null;
      if(data.cursor&&!anchor)fail(404,'NOT_FOUND','Run cursor is unavailable.');
      return pageResult(await db.recommendationRun.findMany({where:{requestId:id,...(anchor?{OR:[{requestVersion:{lt:anchor.requestVersion}},{requestVersion:anchor.requestVersion,createdAt:{lt:anchor.createdAt}},{requestVersion:anchor.requestVersion,createdAt:anchor.createdAt,id:{lt:anchor.id}}]}:{})},orderBy:[{requestVersion:'desc'},{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),data.limit);
    });
  }
  @Post("admin/requests/:id/presentations") async publish(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    const data = parse(
      z
        .object({
          expectedVersion: version,
          runId: uuid,
          candidateIds: z.array(uuid).min(1).max(10),
          reason: text(500),
        })
        .strict(),
      body,
    );
    if (new Set(data.candidateIds).size !== data.candidateIds.length)
      fail(
        400,
        "DUPLICATE_CANDIDATE",
        "Presentation order must contain distinct candidates.",
      );
    return this.service.once(
      req,
      actor,
      "matching.publish",
      data,
      async (db) => {
        const request = await this.request(db, actor, id);
        if (request.version !== data.expectedVersion)
          fail(409, "CONFLICT", "Request changed.");
        const run = await db.recommendationRun.findUnique({
            where: { id: data.runId },
          }),
          latest = await db.recommendationRun.findFirst({
            where: { requestId: id },
            orderBy: [{requestVersion:"desc"},{createdAt:"desc"},{id:"desc"}],
          });
        if (!run || run.requestId !== id || latest?.id !== run.id)
          fail(
            409,
            "STALE_RUN",
            "Only the current matching run can be presented.",
          );
        const child = await db.child.findUniqueOrThrow({
            where: { id: request.childId },
          }),
          items = [];
        const owned = await db.recommendation.findMany({
          where: {
            id: { in: data.candidateIds },
            requestId: id,
            runId: run.id,
          },
        });
        if (owned.length !== data.candidateIds.length)
          fail(409, "CANDIDATE_CHANGED", "Candidates must belong to this run.");
        for (const teacherId of [
          ...new Set(owned.map((c) => c.teacherId)),
        ].sort())
          await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${teacherId},0))`;
        await db.recommendation.updateMany({where:{requestId:id,runId:run.id,presentedAt:{not:null}},data:{presentedAt:null,position:null,version:{increment:1}}});
        for (const [position, candidateId] of data.candidateIds.entries()) {
          const candidate = await db.recommendation.findUnique({
            where: { id: candidateId },
          });
          if (
            !candidate ||
            candidate.requestId !== id ||
            candidate.runId !== run.id ||
            !candidate.expiresAt ||
            candidate.expiresAt <= new Date()
          )
            fail(409, "CANDIDATE_CHANGED", "Candidate changed or expired.");
          await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.teacherId},0))`;
          const teacher = await db.teacher.findUniqueOrThrow({
            where: { id: candidate.teacherId },
          });
          if (!(await matched(db, request, child, teacher)))
            fail(409, "INELIGIBLE", "Recheck failed; rerun matching.");
          items.push(
            await db.recommendation.update({
              where: { id: candidate.id },
              data: {
                presentedAt: new Date(),
                position: position + 1,
                version: { increment: 1 },
              },
            }),
          );
        }
        const presentation = await db.recommendationPresentation.create({
          data: {
            runId: run.id,
            requestId: id,
            actorId: actor.id,
            candidateIds: data.candidateIds,
            kind: "OPERATOR_PUBLISHED",
            reason: data.reason,
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "SHORTLIST_PUBLISHED",
          id,
          data.reason,
          undefined,
          { presentationId: presentation.id, candidateIds: data.candidateIds },
        );
        return { items, presentationId: presentation.id, runId: run.id };
      },
    );
  }
  @Post("requests/:id/presentations") async exposure(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN"]);
    const data = parse(
      z
        .object({ runId: uuid, candidateIds: z.array(uuid).min(1).max(10) })
        .strict(),
      body,
    );
    if(new Set(data.candidateIds).size!==data.candidateIds.length)fail(400,'DUPLICATE_CANDIDATE','Exposure must contain distinct candidates.');
    return this.service.once(
      req,
      actor,
      "matching.exposure",
      data,
      async (db) => {
        const request = await this.request(db, actor, id);
        const child = await db.child.findUniqueOrThrow({
          where: { id: request.childId },
        });
        for (const candidateId of data.candidateIds) {
          const candidate = await db.recommendation.findUnique({
            where: { id: candidateId },
          });
          if (
            !candidate ||
            candidate.requestId !== id ||
            candidate.runId !== data.runId ||
            !candidate.presentedAt ||
            !candidate.expiresAt ||
            candidate.expiresAt <= new Date()
          )
            fail(
              409,
              "CANDIDATE_CHANGED",
              "Only current published candidates can be marked shown.",
            );
          const teacher = await db.teacher.findUniqueOrThrow({
            where: { id: candidate.teacherId },
          });
          if (!(await matched(db, request, child, teacher)))
            fail(409, "INELIGIBLE", "Candidate is no longer eligible.");
        }
        return db.recommendationPresentation.create({
          data: {
            runId: data.runId,
            requestId: id,
            actorId: actor.id,
            candidateIds: data.candidateIds,
            kind: "GUARDIAN_SHOWN",
            reason: "Guardian client confirmed rendered candidates",
          },
        });
      },
    );
  }
  @Post("candidates/:id/responses") async response(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["TEACHER"]);
    const data = parse(
      z
        .object({
          expectedVersion: version,
          response: z.enum(["ACCEPTED", "DECLINED"]),
        })
        .strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "candidate.respond",
      data,
      async (db) => {
        const candidate = await db.recommendation.findUnique({ where: { id } }),
          teacher = await db.teacher.findUnique({
            where: { accountId: actor.id },
          });
        if (!candidate || candidate.teacherId !== teacher?.id)
          fail(404, "NOT_FOUND", "Opportunity not found.");
        let request = await db.tuitionRequest.findUniqueOrThrow({
          where: { id: candidate.requestId },
        });
        await this.service.guardian(db, request.guardianId);
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${teacher.id},0))`;
        const current = await db.recommendation.findUniqueOrThrow({
          where: { id },
        });
        const child = await db.child.findUniqueOrThrow({
          where: { id: request.childId },
        });
        if (
          request.status !== "OPEN" ||
          current.version !== data.expectedVersion ||
          !current.runId ||
          !current.expiresAt ||
          current.expiresAt <= new Date() ||
          current.response !== "PENDING"
        )
          fail(
            409,
            "CONFLICT",
            "Opportunity changed, expired or already answered.",
          );
        const liveTeacher = await db.teacher.findUniqueOrThrow({
          where: { id: teacher.id },
        });
        if (!(await matched(db, request, child, liveTeacher)))
          fail(409, "INELIGIBLE", "Opportunity is no longer eligible.");
        const updated = await db.recommendation.update({
          where: { id },
          data: { response: data.response, version: { increment: 1 } },
        });
        await db.candidateDecision.create({
          data: {
            candidateId: id,
            runId: current.runId,
            actorId: actor.id,
            action: data.response,
            candidateVersion: updated.version,
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "CANDIDATE_RESPONSE",
          current.requestId,
          "Teacher answered assigned opportunity",
          undefined,
          {
            candidateId: id,
            response: data.response,
            version: updated.version,
          },
        );
        return updated;
      },
    );
  }
  @Post("requests/:id/selections") async select(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN"]);
    const data = parse(
      z
        .object({
          expectedVersion: version,
          candidateId: uuid,
          candidateVersion: version,
        })
        .strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "candidate.select",
      data,
      async (db) => {
        const request = await this.request(db, actor, id);
        if (request.version !== data.expectedVersion)
          fail(409, "CONFLICT", "Request changed.");
        const candidate = await db.recommendation.findUnique({
          where: { id: data.candidateId },
        });
        if (
          !candidate ||
          candidate.requestId !== id ||
          candidate.version !== data.candidateVersion ||
          !candidate.runId ||
          !candidate.presentedAt ||
          candidate.response !== "ACCEPTED" ||
          !candidate.expiresAt ||
          candidate.expiresAt <= new Date()
        )
          fail(
            409,
            "CANDIDATE_CHANGED",
            "Select a current published, accepted candidate.",
          );
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${candidate.teacherId},0))`;
        const teacher = await db.teacher.findUniqueOrThrow({
            where: { id: candidate.teacherId },
          }),
          child = await db.child.findUniqueOrThrow({
            where: { id: request.childId },
          });
        if (!(await matched(db, request, child, teacher)))
          fail(409, "INELIGIBLE", "Candidate is no longer eligible.");
        const decision = await db.candidateDecision.create({
          data: {
            candidateId: candidate.id,
            runId: candidate.runId,
            actorId: actor.id,
            action: "GUARDIAN_SELECTED",
            candidateVersion: candidate.version,
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "GUARDIAN_CANDIDATE_SELECTED",
          id,
          "Guardian selected without automatic assignment",
          undefined,
          { decisionId: decision.id, candidateId: candidate.id },
        );
        const updated = await db.tuitionRequest.update({
          where: { id },
          data: {
            selectedCandidateId: candidate.id,
            version: { increment: 1 },
          },
        });
        return { ...decision, requestVersion: updated.version };
      },
    );
  }
}
@Module({ imports: [PersistenceModule], controllers: [MatchingController] })
export class MatchingModule {}
