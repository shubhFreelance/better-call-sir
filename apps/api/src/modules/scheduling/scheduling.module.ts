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
import { availableIn, calendarSnapshot, slotStarts } from "./calendar";
const kinds = z.enum(["DEMO", "REVISION", "RECURRING", "CALL"]);
@Controller("api/v1")
class SchedulingController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  async owner(db: DB, actorId: string, id: string) {
    const teacher = await db.teacher.findUnique({ where: { id } });
    if (!teacher || teacher.accountId !== actorId)
      fail(404, "NOT_FOUND", "Teacher not found.");
    return teacher;
  }
  @Post("teachers/:id/availability") async create(
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
          kind: kinds,
          weekday: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
          timezone: z.literal("Asia/Kolkata"),
          validFrom: z.iso.date(),
          validUntil: z.iso.date(),
        })
        .strict(),
      body,
    );
    const validFrom = new Date(data.validFrom),
      validUntil = new Date(data.validUntil);
    if (
      data.endMinute <= data.startMinute ||
      validUntil < validFrom ||
      validUntil.getTime() > Date.now() + 365 * 86400000 ||
      validUntil < new Date(Date.now() - 86400000)
    )
      fail(
        400,
        "INVALID_PATTERN",
        "Use a positive weekly interval with current validity within one year.",
      );
    return this.service.once(
      req,
      actor,
      "availability.create",
      data,
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const teacher = await this.owner(db, actor.id, id);
        if (teacher.version !== data.expectedVersion)
          fail(409, "CONFLICT", "Teacher profile changed.");
        const { expectedVersion, ...pattern } = data;
        const created = await db.availabilityPattern.create({
          data: { ...pattern, validFrom, validUntil, teacherId: id },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "AVAILABILITY_DECLARED",
          id,
          "Teacher declared weekly availability",
          undefined,
          { patternId: created.id, kind: created.kind },
        );
        return created;
      },
    );
  }
  @Get("teachers/:id/calendar") async calendar(
    @Req() req: HttpRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["TEACHER"]);
    await this.owner(this.service.db, actor.id, id);
    return {
      patterns: await this.service.db.availabilityPattern.findMany({
        where: { teacherId: id },
        take: 50,
      }),
      exceptions: await this.service.db.availabilityException.findMany({
        where: { teacherId: id, active: true },
        take: 50,
      }),
    };
  }
  @Post("availability/:id/changes") async change(
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
          active: z.boolean(),
          reason: text(300),
        })
        .strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "availability.change",
      data,
      async (db) => {
        const pattern = await db.availabilityPattern.findUnique({
          where: { id },
        });
        if (!pattern) fail(404, "NOT_FOUND", "Pattern not found.");
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${pattern.teacherId},0))`;
        await this.owner(db, actor.id, pattern.teacherId);
        const changed = await db.availabilityPattern.updateMany({
          where: { id, version: data.expectedVersion },
          data: { active: data.active, version: { increment: 1 } },
        });
        if (!changed.count) fail(409, "CONFLICT", "Pattern changed.");
        await this.service.audit(
          db,
          actor,
          req,
          "AVAILABILITY_CHANGED",
          pattern.teacherId,
          data.reason,
          undefined,
          { patternId: id, active: data.active },
        );
        return db.availabilityPattern.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  @Post("teachers/:id/leave") async leave(
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
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
          reason: text(300),
        })
        .strict(),
      body,
    );
    const startsAt = new Date(data.startsAt),
      endsAt = new Date(data.endsAt);
    if (
      endsAt <= startsAt ||
      startsAt < new Date() ||
      endsAt.getTime() > Date.now() + 60 * 86400000
    )
      fail(
        400,
        "INVALID_TIME",
        "Leave must be a future interval within 60 days.",
      );
    return this.service.once(
      req,
      actor,
      "availability.leave",
      data,
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const teacher = await this.owner(db, actor.id, id);
        if (teacher.version !== data.expectedVersion)
          fail(409, "CONFLICT", "Teacher profile changed.");
        const collision = await db.reservation.findFirst({
          where: {
            teacherId: id,
            status: { in: ["HOLD", "CONFIRMED"] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        });
        if (collision)
          fail(
            409,
            "RESCHEDULE_REQUIRED",
            "An accepted or held booking must be explicitly resolved before adding overlapping leave.",
          );
        const exception = await db.availabilityException.create({
          data: { teacherId: id, startsAt, endsAt, reason: data.reason },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "TEACHER_LEAVE_DECLARED",
          id,
          data.reason,
          undefined,
          { exceptionId: exception.id },
        );
        return exception;
      },
    );
  }
  @Post("leave/:id/cancellations") async removeLeave(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["TEACHER"]);
    const data = parse(
      z.object({ expectedVersion: version, reason: text(300) }).strict(),
      body,
    );
    return this.service.once(req, actor, "leave.cancel", data, async (db) => {
      const exception = await db.availabilityException.findUnique({
        where: { id },
      });
      if (!exception) fail(404, "NOT_FOUND", "Leave not found.");
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${exception.teacherId},0))`;
      await this.owner(db, actor.id, exception.teacherId);
      const changed = await db.availabilityException.updateMany({
        where: { id, version: data.expectedVersion, active: true },
        data: { active: false, version: { increment: 1 } },
      });
      if (!changed.count) fail(409, "CONFLICT", "Leave changed.");
      await this.service.audit(
        db,
        actor,
        req,
        "TEACHER_LEAVE_CANCELLED",
        exception.teacherId,
        data.reason,
      );
      return db.availabilityException.findUniqueOrThrow({ where: { id } });
    });
  }
  @Post("teachers/:id/capacity") async settings(
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
          maxActiveStudents: z.number().int().min(1).max(100),
          travelAccepted: z.boolean(),
        })
        .strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "teacher.capacity",
      data,
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const teacher = await this.owner(db, actor.id, id);
        const placements = await db.placement.findMany({
          where: { teacherId: id, status: { in: ["ACTIVE", "TERMS_PENDING"] } },
          select: { childId: true },
        });
        if (
          new Set(placements.map((p) => p.childId)).size >
          data.maxActiveStudents
        )
          fail(
            409,
            "CAPACITY_COMMITTED",
            "Capacity cannot be reduced below committed students.",
          );
        const changed = await db.teacher.updateMany({
          where: { id, version: data.expectedVersion },
          data: {
            maxActiveStudents: data.maxActiveStudents,
            travelAccepted: data.travelAccepted,
            version: { increment: 1 },
          },
        });
        if (!changed.count) fail(409, "CONFLICT", "Teacher profile changed.");
        await this.service.audit(
          db,
          actor,
          req,
          "TEACHER_CAPACITY_CHANGED",
          id,
          "Teacher confirmed capacity and travel acceptance",
        );
        return db.teacher.findUniqueOrThrow({ where: { id } });
      },
    );
  }
  @Get("teachers/:id/availability") async publicSlots(
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    parse(uuid, id);
    const data = parse(
      z
        .object({
          kind: kinds.default("REVISION"),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
          duration: z.coerce.number().int().min(20).max(120).default(20),
          limit: z.coerce.number().int().min(1).max(50).default(50),
          cursor: z.iso.datetime({ offset: true }).optional(),
        })
        .strict(),
      query,
    );
    const startsAt = new Date(data.startsAt),
      endsAt = new Date(data.endsAt);
    if (
      endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 7 * 86400000 ||
      endsAt.getTime() > Date.now() + 60 * 86400000 ||
      startsAt < new Date()
    )
      fail(
        400,
        "INVALID_RANGE",
        "Query a future range of up to seven days within the 60-day horizon.",
      );
    const teacher = await this.service.db.teacher.findUnique({ where: { id } });
    if (
      !teacher ||
      teacher.status !== "APPROVED" ||
      !teacher.screeningComplete ||
      !teacher.screeningValidUntil ||
      teacher.screeningValidUntil <= new Date()
    )
      fail(404, "NOT_FOUND", "Teacher unavailable.");
    const cursor = data.cursor ? new Date(data.cursor) : null;
    if (cursor && (cursor < startsAt || cursor > endsAt))
      fail(400, "INVALID_CURSOR", "Cursor must belong to this query range.");
    const items = [];
    let nextCursor: string | null = null;
    const snapshot = await calendarSnapshot(
      this.service.db,
      id,
      data.kind,
      startsAt,
      endsAt,
    );
    for (const at of slotStarts(
      snapshot.patterns,
      startsAt,
      endsAt,
      data.duration,
    )) {
      if (cursor && at <= cursor) continue;
      const end = new Date(at.getTime() + data.duration * 60000),
        pattern = availableIn(snapshot, at, end);
      if (!pattern) continue;
      if (items.length === data.limit) {
        nextCursor = items[items.length - 1].startsAt;
        break;
      }
      items.push({
        teacherId: id,
        kind: data.kind,
        startsAt: at.toISOString(),
        endsAt: end.toISOString(),
        timezone: pattern.timezone,
      });
    }
    return { items, nextCursor, horizonDays: 60, timezone: "Asia/Kolkata" };
  }
}
@Module({ imports: [PersistenceModule], controllers: [SchedulingController] })
export class SchedulingModule {}
