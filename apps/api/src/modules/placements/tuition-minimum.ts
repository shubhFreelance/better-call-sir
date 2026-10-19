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
import type { Account, TuitionMinimum } from "@prisma/client";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  DB,
  HttpRequest,
  uuid,
  version,
  text,
  parse,
  fail,
  hash,
} from "../../shared";
import { studentAuthority } from "../learners/student-authority";
import { recordedFee } from "../administration/commercial-policy";
const kinds = z.enum(["PLACEMENT", "INDEPENDENT"]);
const roles = [
  "GUARDIAN",
  "STUDENT",
  "INDEPENDENT_STUDENT",
  "TEACHER",
  "ADMIN",
  "OPERATOR",
];
const paging = z
  .object({
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
const command = z
  .object({ expectedVersion: version, confirmed: z.literal(true) })
  .strict();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      s >= "2000-01-01" &&
      s <=
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()) &&
      Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
      new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s,
    "Use a valid date on or before today.",
  );
async function context(
  db: DB,
  service: AppService,
  req: HttpRequest,
  actor: Account,
  kind: string,
  id: string,
  write = false,
) {
  if (write && ["ADMIN", "OPERATOR"].includes(actor.role))
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-administration',0))`;
  const p =
    kind === "PLACEMENT"
      ? await db.placement.findUnique({ where: { id } })
      : null;
  const a =
    kind === "INDEPENDENT"
      ? await db.studentArrangement.findUnique({ where: { id } })
      : null;
  if (!p && !a) fail(404, "NOT_FOUND", "Arrangement not found.");
  const familyId = p?.guardianId ?? a!.studentAccountId,
    teacherId = p?.teacherId ?? a!.teacherId;
  if (write)
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${familyId},0))`;
  const teacher = await db.teacher.findUniqueOrThrow({
      where: { id: teacherId },
    }),
    region = p
      ? (
          await db.tuitionRequest.findUniqueOrThrow({
            where: { id: p.requestId },
          })
        ).region
      : a!.region;
  const isStaff =
    actor.role === "ADMIN" ||
    (actor.role === "OPERATOR" && actor.region === region);
  let family =
    actor.id === familyId &&
    (p ? actor.role === "GUARDIAN" : actor.role === "INDEPENDENT_STUDENT");
  let read =
    family ||
    (actor.role === "TEACHER" && teacher.accountId === actor.id) ||
    isStaff;
  if (p && actor.role === "STUDENT")
    read = !!(await db.child.count({
      where: { id: p.childId, studentAccountId: actor.id },
    }));
  if (a && actor.role === "GUARDIAN") {
    await studentAuthority(db, actor, a.studentAccountId);
    read = true;
  }
  if (!read) fail(404, "NOT_FOUND", "Arrangement not found.");
  if (write) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${teacherId},0))`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
  }
  const identity = await db.account.findUnique({ where: { id: actor.id } }),
    session = await db.session.findUnique({
      where: { accessHash: hash(req.cookies.bcs_access || "") },
    });
  if (
    !identity ||
    identity.disabled ||
    identity.role !== actor.role ||
    identity.region !== actor.region ||
    identity.authVersion !== actor.authVersion ||
    !session ||
    session.revoked ||
    session.rotated ||
    session.authVersion !== identity.authVersion ||
    session.accessExpiresAt <= new Date() ||
    session.expiresAt <= new Date()
  )
    fail(401, "SESSION_REVOKED", "Your access changed. Sign in again.");
  if (
    isStaff &&
    (!session.mfaVerifiedAt ||
      session.mfaVerifiedAt.getTime() < Date.now() - 300000)
  )
    fail(
      403,
      "MFA_REQUIRED",
      "Verify your authenticator again before reviewing financial terms.",
    );
  const current = p
    ? await db.placement.findUniqueOrThrow({ where: { id } })
    : await db.studentArrangement.findUniqueOrThrow({ where: { id } });
  return {
    p,
    a,
    current,
    familyId,
    teacher,
    region,
    family,
    isStaff,
    canDecide:
      family || (actor.role === "TEACHER" && teacher.accountId === actor.id),
  };
}
async function financial(
  db: DB,
  service: AppService,
  req: HttpRequest,
  actor: Account,
  kind: string,
  id: string,
) {
  const c = await context(db, service, req, actor, kind, id, true);
  if (!c.canDecide)
    fail(
      403,
      "FINANCIAL_OWNER_REQUIRED",
      "Only the account owner and teacher can confirm financial decisions.",
    );
  if (c.p) {
    await service.guardian(db, c.familyId);
    if (
      (await db.account.findUniqueOrThrow({ where: { id: c.familyId } }))
        .role !== "GUARDIAN"
    )
      fail(
        403,
        "ACCESS_PAUSED",
        "Financial decisions are paused. Use support.",
      );
    await service.child(
      db,
      await db.account.findUniqueOrThrow({ where: { id: c.familyId } }),
      c.p.childId,
    );
  } else {
    const owner = await db.account.findUniqueOrThrow({
      where: { id: c.familyId },
    });
    if (
      owner.disabled ||
      owner.role !== "INDEPENDENT_STUDENT" ||
      (await db.privacyRequest.count({
        where: {
          accountId: c.familyId,
          kind: "DELETION",
          scope: "ACCOUNT",
          status: "PENDING",
        },
      }))
    )
      fail(
        403,
        "ACCESS_PAUSED",
        "Financial decisions are paused. Use support.",
      );
  }
  return c;
}
async function agreement(db: DB, id: string, expectedVersion?: number) {
  const m = await db.tuitionMinimum.findUnique({ where: { resourceId: id } });
  if (!m)
    fail(
      409,
      "LEGACY_MINIMUM_UNAVAILABLE",
      "This arrangement has no agreed minimum. No retroactive charge applies.",
    );
  if (expectedVersion !== undefined && m.version !== expectedVersion)
    fail(409, "CONFLICT", "Minimum tuition changed. Refresh before deciding.");
  return m;
}
async function totals(db: DB, m: TuitionMinimum) {
  const creditedPaise =
    (
      await db.tuitionCredit.aggregate({
        where: { minimumId: m.id, status: "CONFIRMED" },
        _sum: { amountPaise: true },
      })
    )._sum.amountPaise ?? 0;
  const commenced = !!m.familyConfirmedAt && !!m.teacherConfirmedAt,
    pendingReview = !!(await db.tuitionMinimumReview.count({
      where: { minimumId: m.id, status: "PENDING" },
    })),
    obligationPaise = commenced ? m.adjustedPaise : 0;
  return {
    commenced,
    creditedPaise,
    obligationPaise,
    outstandingPaise: Math.max(0, obligationPaise - creditedPaise),
    refundAssessmentPaise: Math.max(0, creditedPaise - obligationPaise),
    pendingReview,
    endsOn: commenced
      ? new Date(
          new Date(m.commencementDate! + "T00:00:00Z").getTime() +
            m.days * 86400000,
        )
          .toISOString()
          .slice(0, 10)
      : null,
  };
}
@Controller("api/v1")
class TuitionMinimumController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  @Get("tuition-minimums/:kind/:id") async read(
    @Req() req: HttpRequest,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    const actor = await this.service.actor(req, roles);
    parse(kinds, kind);
    parse(uuid, id);
    const q = parse(
      z
        .object({
          creditsCursor: uuid.optional(),
          reviewsCursor: uuid.optional(),
          limit: z.coerce.number().int().min(1).max(50).default(10),
        })
        .strict(),
      query,
    );
    return this.service.db.$transaction(async (db) => {
      const c = await context(db, this.service, req, actor, kind, id, true),
        m = await db.tuitionMinimum.findUnique({ where: { resourceId: id } });
      const financialContext = {
        teacherName: c.teacher.name,
        learnerName: c.p
          ? (await db.child.findUniqueOrThrow({ where: { id: c.p.childId } }))
              .alias
          : (await db.account.findUniqueOrThrow({ where: { id: c.familyId } }))
              .name,
        subject: c.p
          ? (
              await db.tuitionRequest.findUniqueOrThrow({
                where: { id: c.p.requestId },
              })
            ).subject
          : String(
              (c.a!.terms as Record<string, unknown>).subject || "Tuition",
            ),
      };
      const learningAccepted =
        "guardianAccepted" in c.current
          ? c.current.guardianAccepted && c.current.teacherAccepted
          : !!c.current.studentAcceptedAt && !!c.current.teacherAcceptedAt;
      const startGate =
        c.current.status === "CLOSED"
          ? "CLOSED"
          : learningAccepted
            ? "READY"
            : "TERMS_PENDING";
      if (!m)
        return {
          id,
          available: false,
          startGate,
          context: financialContext,
          agreement: null,
          summary: null,
          pendingReview: null,
          canDecide: false,
          canReview: false,
          credits: [],
          creditsNextCursor: null,
          reviews: [],
          reviewsNextCursor: null,
        };
      for (const [cursor, table] of [
        [q.creditsCursor, db.tuitionCredit],
        [q.reviewsCursor, db.tuitionMinimumReview],
      ] as const)
        if (
          cursor &&
          !(await (table as typeof db.tuitionCredit).count({
            where: { id: cursor, minimumId: m.id },
          }))
        )
          fail(404, "NOT_FOUND", "History cursor not found.");
      const credits = await db.tuitionCredit.findMany({
          where: { minimumId: m.id },
          orderBy: { id: "asc" },
          take: q.limit + 1,
          ...(q.creditsCursor
            ? { cursor: { id: q.creditsCursor }, skip: 1 }
            : {}),
        }),
        reviews = await db.tuitionMinimumReview.findMany({
          where: { minimumId: m.id },
          orderBy: { id: "asc" },
          take: q.limit + 1,
          ...(q.reviewsCursor
            ? { cursor: { id: q.reviewsCursor }, skip: 1 }
            : {}),
        });
      if (c.isStaff)
        await this.service.audit(
          db,
          actor,
          req,
          "TUITION_MINIMUM_READ",
          m.id,
          "Staff inspected frozen financial terms",
        );
      return {
        id,
        available: true,
        startGate,
        context: financialContext,
        agreement: m,
        summary: await totals(db, m),
        pendingReview: await db.tuitionMinimumReview.findFirst({
          where: { minimumId: m.id, status: "PENDING" },
        }),
        canDecide: c.canDecide,
        canReview: c.isStaff,
        credits: credits.slice(0, q.limit),
        creditsNextCursor:
          credits.length > q.limit ? credits[q.limit - 1].id : null,
        reviews: reviews.slice(0, q.limit),
        reviewsNextCursor:
          reviews.length > q.limit ? reviews[q.limit - 1].id : null,
      };
    });
  }
  @Post("tuition-minimums/:kind/:id/commencements") async start(
    @Req() req: HttpRequest,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, roles);
    parse(kinds, kind);
    parse(uuid, id);
    const data = parse(
      command.extend({
        action: z.enum(["CONFIRM", "WITHDRAW"]),
        commencementDate: date,
      }),
      body,
    );
    return this.service.once(
      req,
      actor,
      "tuition.commencement",
      data,
      async (db) => {
        const c = await financial(db, this.service, req, actor, kind, id),
          m = await agreement(db, id, data.expectedVersion);
        if (
          c.current.status === "CLOSED" ||
          (m.familyConfirmedAt && m.teacherConfirmedAt)
        )
          fail(409, "CONFLICT", "Commencement is closed or already confirmed.");
        if (
          c.p
            ? !(
                "guardianAccepted" in c.current &&
                c.current.guardianAccepted &&
                c.current.teacherAccepted
              )
            : !(
                "studentAcceptedAt" in c.current &&
                c.current.studentAcceptedAt &&
                c.current.teacherAcceptedAt
              )
        )
          fail(
            409,
            "TERMS_PENDING",
            "Both parties must accept learning terms first.",
          );
        const own = c.family ? "familyConfirmedAt" : "teacherConfirmedAt";
        if (
          data.action === "CONFIRM" &&
          (await db.tuitionMinimumReview.count({
            where: { minimumId: m.id, status: "PENDING" },
          }))
        )
          fail(
            409,
            "SAFETY_REVIEW_PENDING",
            "Staff must assess the open safety or non-delivery issue before financial commencement.",
          );
        if (data.action === "WITHDRAW") {
          if (!m[own] || m.commencementDate !== data.commencementDate)
            fail(
              409,
              "CONFLICT",
              "Only your pending start confirmation can be withdrawn.",
            );
          const updated = await db.tuitionMinimum.update({
            where: { id: m.id },
            data: {
              [own]: null,
              commencementDate: null,
              version: { increment: 1 },
            },
          });
          await this.service.audit(
            db,
            actor,
            req,
            "TUITION_START_WITHDRAWN",
            id,
            "Pending financial commencement withdrawn",
          );
          return updated;
        }
        if (
          m[own] ||
          (m.commencementDate && m.commencementDate !== data.commencementDate)
        )
          fail(
            409,
            "CONFLICT",
            "Review the proposed commencement date with the other party.",
          );
        const owner = await db.account.findUniqueOrThrow({
          where: { id: c.teacher.accountId },
        });
        if (
          owner.disabled ||
          owner.role !== "TEACHER" ||
          c.teacher.status !== "APPROVED" ||
          !c.teacher.screeningComplete ||
          !c.teacher.screeningValidUntil ||
          c.teacher.screeningValidUntil <= new Date()
        )
          fail(
            409,
            "ACCESS_PAUSED",
            "Teacher screening is not current. Use support.",
          );
        const updated = await db.tuitionMinimum.update({
          where: { id: m.id },
          data: {
            [own]: new Date(),
            commencementDate: data.commencementDate,
            version: { increment: 1 },
          },
        });
        if (updated.familyConfirmedAt && updated.teacherConfirmedAt) {
          if (c.p) {
            const p = await db.placement.findUniqueOrThrow({ where: { id } });
            await db.placement.update({
              where: { id },
              data: {
                guardianStarted: true,
                teacherReceiptConfirmed: true,
                status: "ACTIVE",
                startedAt: new Date(data.commencementDate + "T00:00:00Z"),
                version: { increment: 1 },
              },
            });
            if (recordedFee(p) > 0)
              await db.invoice.upsert({
                where: { placementId: id },
                create: {
                  placementId: id,
                  payerId: c.teacher.accountId,
                  amountPaise: recordedFee(p),
                  policyVersion: p.policyVersion,
                },
                update: {},
              });
          }
          await this.service.event(
            db,
            "tuition.commenced",
            id,
            updated.version,
          );
        }
        await this.service.audit(
          db,
          actor,
          req,
          "TUITION_START_CONFIRMED",
          id,
          "Participant confirmed actual teaching commencement and frozen minimum",
          undefined,
          { date: data.commencementDate, minimumPaise: m.minimumPaise },
        );
        return updated;
      },
      (db) => financial(db, this.service, req, actor, kind, id),
    );
  }
  @Post("tuition-minimums/:kind/:id/credits") async credit(
    @Req() req: HttpRequest,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, roles);
    parse(kinds, kind);
    parse(uuid, id);
    const data = parse(
      command.extend({
        amountPaise: z.number().int().min(1).max(2_000_000),
        paidOn: date,
        reference: text(80),
      }),
      body,
    );
    return this.service.once(
      req,
      actor,
      "tuition.credit",
      data,
      async (db) => {
        await financial(db, this.service, req, actor, kind, id);
        const m = await agreement(db, id, data.expectedVersion),
          s = await totals(db, m);
        if (!s.commenced || data.amountPaise > m.minimumPaise)
          fail(
            409,
            "INVALID_CREDIT",
            "Record only the paid portion toward this commenced minimum, including any advance payment.",
          );
        if (
          await db.tuitionCredit.count({
            where: { minimumId: m.id, reference: data.reference },
          })
        )
          fail(409, "CONFLICT", "That payment reference is already recorded.");
        const credit = await db.tuitionCredit.create({
          data: {
            minimumId: m.id,
            proposerId: actor.id,
            amountPaise: data.amountPaise,
            paidOn: data.paidOn,
            reference: data.reference,
          },
        });
        await db.tuitionMinimum.update({
          where: { id: m.id },
          data: { version: { increment: 1 } },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "TUITION_CREDIT_PROPOSED",
          id,
          "Payment awaits the other financial party confirmation",
          undefined,
          { creditId: credit.id, amountPaise: data.amountPaise },
        );
        return credit;
      },
      (db) => financial(db, this.service, req, actor, kind, id),
    );
  }
  @Post("tuition-minimums/:kind/:id/credits/:creditId/decisions")
  async creditDecision(
    @Req() req: HttpRequest,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Param("creditId") creditId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, roles);
    parse(kinds, kind);
    parse(uuid, id);
    parse(uuid, creditId);
    const data = parse(
      command.extend({ decision: z.enum(["CONFIRM", "REJECT"]) }),
      body,
    );
    return this.service.once(
      req,
      actor,
      "tuition.credit.decide",
      data,
      async (db) => {
        await financial(db, this.service, req, actor, kind, id);
        const m = await agreement(db, id, data.expectedVersion),
          credit = await db.tuitionCredit.findFirst({
            where: { id: creditId, minimumId: m.id },
          });
        if (!credit) fail(404, "NOT_FOUND", "Payment credit not found.");
        if (credit.status !== "PENDING" || credit.proposerId === actor.id)
          fail(
            409,
            "CONFLICT",
            "Only the other financial party can decide a pending credit.",
          );
        const s = await totals(db, m);
        if (
          data.decision === "CONFIRM" &&
          s.creditedPaise + credit.amountPaise > m.minimumPaise
        )
          fail(
            409,
            "INVALID_CREDIT",
            "Confirmed credits cannot exceed the original minimum.",
          );
        const updated = await db.tuitionCredit.update({
          where: { id: creditId },
          data: {
            status: data.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED",
            confirmerId: actor.id,
            decidedAt: new Date(),
          },
        });
        await db.tuitionMinimum.update({
          where: { id: m.id },
          data: { version: { increment: 1 } },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "TUITION_CREDIT_DECIDED",
          id,
          "Other financial party decided the payment credit",
          undefined,
          { creditId, decision: data.decision },
        );
        return updated;
      },
      (db) => financial(db, this.service, req, actor, kind, id),
    );
  }
  @Post("tuition-minimums/:kind/:id/reviews") async review(
    @Req() req: HttpRequest,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, roles);
    parse(kinds, kind);
    parse(uuid, id);
    const data = parse(
      command.extend({
        reason: z.enum(["SAFETY", "NON_DELIVERY"]),
        description: text(3000),
      }),
      body,
    );
    const authorize = (db: DB) =>
      context(db, this.service, req, actor, kind, id, true).then((c) => {
        if (c.isStaff)
          fail(
            403,
            "PARTICIPANT_REQUIRED",
            "A participant must open the exception request.",
          );
        return c;
      });
    return this.service.once(
      req,
      actor,
      "tuition.review",
      data,
      async (db) => {
        const c = await authorize(db),
          m = await agreement(db, id, data.expectedVersion);
        if (
          await db.tuitionMinimumReview.count({
            where: { minimumId: m.id, status: "PENDING" },
          })
        )
          fail(409, "CONFLICT", "A staff assessment is already pending.");
        const support = await db.supportCase.create({
          data: {
            accountId: actor.id,
            region: c.region,
            ...(c.p
              ? { placementId: id }
              : { studentEnquiryId: c.a!.enquiryId }),
            category: data.reason === "SAFETY" ? "SAFETY" : "PAYMENT",
            description: data.description,
          },
        });
        const r = await db.tuitionMinimumReview.create({
          data: {
            minimumId: m.id,
            caseId: support.id,
            requesterId: actor.id,
            region: c.region,
            reason: data.reason,
          },
        });
        await db.tuitionMinimum.update({
          where: { id: m.id },
          data: { version: { increment: 1 } },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "TUITION_EXCEPTION_REQUESTED",
          id,
          "Participant requested staff assessment without blocking replacement",
          undefined,
          { reviewId: r.id, caseId: support.id },
        );
        await this.service.event(db, "case.created", support.id);
        return r;
      },
      authorize,
    );
  }
  @Get("admin/tuition-minimum-reviews") async queue(
    @Req() req: HttpRequest,
    @Query() query: unknown,
  ) {
    const actor = await this.service.actor(req, ["ADMIN", "OPERATOR"]),
      q = parse(
        paging.extend({ status: z.enum(["PENDING", "RESOLVED"]).optional() }),
        query,
      ),
      where = {
        ...(actor.role === "OPERATOR" ? { region: actor.region } : {}),
        ...(q.status ? { status: q.status } : {}),
      };
    if (
      q.cursor &&
      !(await this.service.db.tuitionMinimumReview.count({
        where: { ...where, id: q.cursor },
      }))
    )
      fail(404, "NOT_FOUND", "Review cursor not found.");
    const rows = await this.service.db.tuitionMinimumReview.findMany({
      where,
      orderBy: { id: "asc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = [];
    for (const r of rows.slice(0, q.limit)) {
      const m = await this.service.db.tuitionMinimum.findUniqueOrThrow({
        where: { id: r.minimumId },
      });
      items.push({ ...r, kind: m.kind, resourceId: m.resourceId });
    }
    return {
      items,
      nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
    };
  }
  @Post("admin/tuition-minimum-reviews/:reviewId/decisions") async decide(
    @Req() req: HttpRequest,
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
  ) {
    parse(uuid, reviewId);
    const actor = await this.service.actor(req, ["ADMIN", "OPERATOR"]),
      data = parse(
        command.extend({
          adjustedPaise: z.number().int().min(0).max(2_000_000),
          reason: text(1000),
        }),
        body,
      );
    const authorize = async (db: DB) => {
      const r = await db.tuitionMinimumReview.findUnique({
        where: { id: reviewId },
      });
      if (!r || (actor.role === "OPERATOR" && r.region !== actor.region))
        fail(404, "NOT_FOUND", "Assessment not found.");
      const m = await db.tuitionMinimum.findUniqueOrThrow({
          where: { id: r.minimumId },
        }),
        c = await context(
          db,
          this.service,
          req,
          actor,
          m.kind,
          m.resourceId,
          true,
        );
      if (
        actor.id === r.requesterId ||
        actor.id === c.familyId ||
        actor.id === c.teacher.accountId
      )
        fail(
          403,
          "INDEPENDENT_REVIEW_REQUIRED",
          "An independent staff member must assess this case.",
        );
      return { r, m, c };
    };
    return this.service.once(
      req,
      actor,
      "tuition.exception.decide",
      data,
      async (db) => {
        const { r, m } = await authorize(db);
        if (
          m.version !== data.expectedVersion ||
          r.status !== "PENDING" ||
          data.adjustedPaise > m.minimumPaise
        )
          fail(
            409,
            "CONFLICT",
            "Review changed or exceeds the agreed minimum.",
          );
        const updated = await db.tuitionMinimumReview.update({
          where: { id: reviewId },
          data: {
            status: "RESOLVED",
            reviewerId: actor.id,
            decisionReason: data.reason,
            adjustedPaise: data.adjustedPaise,
            decidedAt: new Date(),
          },
        });
        await db.tuitionMinimum.update({
          where: { id: m.id },
          data: {
            adjustedPaise: data.adjustedPaise,
            version: { increment: 1 },
          },
        });
        await db.supportCase.update({
          where: { id: r.caseId },
          data: {
            status: "RESOLVED",
            resolution: data.reason,
            version: { increment: 1 },
          },
        });
        await db.caseUpdate.create({
          data: {
            caseId: r.caseId,
            actorId: actor.id,
            message: data.reason,
            internal: false,
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "TUITION_EXCEPTION_DECIDED",
          m.resourceId,
          data.reason,
          undefined,
          {
            reviewId,
            adjustedPaise: data.adjustedPaise,
            noAutomaticRefund: true,
          },
        );
        await this.service.event(db, "case.updated", r.caseId);
        return updated;
      },
      authorize,
    );
  }
}
@Module({
  imports: [PersistenceModule],
  controllers: [TuitionMinimumController],
})
export class TuitionMinimumModule {}
