import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppService, HttpRequest, fail, hash, parse, uuid } from "../../shared";
import { visibleDirectEnquiry } from "../direct-enquiries/visibility";
import { activityDay, displayStatus } from "./policy";

const numbers = (row: Record<string, bigint | number>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
const metrics = Prisma.sql`count(*) FILTER (WHERE e.kind='CARD_CLICK') AS clicks,
 count(DISTINCT e."viewerId") FILTER (WHERE e.kind='CARD_CLICK' AND e.audience='GUARDIAN') AS parents,
 count(DISTINCT e."viewerId") FILTER (WHERE e.kind='CARD_CLICK' AND e.audience='STUDENT') AS students,
 count(*) FILTER (WHERE e.kind='PROFILE_VISIT') AS visits`;

@Controller("api/v1")
export class PromotionInsightsController {
  constructor(@Inject(AppService) private readonly service: AppService) {}

  @Post("promotion-activity") async record(
    @Req() req: HttpRequest,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, [
      "GUARDIAN",
      "STUDENT",
      "INDEPENDENT_STUDENT",
    ]);
    const data = parse(
      z
        .object({
          teacherId: uuid,
          promotionId: uuid.optional(),
          kind: z.enum(["CARD_CLICK", "PROFILE_VISIT"]),
        })
        .strict(),
      body,
    );
    if (data.kind === "CARD_CLICK" && !data.promotionId)
      fail(400, "VALIDATION", "A sponsored card is required.");
    await this.service.limit("promotion-activity:" + actor.id, 120);
    const now = new Date(),
      day = activityDay(now);
    return this.service.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
      const current = await db.account.findUnique({ where: { id: actor.id } });
      if (
        !current ||
        current.disabled ||
        current.authVersion !== actor.authVersion || current.role !== actor.role
      )
        fail(401, "SESSION_REVOKED", "This account is unavailable.");
      const student =
        actor.role === "STUDENT"
          ? await this.service.activeStudent(db, actor.id, true)
          : null;
      if (actor.role === "STUDENT" && !student)
        fail(403, "FORBIDDEN", "Student access is unavailable.");
      const owners = [actor.id, ...(student ? [student.guardianId] : [])];
      if (
        await db.privacyRequest.count({
          where: {
            accountId: { in: owners },
            kind: "DELETION",
            scope: { in: ["ACCOUNT", "CHILD"] },
            status: "PENDING",
          },
        })
      )
        return { recorded: false };
      if (
        actor.role === "GUARDIAN" &&
        (!current.verified ||
          !(await db.consent.count({
            where: { guardianId: actor.id, withdrawnAt: null },
          })))
      )
        return { recorded: false };
      if (
        !(await this.service.publicTeachers({ id: data.teacherId }, 1)).length
      )
        return { recorded: false };
      if (
        await db.privacyRequest.count({
          where: {
            kind: "DELETION",
            scope: "ACCOUNT",
            status: "PENDING",
            accountId: (
              await db.teacher.findUniqueOrThrow({
                where: { id: data.teacherId },
              })
            ).accountId,
          },
        })
      )
        return { recorded: false };
      if (data.promotionId) {
        const campaign = await db.teacherPromotion.findFirst({
          where: {
            id: data.promotionId,
            teacherId: data.teacherId,
            status: "ACTIVE",
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
        });
        if (
          !campaign ||
          !(await db.promotionPlan.count({
            where: { id: campaign.placement, enabled: true },
          }))
        )
          return { recorded: false };
      }
      const id = hash(
        [
          actor.id,
          data.teacherId,
          data.kind,
          data.kind === "CARD_CLICK" ? data.promotionId : "profile",
          day,
        ].join(":"),
      );
      const saved = await db.promotionActivity.createMany({
        data: [
          {
            id,
            ...data,
            viewerId: actor.id,
            audience: actor.role === "GUARDIAN" ? "GUARDIAN" : "STUDENT",
            day: new Date(day),
          },
        ],
        skipDuplicates: true,
      });
      return { recorded: saved.count > 0 };
    });
  }

  @Get("promotions/analytics") async report(
    @Req() req: HttpRequest,
    @Query() input: unknown,
  ) {
    const actor = await this.service.actor(req, ["TEACHER", "ADMIN"]);
    const q = parse(
      z
        .object({
          teacherId: uuid.optional(),
          month: z
            .string()
            .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
            .default(activityDay().slice(0, 7)),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          leadPage: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .strict(),
      input,
    );
    const teacher =
      actor.role === "TEACHER"
        ? await this.service.db.teacher.findUnique({
            where: { accountId: actor.id },
          })
        : null;
    if (
      actor.role === "TEACHER" &&
      (!teacher || (q.teacherId && q.teacherId !== teacher.id))
    )
      fail(403, "FORBIDDEN", "You can view only your own promotion insights.");
    const teacherId = teacher?.id || q.teacherId || null,
      now = new Date(),
      today = activityDay(now),
      since = new Date(today);
    since.setUTCDate(since.getUTCDate() - 89);
    const monthStart = new Date(q.month + "-01"),
      monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    if (monthStart > now)
      fail(400, "VALIDATION", "Choose the current month or an earlier month.");
    const selected = teacherId
      ? await this.service.db.teacher.findUnique({
          where: { id: teacherId },
          select: { id: true, name: true, slug: true, status: true },
        })
      : null;
    if (teacherId && !selected) fail(404, "NOT_FOUND", "Teacher unavailable.");
    const report = await this.service.db.$transaction(
      async (db) => {
        const campaignScope = Prisma.sql`(${teacherId}::uuid IS NULL OR p."teacherId"=${teacherId}::uuid)`;
        const eventScope = Prisma.sql`(${teacherId}::uuid IS NULL OR e."teacherId"=${teacherId}::uuid) AND e.day>=${since} AND NOT a.disabled
    AND NOT EXISTS(SELECT 1 FROM "PrivacyRequest" r WHERE r."accountId"=a.id AND r.kind='DELETION' AND r.scope IN ('ACCOUNT','CHILD') AND r.status='PENDING')
    AND NOT EXISTS(SELECT 1 FROM "Child" ch JOIN "Account" g ON g.id=ch."guardianId" WHERE ch."studentAccountId"=a.id AND (g.disabled OR EXISTS(SELECT 1 FROM "PrivacyRequest" r WHERE r."accountId"=g.id AND r.kind='DELETION' AND r.status='PENDING' AND r.scope IN ('ACCOUNT','CHILD'))))`;
        const monthScope = Prisma.sql`e.day>=${monthStart} AND e.day<${monthEnd}`;
        const enquiryScope = Prisma.sql`(${teacherId}::uuid IS NULL OR d."teacherId"=${teacherId}::uuid) AND ${visibleDirectEnquiry}
    AND (${actor.role}='ADMIN' OR EXISTS(SELECT 1 FROM "Teacher" t WHERE t.id=d."teacherId" AND t.status='APPROVED' AND t."screeningComplete" AND t."screeningValidUntil">${now}))`;
        const [campaignCounts] = await db.$queryRaw<
          Record<string, bigint>[]
        >(Prisma.sql`SELECT count(*) AS requests,count(*) FILTER (WHERE p."startsAt" IS NOT NULL) AS approved,
    count(*) FILTER (WHERE p.status='PENDING') AS pending,
    count(*) FILTER (WHERE p.status='ACTIVE' AND p."startsAt"<=${now} AND p."endsAt">${now}) AS active,
    count(*) FILTER (WHERE p.status='PAUSED' AND p."endsAt">${now}) AS paused,
    count(*) FILTER (WHERE p.status IN ('ACTIVE','PAUSED') AND p."endsAt"<=${now}) AS expired,
    count(*) FILTER (WHERE p.status='REJECTED') AS rejected,count(*) FILTER (WHERE p.status='CANCELLED') AS cancelled
    FROM "TeacherPromotion" p WHERE ${campaignScope}`);
        const [activity] = await db.$queryRaw<
          (Record<string, bigint> & {
            visitsToday: bigint;
            visitsMonth: bigint;
          })[]
        >(Prisma.sql`SELECT ${metrics},
    count(*) FILTER (WHERE e.kind='PROFILE_VISIT' AND e.day=${new Date(today)}) AS "visitsToday",
    count(*) FILTER (WHERE e.kind='PROFILE_VISIT' AND ${monthScope}) AS "visitsMonth",
    count(*) FILTER (WHERE e.kind='CARD_CLICK' AND ${monthScope}) AS "clicksMonth"
    FROM "PromotionActivity" e JOIN "Account" a ON a.id=e."viewerId" WHERE ${eventScope}`);
        const daily = await db.$queryRaw<
          { day: string; clicks: bigint; visits: bigint }[]
        >(Prisma.sql`SELECT to_char(e.day,'YYYY-MM-DD') AS day,count(*) FILTER (WHERE e.kind='CARD_CLICK') AS clicks,count(*) FILTER (WHERE e.kind='PROFILE_VISIT') AS visits
    FROM "PromotionActivity" e JOIN "Account" a ON a.id=e."viewerId" WHERE ${eventScope} AND ${monthScope} GROUP BY e.day ORDER BY e.day DESC`);
        const campaigns = await db.$queryRaw<
          {
            id: string;
            teacherName: string;
            placement: string;
            status: string;
            endsAt: Date | null;
            clicks: bigint;
            visits: bigint;
          }[]
        >(Prisma.sql`SELECT p.id,t.name AS "teacherName",p.placement,p.status,p."endsAt",
    count(e.id) FILTER (WHERE e.kind='CARD_CLICK') AS clicks,count(e.id) FILTER (WHERE e.kind='PROFILE_VISIT') AS visits
    FROM "TeacherPromotion" p JOIN "Teacher" t ON t.id=p."teacherId"
    LEFT JOIN ("PromotionActivity" e JOIN "Account" a ON a.id=e."viewerId") ON e."promotionId"=p.id AND ${eventScope} AND ${monthScope}
    WHERE ${campaignScope} GROUP BY p.id,t.name ORDER BY clicks DESC,visits DESC,p.id LIMIT 10`);
        const [enquiryCount] = await db.$queryRaw<
          { total: bigint; parents: bigint; students: bigint }[]
        >(
          Prisma.sql`SELECT count(*) AS total,count(DISTINCT d."ownerId") FILTER(WHERE d.kind='GUARDIAN') AS parents,count(DISTINCT d."ownerId") FILTER(WHERE d.kind='INDEPENDENT') AS students FROM "DirectEnquiry" d WHERE ${enquiryScope}`,
        );
        const enquiries = await db.$queryRaw<
          {
            id: string;
            teacherName: string;
            name: string;
            audience: string;
            subject: string;
            status: string;
            createdAt: Date;
          }[]
        >(Prisma.sql`SELECT d.id,t.name AS "teacherName",a.name,CASE WHEN d.kind='GUARDIAN' THEN 'GUARDIAN' ELSE 'STUDENT' END AS audience,COALESCE(r.subject,s.subject,'') AS subject,d.status,d."createdAt"
    FROM "DirectEnquiry" d JOIN "Teacher" t ON t.id=d."teacherId" JOIN "Account" a ON a.id=d."ownerId"
    LEFT JOIN "TuitionRequest" r ON d.kind='GUARDIAN' AND r.id=d."sourceId" LEFT JOIN "StudentEnquiry" s ON d.kind='INDEPENDENT' AND s.id=d."sourceId"
    WHERE ${enquiryScope} ORDER BY d."createdAt" DESC,d.id DESC LIMIT 10 OFFSET ${(q.leadPage - 1) * 10}`);
        const teacherScope = Prisma.sql`(${teacherId}::uuid IS NULL OR t.id=${teacherId}::uuid) AND EXISTS(SELECT 1 FROM "TeacherPromotion" p WHERE p."teacherId"=t.id)`;
        const [teacherCount] = await db.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "Teacher" t WHERE ${teacherScope}`,
        );
        const teachers = await db.$queryRaw<
          {
            id: string;
            name: string;
            status: string;
            requests: bigint;
            approved: bigint;
            clicks: bigint;
            visits: bigint;
          }[]
        >(Prisma.sql`SELECT t.id,t.name,t.status,
    (SELECT count(*) FROM "TeacherPromotion" p WHERE p."teacherId"=t.id) AS requests,
    (SELECT count(*) FROM "TeacherPromotion" p WHERE p."teacherId"=t.id AND p."startsAt" IS NOT NULL) AS approved,
    (SELECT count(*) FROM "PromotionActivity" e JOIN "Account" a ON a.id=e."viewerId" WHERE e."teacherId"=t.id AND ${eventScope} AND ${monthScope} AND e.kind='CARD_CLICK') AS clicks,
    (SELECT count(*) FROM "PromotionActivity" e JOIN "Account" a ON a.id=e."viewerId" WHERE e."teacherId"=t.id AND ${eventScope} AND ${monthScope} AND e.kind='PROFILE_VISIT') AS visits
    FROM "Teacher" t WHERE ${teacherScope} ORDER BY clicks DESC,t.id LIMIT 10 OFFSET ${(q.page - 1) * 10}`);
        const [first] = await db.$queryRaw<{ at: Date | null }[]>(
          Prisma.sql`SELECT min(e."createdAt") AS at FROM "PromotionActivity" e JOIN "Account" a ON a.id=e."viewerId" WHERE ${eventScope}`,
        );
        return {
          summary: {
            ...numbers(campaignCounts),
            ...numbers(activity),
            enquiries: Number(enquiryCount.total),
            interestedParents: Number(enquiryCount.parents),
            interestedStudents: Number(enquiryCount.students),
          },
          daily: daily.map(({ day, ...v }) => ({ day, ...numbers(v) })),
          campaigns: campaigns.map(({ clicks, visits, ...c }) => ({
            ...c,
            status: displayStatus(c, now),
            clicks: Number(clicks),
            visits: Number(visits),
          })),
          enquiries: {
            items: enquiries,
            total: Number(enquiryCount.total),
            page: q.leadPage,
          },
          teachers: {
            items: teachers.map(
              ({ requests, approved, clicks, visits, ...t }) => ({
                ...t,
                requests: Number(requests),
                approved: Number(approved),
                clicks: Number(clicks),
                visits: Number(visits),
              }),
            ),
            total: Number(teacherCount.total),
            page: q.page,
          },
          firstRecordedAt: first.at,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (actor.role === "ADMIN")
      await this.service.audit(
        this.service.db,
        actor,
        req,
        "PROMOTION_ANALYTICS_READ",
        teacherId || "all-teachers",
        "Administrator read aggregate promotions and authorized enquiry interest",
      );
    return {
      month: q.month,
      timezone: "Asia/Kolkata",
      retentionDays: 90,
      asOf: now,
      teacher: selected,
      ...report,
    };
  }
}
