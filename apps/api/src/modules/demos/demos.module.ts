import {pageQuery,pageBefore,pageResult} from '../../pagination';
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
import { Account, Demo } from "@prisma/client";
import { z } from "zod";
import { matched } from "../matching/eligibility";
import { available } from "../scheduling/calendar";
import { mode as meetingMode } from "@bcs/meetings";
import {
  AppService,
  PersistenceModule,
  uuid,
  version,
  text,
  fail,
  parse,
  HttpRequest,
  DB,
} from "../../shared";

const slot = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  duration: z.number().int().min(20).max(40),
});
function interval(data: z.infer<typeof slot>) {
  const startsAt = new Date(data.startsAt),
    endsAt = new Date(startsAt.getTime() + data.duration * 60_000);
  if (
    startsAt.getTime() < Date.now() + 3_600_000 ||
    endsAt.getTime() > Date.now() + 60 * 86_400_000
  )
    fail(
      400,
      "INVALID_TIME",
      "Choose a demo between one hour and 60 days from now.",
    );
  return {
    startsAt,
    endsAt,
    expiresAt: new Date(Math.min(Date.now() + 86_400_000, startsAt.getTime())),
  };
}
@Controller("api/v1")
class DemosController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  async owned(db: DB, actor: Account, id: string, review = false) {
    const demo = await db.demo.findUnique({ where: { id } });
    const teacher =
      actor.role === "TEACHER"
        ? await db.teacher.findUnique({ where: { accountId: actor.id } })
        : null;
    if (
      !demo ||
      (!review &&
        (actor.role === "GUARDIAN"
          ? demo.guardianId !== actor.id
          : demo.teacherId !== teacher?.id))
    )
      fail(404, "NOT_FOUND", "Demo not found.");
    if (review && actor.role==="OPERATOR") {const request=await db.tuitionRequest.findUniqueOrThrow({where:{id:demo.requestId}});if(request.region!==actor.region) fail(404,"NOT_FOUND","Demo not found.");}
    await this.service.guardian(db, demo.guardianId);
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${demo.teacherId},0))`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    return db.demo.findUniqueOrThrow({ where: { id } });
  }
  async eligible(db: DB, demo: Pick<Demo, "requestId" | "teacherId">) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${demo.teacherId},0))`;
    const request = await db.tuitionRequest.findUniqueOrThrow({
      where: { id: demo.requestId },
    });
    const child = await db.child.findUniqueOrThrow({
      where: { id: request.childId },
    });
    const teacher = await db.teacher.findUniqueOrThrow({
      where: { id: demo.teacherId },
    });
    const candidate = await db.recommendation.findUnique({
      where: {
        requestId_teacherId: {
          requestId: demo.requestId,
          teacherId: demo.teacherId,
        },
      },
    });
    if (
      request.status !== "OPEN" ||
      !candidate ||
      candidate.response !== "ACCEPTED" ||
      !candidate.runId || !candidate.presentedAt || !candidate.expiresAt || candidate.expiresAt<=new Date() ||
      !await matched(db, request, child, teacher)
    )
      fail(
        409,
        "INELIGIBLE",
        "An eligible, accepted recommendation is required.",
      );
    return candidate;
  }
  async result(db: DB, demo: Demo) {
    return {
      ...demo,
      reservation: await db.reservation.findUniqueOrThrow({
        where: { id: demo.reservationId },
      }),
    };
  }
  @Get("demos") async list(@Req() req:HttpRequest,@Query() query:unknown) {
    const actor=await this.service.actor(req,['GUARDIAN','TEACHER','ADMIN','OPERATOR']),data=parse(pageQuery.extend({requestId:uuid.optional(),status:z.string().trim().min(1).max(40).optional()}),query),db=this.service.db;
    const teacher=actor.role==='TEACHER'?await db.teacher.findUnique({where:{accountId:actor.id}}):null;
    if(actor.role==='TEACHER'&&!teacher)return {items:[],nextCursor:null};
    const regionalRequests=actor.role==='OPERATOR'?await db.tuitionRequest.findMany({where:{region:actor.region},select:{id:true}}):[];
    const consent=await db.consent.findMany({where:{withdrawnAt:null,...(actor.role==='GUARDIAN'?{guardianId:actor.id}:{})},select:{guardianId:true}});
    // Eligibility filters precede the page limit so inaccessible demos cannot starve visible history.
    const where={AND:[{guardianId:{in:consent.map(c=>c.guardianId)}},...(actor.role==='GUARDIAN'?[{guardianId:actor.id}]:actor.role==='TEACHER'?[{teacherId:teacher!.id}]:actor.role==='OPERATOR'?[{requestId:{in:regionalRequests.map(r=>r.id)}}]:[]),...(data.requestId?[{requestId:data.requestId}]:[]),...(data.status?[{status:data.status}]:[])]};
    const anchor=data.cursor?await db.demo.findFirst({where:{...where,id:data.cursor},select:{id:true,createdAt:true}}):null;
    if(data.cursor&&!anchor)fail(404,'NOT_FOUND','Demo cursor is unavailable.');
    const page=pageResult(await db.demo.findMany({where:{...where,...pageBefore(anchor)},orderBy:[{createdAt:'desc'},{id:'desc'}],take:data.limit+1}),data.limit);
    return {items:await Promise.all(page.items.map(demo=>this.result(db,demo))),nextCursor:page.nextCursor};
  }
  @Post("demos") async propose(@Req() req: HttpRequest, @Body() body: unknown) {
    const actor = await this.service.actor(req, ["GUARDIAN"]);
    const data = parse(
      slot.extend({ requestId: uuid, teacherId: uuid }).strict(),
      body,
    );
    return this.service.once(req, actor, "demo.propose", data, async (db) => {
      await this.service.guardian(db, actor.id);
      const request = await db.tuitionRequest.findUnique({
        where: { id: data.requestId },
      });
      if (!request || request.guardianId !== actor.id)
        fail(404, "NOT_FOUND", "Request not found.");
      const candidate=await this.eligible(db, {
        requestId: data.requestId,
        teacherId: data.teacherId,
      });
      const preference=await db.teacher.findUniqueOrThrow({where:{id:data.teacherId},select:{demoOptIn:true}});
      if(preference.demoOptIn!==true)fail(409,'DEMO_NOT_OFFERED','This teacher has not opted in to demos. Review tuition terms instead.');
      const time=interval(data);
      const pattern=await available(db,data.teacherId,"DEMO",time.startsAt,time.endsAt);
      if (!pattern) fail(409,"SLOT_UNAVAILABLE","Choose a currently advertised free demo slot.");
      await db.reservation.updateMany({
        where: { teacherId:data.teacherId, status: "HOLD", expiresAt: { lt: new Date() } },
        data: { status: "EXPIRED", version: { increment: 1 } },
      });
      const reservation = await db.reservation.create({
        data: {
          teacherId: data.teacherId,
          guardianId: actor.id,
          childId: request.childId,
          kind: "DEMO",
          source:"ADVERTISED",sourceId:pattern.id,
          ...time,
        },
      });
      await db.candidateDecision.create({data:{candidateId:candidate.id,runId:candidate.runId!,actorId:actor.id,action:"DEMO_SELECTED",candidateVersion:candidate.version}});
      await db.tuitionRequest.update({where:{id:request.id},data:{selectedCandidateId:candidate.id,version:{increment:1}}});
      const demo = await db.demo.create({
        data: {
          requestId: data.requestId,
          teacherId: data.teacherId,
          guardianId: actor.id,
          reservationId: reservation.id,
        },
      });
      await this.service.audit(
        db,
        actor,
        req,
        "DEMO_PROPOSED",
        demo.id,
        "Guardian proposed demo",
      );
      await this.service.event(db, "demo.proposed", demo.id);
      return this.result(db, demo);
    });
  }
  @Post("demos/:id/acceptances") async accept(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN", "TEACHER"]);
    const data = parse(z.object({ expectedVersion: version }).strict(), body);
    return this.service.once(req, actor, "demo.accept", data, async (db) => {
      const demo = await this.owned(db, actor, id);
      await this.eligible(db, demo);
      const r = await db.reservation.findUniqueOrThrow({
        where: { id: demo.reservationId },
      });
      if (
        demo.version !== data.expectedVersion ||
        demo.status !== "PROPOSED" ||
        r.status !== "HOLD" ||
        !r.expiresAt ||
        r.expiresAt <= new Date()
      )
        fail(409, "CONFLICT", "The demo proposal changed or expired.");
      if (!await available(db,demo.teacherId,"DEMO",r.startsAt,r.endsAt,r.id,0)) fail(409,"SLOT_UNAVAILABLE","The demo slot is no longer available.");
      const updated = await db.demo.update({
        where: { id },
        data: {
          ...(actor.role === "GUARDIAN"
            ? { guardianAccepted: true }
            : { teacherAccepted: true }),
          version: { increment: 1 },
        },
      });
      if (updated.guardianAccepted && updated.teacherAccepted) {
        updated.status = "CONFIRMED";
        await db.demo.update({ where: { id }, data: { status: "CONFIRMED" } });
        const confirmed = await db.reservation.updateMany({
          where: { id: r.id, status: "HOLD", expiresAt: { gt: new Date() } },
          data: {
            status: "CONFIRMED",
            expiresAt: null,
            version: { increment: 1 },
          },
        });
        if (!confirmed.count)
          fail(409, "CONFLICT", "The demo hold expired. Propose a new time.");
        const meeting=await db.meeting.upsert({where:{reservationId:r.id},create:{reservationId:r.id,providerMode:meetingMode()},update:{status:"PENDING",joinUrl:null,providerSpaceId:null,failureCode:null,retryAt:null,providerMode:meetingMode(),version:{increment:1}}});
        await this.service.event(db,"meeting.create_requested",meeting.id,meeting.version);
      }
      await this.service.audit(
        db,
        actor,
        req,
        "DEMO_ACCEPTED",
        id,
        "Accepted current demo time",
        undefined,
        { version: updated.version, status: updated.status },
      );
      await this.service.event(db, "demo.accepted", id);
      return this.result(db, updated);
    });
  }
  @Post("demos/:id/reschedules") async reschedule(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN", "TEACHER"]);
    const data = parse(
      slot.extend({ expectedVersion: version, reason: text(300) }).strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "demo.reschedule",
      data,
      async (db) => {
        const demo = await this.owned(db, actor, id);
        await this.eligible(db, demo);
        const r = await db.reservation.findUniqueOrThrow({
          where: { id: demo.reservationId },
        });
        if (
          demo.version !== data.expectedVersion ||
          !["PROPOSED", "CONFIRMED"].includes(demo.status) ||
          r.startsAt <= new Date()
        )
          fail(409, "CONFLICT", "This demo cannot be rescheduled.");
        const time=interval(data);
        const pattern=await available(db,demo.teacherId,"DEMO",time.startsAt,time.endsAt,r.id);
        if (!pattern) fail(409,"SLOT_UNAVAILABLE","Choose a currently advertised free demo slot.");
        await db.reservation.updateMany({
          where: { teacherId:demo.teacherId, status: "HOLD", expiresAt: { lt: new Date() } },
          data: { status: "EXPIRED", version: { increment: 1 } },
        });
        await db.reservation.update({
          where: { id: r.id },
          data: {
            ...time,
            source:"ADVERTISED",sourceId:pattern.id,
            status: "HOLD",
            version: { increment: 1 },
          },
        });
        await db.meeting.updateMany({where:{reservationId:r.id},data:{status:"CANCELLED",joinUrl:null,version:{increment:1}}});
        const updated = await db.demo.update({
          where: { id },
          data: {
            status: "PROPOSED",
            guardianAccepted: false,
            teacherAccepted: false,
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "DEMO_RESCHEDULED",
          id,
          data.reason,
          {
            startsAt: r.startsAt.toISOString(),
            endsAt: r.endsAt.toISOString(),
          },
          { startsAt: data.startsAt, version: updated.version },
        );
        await this.service.event(db, "demo.rescheduled", id);
        return this.result(db, updated);
      },
    );
  }
  @Post("demos/:id/outcomes") async outcome(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN", "TEACHER"]);
    const data = parse(
      z
        .object({
          expectedVersion: version,
          outcome: z.enum(["COMPLETED", "NO_SHOW", "DISPUTED"]),
          reason: text(1000),
        })
        .strict(),
      body,
    );
    return this.service.once(req, actor, "demo.outcome", data, async (db) => {
      const demo = await this.owned(db, actor, id);
      const r = await db.reservation.findUniqueOrThrow({
        where: { id: demo.reservationId },
      });
      if (
        demo.version !== data.expectedVersion ||
        !["CONFIRMED", "COMPLETED"].includes(demo.status) ||
        r.endsAt > new Date()
      )
        fail(
          409,
          "CONFLICT",
          "Report an outcome after the confirmed demo ends.",
        );
      if (
        actor.role === "GUARDIAN"
          ? demo.guardianOutcome !== null
          : demo.teacherOutcome !== null
      )
        fail(
          409,
          "CONFLICT",
          "Your outcome has already been recorded. Contact support for corrections.",
        );
      const updated = await db.demo.update({
        where: { id },
        data: {
          ...(actor.role === "GUARDIAN"
            ? { guardianOutcome: data.outcome }
            : { teacherOutcome: data.outcome }),
          version: { increment: 1 },
        },
      });
      if (data.outcome !== "COMPLETED") {
        const support = await db.supportCase.create({
          data: {
            accountId: actor.id,
            category: "DEMO_DISPUTE",
            description: `Demo ${id}: ${data.outcome}. ${data.reason}`,
          },
        });
        updated.status = "DISPUTED";
        updated.supportCaseId = support.id;
      } else if (
        updated.guardianOutcome === "COMPLETED" &&
        updated.teacherOutcome === "COMPLETED"
      )
        updated.status = "COMPLETED";
      await db.demo.update({
        where: { id },
        data: { status: updated.status, supportCaseId: updated.supportCaseId },
      });
      if (updated.status !== "CONFIRMED")
        await db.reservation.update({
          where: { id: r.id },
          data: { status: "COMPLETED", version: { increment: 1 } },
        });
      await this.service.audit(
        db,
        actor,
        req,
        "DEMO_OUTCOME_RECORDED",
        id,
        data.reason,
        undefined,
        { outcome: data.outcome, status: updated.status },
      );
      await this.service.event(db, "demo.outcome_recorded", id);
      return this.result(db, updated);
    });
  }
  @Post("admin/demos/:id/reviews") async review(
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
          resolution: z.enum(["COMPLETED", "NOT_COMPLETED"]),
          reason: text(1000),
        })
        .strict(),
      body,
    );
    return this.service.once(req, actor, "demo.review", data, async (db) => {
      const demo = await this.owned(db, actor, id, true);
      if (
        demo.version !== data.expectedVersion ||
        demo.status !== "DISPUTED" ||
        !demo.supportCaseId
      )
        fail(
          409,
          "CONFLICT",
          "This dispute has changed or is not awaiting review.",
        );
      const updated = await db.demo.update({
        where: { id },
        data: { status: data.resolution, version: { increment: 1 } },
      });
      const support=await db.supportCase.findUniqueOrThrow({where:{id:demo.supportCaseId}});
      const changed=await db.supportCase.updateMany({where:{id:support.id,version:support.version,status:{not:'CLOSED'}},data:{status:'RESOLVED',resolution:data.reason,version:{increment:1}}});
      if(!changed.count)fail(409,'CONFLICT','Linked support case changed or is closed.');
      await db.caseUpdate.create({data:{caseId:support.id,actorId:actor.id,message:data.reason,internal:false}});
      await this.service.event(db,'case.triaged',support.id,support.version+1);
      await this.service.audit(
        db,
        actor,
        req,
        "DEMO_DISPUTE_REVIEWED",
        id,
        data.reason,
        { status: demo.status },
        { status: updated.status },
      );
      await this.service.event(db, "demo.reviewed", id);
      return this.result(db, updated);
    });
  }
  @Post("demos/:id/cancellations") async cancel(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN", "TEACHER"]);
    const data = parse(
      z.object({ expectedVersion: version, reason: text(300) }).strict(),
      body,
    );
    return this.service.once(req, actor, "demo.cancel", data, async (db) => {
      const demo = await this.owned(db, actor, id);
      const r = await db.reservation.findUniqueOrThrow({
        where: { id: demo.reservationId },
      });
      if (
        demo.version !== data.expectedVersion ||
        !["PROPOSED", "CONFIRMED"].includes(demo.status) ||
        r.startsAt <= new Date()
      )
        fail(409, "CONFLICT", "This demo cannot be cancelled.");
      const updated = await db.demo.update({
        where: { id },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      await db.reservation.update({
        where: { id: r.id },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      await db.meeting.updateMany({where:{reservationId:r.id},data:{status:"CANCELLED",joinUrl:null,version:{increment:1}}});
      await this.service.audit(
        db,
        actor,
        req,
        "DEMO_CANCELLED",
        id,
        data.reason,
      );
      await this.service.event(db, "demo.cancelled", id);
      return this.result(db, updated);
    });
  }
}
@Module({ imports: [PersistenceModule], controllers: [DemosController] })
export class DemosModule {}
