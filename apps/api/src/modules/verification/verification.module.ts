import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  Inject,
} from "@nestjs/common";
import { Response } from "express";
import { Account, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as files from "@bcs/evidence";
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

export const checkKinds = [
  "IDENTITY",
  "QUALIFICATIONS",
  "CAPABILITY",
  "REFERENCES",
] as const;
export async function reviewed(
  db: DB,
  teacher: {
    id: string;
    profileRevision: number;
    boards: string[];
    grades: number[];
    subjects: string[];
  },
  now = new Date(),
) {
  const checks = await db.verificationCheck.findMany({
    where: {
      teacherId: teacher.id,
      profileRevision: teacher.profileRevision,
      result: "PASSED",
      validUntil: { gt: now },
    },
  });
  if (!checkKinds.every((kind) => checks.some((c) => c.kind === kind)))
    return null;
  const evidence = await db.evidence.findMany({
    where: { id: { in: checks.map((c) => c.evidenceId) }, status: "CLEAN" },
  });
  if (evidence.length !== new Set(checks.map((c) => c.evidenceId)).size)
    return null;
  return new Date(Math.min(...checks.map((c) => c.validUntil.getTime())));
}
@Controller("api/v1")
class VerificationController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  async teacher(db: DB, actor: Account, id: string, review = false) {
    const teacher = await db.teacher.findUnique({ where: { id } });
    if (
      !teacher ||
      (actor.role === "TEACHER"
        ? teacher.accountId !== actor.id
        : actor.role !== "ADMIN" && teacher.region !== actor.region)
    )
      fail(404, "NOT_FOUND", "Teacher not found.");
    if (review && teacher.accountId === actor.id)
      fail(403, "SELF_REVIEW", "You cannot review your own application.");
    return teacher;
  }
  @Post("teachers/:id/evidence") async upload(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["TEACHER"]);
    const data = parse(
      z
        .object({
          kind: z.enum(checkKinds),
          mediaType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
          contentBase64: z.string().min(4).max(6990512),
          expectedVersion: version,
        })
        .strict(),
      body,
    );
    const bytes = Buffer.from(data.contentBase64, "base64");
    if (
      bytes.toString("base64") !== data.contentBase64 ||
      !files.validContent(bytes, data.mediaType)
    )
      fail(
        400,
        "INVALID_FILE",
        "Upload a content-matching PDF, PNG or JPEG of at most 5 MiB.",
      );
    let written: string | undefined;
    try {
      return await this.service.once(
        req,
        actor,
        "evidence.upload",
        data,
        async (db) => {
          await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
          const teacher = await this.teacher(db, actor, id);
          if (
            teacher.version !== data.expectedVersion ||
            !["SUBMITTED", "CHANGES_REQUESTED"].includes(teacher.status)
          )
            fail(
              409,
              "CONFLICT",
              "Only the current pending application can receive evidence.",
            );
          const evidenceId = randomUUID();
          files.put(evidenceId, bytes);
          written = evidenceId;
          const evidence = await db.evidence.create({
            data: {
              id: evidenceId,
              teacherId: id,
              kind: data.kind,
              mediaType: data.mediaType,
              size: bytes.length,
              sha256: files.digest(bytes),
            },
          });
          await this.service.event(db, "evidence.scan_requested", evidence.id);
          await this.service.audit(
            db,
            actor,
            req,
            "EVIDENCE_UPLOADED",
            evidence.id,
            "Private evidence entered quarantine",
            undefined,
            { teacherId: id, kind: evidence.kind, status: evidence.status },
          );
          return evidence;
        },
      );
    } catch (error) {
      if (written) await this.service.db.evidence.findUnique({where:{id:written}}).then(row=>{if(!row)files.remove(written!);}).catch(()=>{});
      throw error;
    }
  }
  @Get("teachers/:id/evidence") async evidence(
    @Req() req: HttpRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, [
      "TEACHER",
      "ADMIN",
      "REVIEWER",
    ]);
    return this.service.db.$transaction(async (db) => {
      await this.teacher(db, actor, id);
      await this.service.audit(
        db,
        actor,
        req,
        "EVIDENCE_METADATA_READ",
        id,
        "Authorized private evidence review",
      );
      return {
        items: await db.evidence.findMany({
          where: { teacherId: id },
          orderBy: { uploadedAt: "desc" },
          take: 50,
        }),
      };
    });
  }
  @Get("evidence/:id/content") async content(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, [
      "TEACHER",
      "ADMIN",
      "REVIEWER",
    ]);
    const evidence = await this.service.db.$transaction(async (db) => {
      const evidence = await db.evidence.findUnique({ where: { id } });
      if (!evidence) fail(404, "NOT_FOUND", "Evidence not found.");
      await this.teacher(db, actor, evidence.teacherId);
      if (evidence.status !== "CLEAN")
        fail(
          409,
          "QUARANTINED",
          "Only scanner-cleared evidence can be downloaded.",
        );
      await this.service.audit(
        db,
        actor,
        req,
        "EVIDENCE_DOWNLOADED",
        id,
        "Authorized private evidence download",
      );
      return evidence;
    });
    let bytes: Buffer;
    try {
      bytes = files.read(id);
    } catch {
      fail(503, "STORAGE_UNAVAILABLE", "Private evidence is unavailable.");
    }
    if (files.digest(bytes) !== evidence.sha256)
      fail(
        503,
        "INTEGRITY_FAILURE",
        "Private evidence integrity check failed.",
      );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evidence-${id}.${evidence.mediaType === "application/pdf" ? "pdf" : evidence.mediaType === "image/png" ? "png" : "jpg"}"`,
    );
    res.type("application/octet-stream").send(bytes);
  }
  @Post("admin/evidence/:id/retries") async retry(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["ADMIN", "REVIEWER"]);
    const data = parse(
      z.object({ expectedVersion: version, reason: text(500) }).strict(),
      body,
    );
    return this.service.once(req, actor, "evidence.retry", data, async (db) => {
      const evidence = await db.evidence.findUnique({ where: { id } });
      if (!evidence) fail(404, "NOT_FOUND", "Evidence not found.");
      await this.teacher(db, actor, evidence.teacherId, true);
      const changed = await db.evidence.updateMany({
        where: { id, version: data.expectedVersion, status: "QUARANTINED" },
        data: { version: { increment: 1 } },
      });
      if (!changed.count)
        fail(409, "CONFLICT", "Evidence changed or is not quarantined.");
      await this.service.event(
        db,
        "evidence.scan_requested",
        id,
        data.expectedVersion + 1,
      );
      await this.service.audit(
        db,
        actor,
        req,
        "EVIDENCE_SCAN_RETRIED",
        id,
        data.reason,
      );
      return db.evidence.findUniqueOrThrow({ where: { id } });
    });
  }
  @Get("admin/teachers/:id/checks") async checks(
    @Req() req: HttpRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["ADMIN", "REVIEWER"]);
    return this.service.db.$transaction(async (db) => {
      await this.teacher(db, actor, id, true);
      return {
        items: await db.verificationCheck.findMany({
          where: { teacherId: id },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      };
    });
  }
  @Post("admin/teachers/:id/checks") async check(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, ["ADMIN", "REVIEWER"]);
    const coverage = z
      .object({
        subjects: z
          .array(z.enum(["Maths", "Science"]))
          .min(1)
          .max(2),
        boards: z
          .array(z.enum(["CBSE", "CGBSE"]))
          .min(1)
          .max(2),
        grades: z.array(z.number().int().min(6).max(10)).min(1).max(5),
      })
      .strict();
    const data = parse(
      z
        .object({
          expectedVersion: version,
          kind: z.enum(checkKinds),
          evidenceId: uuid,
          result: z.enum(["PASSED", "FAILED"]),
          reason: text(1000),
          validUntil: z.iso.datetime({ offset: true }),
          coverage: coverage.optional(),
        })
        .strict(),
      body,
    );
    return this.service.once(req, actor, "teacher.check", data, async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      const teacher = await this.teacher(db, actor, id, true);
      if (
        teacher.version !== data.expectedVersion ||
        !["SUBMITTED", "CHANGES_REQUESTED"].includes(teacher.status)
      )
        fail(409, "CONFLICT", "Application changed or is not awaiting review.");
      const evidence = await db.evidence.findUnique({
        where: { id: data.evidenceId },
      });
      if (
        !evidence ||
        evidence.teacherId !== id ||
        evidence.status !== "CLEAN" ||
        evidence.kind !== data.kind
      )
        fail(
          409,
          "EVIDENCE_REQUIRED",
          "The matching scanner-cleared private evidence is required.",
        );
      const validUntil = new Date(data.validUntil);
      if (
        validUntil <= new Date() ||
        validUntil.getTime() > Date.now() + 365 * 86400000
      )
        fail(
          400,
          "INVALID_VALIDITY",
          "Screening validity must be in the next 365 days.",
        );
      if (data.kind === "CAPABILITY") {
        if (
          !data.coverage ||
          !["subjects", "boards", "grades"].every(
            (key) =>
              JSON.stringify(
                [...teacher[key as "subjects" | "boards" | "grades"]].sort(),
              ) ===
              JSON.stringify(
                [
                  ...data.coverage![key as "subjects" | "boards" | "grades"],
                ].sort(),
              ),
          )
        )
          fail(
            400,
            "COVERAGE_MISMATCH",
            "Record checks for the full declared subject, board and grade coverage.",
          );
      } else if (data.coverage)
        fail(
          400,
          "INVALID_COVERAGE",
          "Coverage belongs only to a capability check.",
        );
      const check = await db.verificationCheck.create({
        data: {
          teacherId: id,
          reviewerId: actor.id,
          profileRevision: teacher.profileRevision,
          kind: data.kind,
          evidenceId: evidence.id,
          result: data.result,
          reason: data.reason,
          validUntil,
          ...(data.coverage
            ? { coverage: data.coverage as Prisma.InputJsonValue }
            : {}),
        },
      });
      await db.teacher.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.service.audit(
        db,
        actor,
        req,
        "TEACHER_CHECK_RECORDED",
        id,
        data.reason,
        undefined,
        {
          checkId: check.id,
          kind: check.kind,
          result: check.result,
          profileRevision: check.profileRevision,
        },
      );
      return check;
    });
  }
}
@Module({ imports: [PersistenceModule], controllers: [VerificationController] })
export class VerificationModule {}
