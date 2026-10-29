import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  HttpRequest,
  DB,
  parse,
  fail,
  uuid,
  version,
  text,
} from "../../shared";
import { capacity } from "../scheduling/calendar";
import { recentAdmin } from "../administration/authority";
import { pageQuery, pageBefore, pageResult } from "../../pagination";
import {
  placement,
  actions,
  nextStatus,
  displayStatus,
  pricesOrdered,
} from "./policy";
async function teacherFor(db: DB, accountId: string) {
  const t = await db.teacher.findUnique({ where: { accountId } });
  if (!t) fail(404, "NOT_FOUND", "Complete your teacher profile first.");
  return t;
}
async function lock(db: DB) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('teacher-promotions',0))`;
}
async function eligible(service: AppService, id: string) {
  const teacher = await service.db.teacher.findUnique({ where: { id } });
  if (
    !teacher ||
    !(await capacity(service.db, teacher)) ||
    (await service.db.privacyRequest.count({
      where: {
        accountId: teacher.accountId,
        kind: "DELETION",
        scope: "ACCOUNT",
        status: "PENDING",
      },
    })) ||
    !(await service.publicTeachers({ id }, 1)).length
  )
    fail(
      409,
      "PROMOTION_INELIGIBLE",
      "An approved teacher profile with current screening and coverage is required.",
    );
}
@Controller("api/v1")
class PromotionsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  @Get("promotion-plans") async plans() {
    return {
      items: await this.service.db.promotionPlan.findMany({
        orderBy: { amountPaise: "asc" },
      }),
      currency: "INR",
      paymentMode: "MANUAL_REVIEW",
      chargesEnabled: false,
    };
  }
  @Post("admin/promotion-plans/:id") async plan(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await recentAdmin(this.service, req);
    parse(placement, id);
    const data = parse(
      z
        .object({
          expectedVersion: version,
          amountPaise: z.number().int().min(100).max(1000000),
          days: z.number().int().min(1).max(30),
          enabled: z.boolean(),
          confirmed: z.literal(true),
        })
        .strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "promotion.plan:" + id,
      data,
      async (db) => {
        await lock(db);
        await recentAdmin(this.service, req, db);
        const row = await db.promotionPlan.findUnique({ where: { id } });
        if (!row || row.version !== data.expectedVersion)
          fail(
            409,
            "CONFLICT",
            "Promotion prices changed. Refresh and review again.",
          );
        const proposed = (await db.promotionPlan.findMany()).map((p) =>
          p.id === id ? { ...p, ...data } : p,
        );
        if (!pricesOrdered(proposed))
          fail(
            400,
            "PROMOTION_PRICE_ORDER",
            "Keep the daily search price below homepage, and homepage below subject spaces.",
          );
        const updated = await db.promotionPlan.update({
          where: { id },
          data: {
            amountPaise: data.amountPaise,
            days: data.days,
            enabled: data.enabled,
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "PROMOTION_PLAN_CHANGED",
          id,
          "Administrator changed promotion price or availability",
          row,
          updated,
        );
        return updated;
      },
    );
  }
  @Get("promotions") async list(
    @Req() req: HttpRequest,
    @Query() query: unknown,
  ) {
    const actor = await this.service.actor(req, ["TEACHER", "ADMIN"]),
      data = parse(
        pageQuery.extend({
          status: z
            .enum([
              "PENDING",
              "ACTIVE",
              "PAUSED",
              "REJECTED",
              "CANCELLED",
              "EXPIRED",
            ])
            .optional(),
        }),
        query,
      ),
      db = this.service.db;
    const t = actor.role === "TEACHER" ? await teacherFor(db, actor.id) : null,
      now = new Date();
    const where = {
      ...(t ? { teacherId: t.id } : {}),
      ...(data.status === "EXPIRED"
        ? { status: { in: ["ACTIVE", "PAUSED"] }, endsAt: { lte: now } }
        : data.status
          ? {
              status: data.status,
              ...(["ACTIVE", "PAUSED"].includes(data.status)
                ? { endsAt: { gt: now } }
                : {}),
            }
          : {}),
    };
    const anchor = data.cursor
      ? await db.teacherPromotion.findFirst({
          where: { ...where, id: data.cursor },
        })
      : null;
    if (data.cursor && !anchor)
      fail(404, "NOT_FOUND", "Promotion history boundary is unavailable.");
    const result = pageResult(
      await db.teacherPromotion.findMany({
        where: { ...where, ...pageBefore(anchor) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: data.limit + 1,
      }),
      data.limit,
    );
    const teachers = await db.teacher.findMany({
      where: { id: { in: result.items.map((r) => r.teacherId) } },
      select: { id: true, name: true, slug: true },
    });
    return {
      ...result,
      items: result.items.map((r) => ({
        ...r,
        status: displayStatus(r, now),
        teacherName: teachers.find((t) => t.id === r.teacherId)?.name || "",
        teacherSlug: teachers.find((t) => t.id === r.teacherId)?.slug || "",
      })),
    };
  }
  @Post("promotions") async create(
    @Req() req: HttpRequest,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, ["TEACHER"]),
      data = parse(
        z
          .object({
            placement,
            planVersion: version,
            confirmed: z.literal(true),
          })
          .strict(),
        body,
      );
    return this.service.once(
      req,
      actor,
      "promotion.create",
      data,
      async (db) => {
        await lock(db);
        const t = await teacherFor(db, actor.id);
        await eligible(this.service, t.id);
        const plan = await db.promotionPlan.findUnique({
          where: { id: data.placement },
        });
        if (!plan?.enabled || plan.version !== data.planVersion)
          fail(
            409,
            "CONFLICT",
            "Promotion prices changed. Refresh and review again.",
          );
        if (
          await db.teacherPromotion.count({
            where: {
              teacherId: t.id,
              placement: data.placement,
              OR: [
                { status: "PENDING" },
                {
                  status: { in: ["ACTIVE", "PAUSED"] },
                  endsAt: { gt: new Date() },
                },
              ],
            },
          })
        )
          fail(
            409,
            "PROMOTION_EXISTS",
            "You already have an open promotion for this placement.",
          );
        const row = await db.teacherPromotion.create({
          data: {
            teacherId: t.id,
            placement: plan.id,
            amountPaise: plan.amountPaise,
            days: plan.days,
            planVersion: plan.version,
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "PROMOTION_REQUESTED",
          row.id,
          "Teacher requested a sponsored placement",
        );
        await this.service.event(
          db,
          "promotion.requested",
          row.id,
          row.version,
        );
        return row;
      },
    );
  }
  @Post("promotions/:id/decision") async decide(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, ["TEACHER", "ADMIN"]);
    parse(uuid, id);
    const data = parse(
      z
        .object({
          expectedVersion: version,
          action: actions,
          reason: text(300),
          paymentReference: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{5,99}$/)
            .optional(),
          paymentConfirmed: z.literal(true).optional(),
          confirmed: z.literal(true),
        })
        .strict(),
      body,
    );
    return this.service.once(
      req,
      actor,
      "promotion.decision:" + id,
      data,
      async (db) => {
        await lock(db);
        const admin = actor.role === "ADMIN";
        if (admin) await recentAdmin(this.service, req, db);
        const row = await db.teacherPromotion.findUnique({ where: { id } });
        const t = admin ? null : await teacherFor(db, actor.id);
        if (!row || (!admin && row.teacherId !== t!.id))
          fail(404, "NOT_FOUND", "Promotion unavailable.");
        if (row.version !== data.expectedVersion)
          fail(
            409,
            "CONFLICT",
            "The promotion changed. Refresh and review again.",
          );
        const status = nextStatus(displayStatus(row), data.action, admin);
        if (!status)
          fail(
            409,
            "INVALID_PROMOTION_TRANSITION",
            "This promotion action is unavailable.",
          );
        if (data.action === "RESUME" && row.pausedByAdmin && !admin)
          fail(
            403,
            "PROMOTION_STAFF_PAUSED",
            "Staff paused this campaign. Contact support before resuming.",
          );
        if (status === "ACTIVE") await eligible(this.service, row.teacherId);
        if (data.action === "APPROVE") {
          if (!data.paymentConfirmed || !data.paymentReference)
            fail(
              400,
              "PAYMENT_REVIEW_REQUIRED",
              "Confirm the full quoted payment and provide a unique reconciliation reference.",
            );
          if (
            await db.teacherPromotion.count({
              where: { paymentReference: data.paymentReference },
            })
          )
            fail(
              409,
              "PAYMENT_REFERENCE_USED",
              "This payment reference has already been recorded.",
            );
          if (
            (await db.teacherPromotion.count({
              where: {
                placement: row.placement,
                status: { in: ["ACTIVE", "PAUSED"] },
                endsAt: { gt: new Date() },
              },
            })) >= 100
          )
            fail(
              409,
              "PROMOTION_INVENTORY_FULL",
              "This placement is full. Keep this request pending.",
            );
        }
        if (
          data.action !== "APPROVE" &&
          (data.paymentReference || data.paymentConfirmed)
        )
          fail(
            400,
            "VALIDATION",
            "Payment confirmation is only used when approving a promotion.",
          );
        const start = new Date(),
          updated = await db.teacherPromotion.update({
            where: { id },
            data: {
              status,
              ...(data.action === "PAUSE"
                ? { pausedByAdmin: admin }
                : data.action === "RESUME"
                  ? { pausedByAdmin: false }
                  : {}),
              version: { increment: 1 },
              ...(admin ? { reviewerId: actor.id } : {}),
              reviewNote: data.reason,
              ...(data.action === "APPROVE"
                ? {
                    paymentReference: data.paymentReference,
                    startsAt: start,
                    endsAt: new Date(start.getTime() + row.days * 86400000),
                  }
                : {}),
            },
          });
        await this.service.audit(
          db,
          actor,
          req,
          "PROMOTION_" + data.action,
          id,
          "Teacher promotion state changed",
          { status: row.status },
          { status, amountPaise: row.amountPaise },
        );
        await this.service.event(
          db,
          "promotion." + data.action.toLowerCase(),
          id,
          updated.version,
        );
        return { ...updated, status: displayStatus(updated) };
      },
    );
  }
}
@Module({ imports: [PersistenceModule], controllers: [PromotionsController] })
export class PromotionsModule {}
