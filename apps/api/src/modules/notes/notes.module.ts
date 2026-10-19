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
import { Account, Prisma, Teacher } from "@prisma/client";
import { Request } from "express";
import { z } from "zod";
import { pageQuery, pageBefore, pageResult } from "../../pagination";
import {
  AppService,
  PersistenceModule,
  HttpRequest,
  DB,
  uuid,
  version,
  text,
  fail,
  parse,
} from "../../shared";
const screened = (t: Teacher | null) =>
  !!t &&
  t.status === "APPROVED" &&
  t.screeningComplete &&
  !!t.screeningValidUntil &&
  t.screeningValidUntil > new Date();
@Controller("api/v1")
class NotesController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  get db() {
    return this.service.db;
  }
  async own(db: DB, actor: Account, id: string, learning = true) {
    if (learning) await this.service.guardian(db, actor.id);
    else await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
    const note = await db.note.findUnique({ where: { id } });
    if (!note || note.guardianId !== actor.id)
      fail(404, "NOT_FOUND", "Note not found.");
    if (learning) await this.service.child(db, actor, note.childId);
    return note;
  }
  async shared(db: DB, actor: Account, id: string) {
    const teacher = await db.teacher.findUnique({
        where: { accountId: actor.id },
      }),
      note = await db.note.findUnique({ where: { id } });
    if (!note || !screened(teacher) || note.sharedTeacherId !== teacher!.id)
      fail(404, "NOT_FOUND", "Shared note not found.");
    await this.service.guardian(db, note.guardianId);
    await this.service.child(db, actor, note.childId);
    if (
      !(await db.placement.count({
        where: {
          guardianId: note.guardianId,
          childId: note.childId,
          teacherId: teacher!.id,
          status: "ACTIVE",
        },
      }))
    )
      fail(404, "NOT_FOUND", "Shared note not found.");
    return note;
  }
  @Post("notes") async note(@Req() req: HttpRequest, @Body() body: unknown) {
    const actor = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z.object({ childId: uuid, text: text(5000) }).strict(),
        body,
      ),
      authorize = async (db: DB) => {
        await this.service.guardian(db, actor.id);
        await this.service.child(db, actor, data.childId);
      };
    return this.service.once(
      req,
      actor,
      "note.create",
      data,
      async (db) => db.note.create({ data: { ...data, guardianId: actor.id } }),
      authorize,
    );
  }
  @Post("notes/:id/updates") async update(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z.object({ expectedVersion: version, text: text(5000) }).strict(),
        body,
      );
    return this.service.once(
      req,
      actor,
      "note.update",
      data,
      async (db) => {
        const changed = await db.note.updateMany({
          where: { id, version: data.expectedVersion },
          data: {
            text: data.text,
            sharedTeacherId: null,
            acknowledgedAt: null,
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          fail(409, "CONFLICT", "Note changed. Refresh before saving edits.");
        await this.service.audit(
          db,
          actor,
          req,
          "NOTE_UPDATED_PRIVATE",
          id,
          "Guardian saved edits and withdrew previous sharing",
        );
        return db.note.findUniqueOrThrow({ where: { id } });
      },
      (db) => this.own(db, actor, id),
    );
  }
  @Post("notes/:id/shares") async share(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({ teacherId: uuid.nullable(), expectedVersion: version })
          .strict(),
        body,
      );
    const authorize = async (db: DB) => {
      const note = await this.own(db, actor, id, data.teacherId !== null);
      if (data.teacherId) {
        const teacher = await db.teacher.findUnique({
            where: { id: data.teacherId },
          }),
          owner = teacher
            ? await db.account.findUnique({ where: { id: teacher.accountId } })
            : null;
        if (
          !screened(teacher) ||
          !owner ||
          owner.disabled ||
          owner.role !== "TEACHER" ||
          !(await db.placement.count({
            where: {
              guardianId: actor.id,
              childId: note.childId,
              teacherId: data.teacherId,
              status: "ACTIVE",
            },
          }))
        )
          fail(
            403,
            "SHARING_FORBIDDEN",
            "Sharing requires an active placement with this teacher.",
          );
      }
    };
    return this.service.once(
      req,
      actor,
      "note.share",
      data,
      async (db) => {
        const changed = await db.note.updateMany({
          where: { id, version: data.expectedVersion },
          data: {
            sharedTeacherId: data.teacherId,
            acknowledgedAt: null,
            version: { increment: 1 },
          },
        });
        if (!changed.count) fail(409, "CONFLICT", "Note has changed.");
        await this.service.audit(
          db,
          actor,
          req,
          data.teacherId ? "NOTE_SHARED" : "NOTE_REVOKED",
          id,
          "Guardian sharing decision",
        );
        return db.note.findUniqueOrThrow({ where: { id } });
      },
      authorize,
    );
  }
  @Post("notes/:id/acknowledgements") async acknowledge(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["TEACHER"]),
      data = parse(z.object({ expectedVersion: version }).strict(), body);
    return this.service.once(
      req,
      actor,
      "note.acknowledge",
      data,
      async (db) => {
        const changed = await db.note.updateMany({
          where: { id, version: data.expectedVersion, acknowledgedAt: null },
          data: { acknowledgedAt: new Date(), version: { increment: 1 } },
        });
        if (!changed.count)
          fail(409, "CONFLICT", "Sharing changed or was acknowledged.");
        await this.service.audit(
          db,
          actor,
          req,
          "NOTE_SHARING_ACKNOWLEDGED",
          id,
          "Named teacher acknowledged the current shared note",
        );
        return db.note.findUniqueOrThrow({
          where: { id },
          select: { id: true, acknowledgedAt: true, version: true },
        });
      },
      (db) => this.shared(db, actor, id),
    );
  }
  @Get("notes") async notes(@Req() req: Request, @Query() query: unknown) {
    const actor = await this.service.actor(req, ["GUARDIAN", "TEACHER"]),
      data = parse(pageQuery, query);
    let where: Prisma.NoteWhereInput = { guardianId: actor.id };
    if (actor.role === "TEACHER") {
      const teacher = await this.db.teacher.findUnique({
        where: { accountId: actor.id },
      });
      if (!screened(teacher)) return { items: [], nextCursor: null };
      const placements = await this.db.placement.findMany({
          where: { teacherId: teacher!.id, status: "ACTIVE" },
        }),
        guardians = await this.db.account.findMany({
          where: {
            id: { in: placements.map((p) => p.guardianId) },
            verified: true,
            disabled: false,
            role: "GUARDIAN",
          },
          select: { id: true },
        }),
        consents = await this.db.consent.findMany({
          where: {
            guardianId: { in: guardians.map((g) => g.id) },
            withdrawnAt: null,
          },
        }),
        paused = await this.db.privacyRequest.findMany({
          where: {
            accountId: { in: guardians.map((g) => g.id) },
            kind: "DELETION",
            scope: { in: ["ACCOUNT", "CHILD"] },
            status: "PENDING",
          },
          select: { accountId: true },
        }),
        children = await this.db.child.findMany({
          where: { id: { in: placements.map((p) => p.childId) } },
          select: { id: true, guardianId: true, guardianVerificationId: true },
        }),
        proofs = await this.db.guardianVerification.findMany({
          where: {
            id: {
              in: children.flatMap((c) =>
                c.guardianVerificationId ? [c.guardianVerificationId] : [],
              ),
            },
            status: "APPROVED",
          },
          select: { id: true },
        });
      where = {
        sharedTeacherId: teacher!.id,
        childId: {
          in: placements
            .filter(
              (p) =>
                consents.some((c) => c.guardianId === p.guardianId) &&
                !paused.some((g) => g.accountId === p.guardianId) &&
                children.some(
                  (c) =>
                    c.id === p.childId &&
                    c.guardianId === p.guardianId &&
                    (!c.guardianVerificationId ||
                      proofs.some((v) => v.id === c.guardianVerificationId)),
                ),
            )
            .map((p) => p.childId),
        },
      };
    }
    const anchor = data.cursor
      ? await this.db.note.findFirst({
          where: { ...where, id: data.cursor },
          select: { id: true, createdAt: true },
        })
      : null;
    if (data.cursor && !anchor)
      fail(404, "NOT_FOUND", "Note cursor is unavailable.");
    const page = pageResult(
        await this.db.note.findMany({
          where: { ...where, ...pageBefore(anchor) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: data.limit + 1,
        }),
        data.limit,
      ),
      records = [];
    for (const note of page.items) {
      const { guardianId, ...record } = note,
        child = await this.db.child.findUniqueOrThrow({
          where: { id: note.childId },
          select: {
            alias: true,
            grade: true,
            board: true,
            guardianVerificationId: true,
          },
        }),
        { guardianVerificationId, ...learner } = child,
        profile = note.sharedTeacherId
          ? await this.db.teacher.findUnique({
              where: { id: note.sharedTeacherId },
            })
          : null;
      let sharingActive = actor.role === "TEACHER";
      if (actor.role === "GUARDIAN" && screened(profile)) {
        const consent = await this.db.consent.findUnique({
            where: { guardianId },
          }),
          owner = await this.db.account.findUnique({
            where: { id: profile!.accountId },
          }),
          placement = await this.db.placement.count({
            where: {
              guardianId,
              childId: note.childId,
              teacherId: profile!.id,
              status: "ACTIVE",
            },
          }),
          paused = await this.db.privacyRequest.count({
            where: {
              accountId: guardianId,
              kind: "DELETION",
              scope: { in: ["ACCOUNT", "CHILD"] },
              status: "PENDING",
            },
          }),
          proof = guardianVerificationId
            ? await this.db.guardianVerification.count({
                where: { id: guardianVerificationId, status: "APPROVED" },
              })
            : 1;
        sharingActive =
          actor.verified &&
          !!consent &&
          !consent.withdrawnAt &&
          !paused &&
          !!placement &&
          !!owner &&
          !owner.disabled &&
          owner.role === "TEACHER" &&
          !!proof;
      }
      records.push({
        ...record,
        learner,
        sharedTeacher: profile ? { id: profile.id, name: profile.name } : null,
        sharingActive,
      });
    }
    return { items: records, nextCursor: page.nextCursor };
  }
}
@Module({ imports: [PersistenceModule], controllers: [NotesController] })
export class NotesModule {}
