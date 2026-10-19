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
import { Prisma, Account } from "@prisma/client";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  DB,
  HttpRequest,
  uuid,
  parse,
  fail,
  hash,
} from "../../shared";
const kind = z.enum(["PLACEMENT", "INDEPENDENT"]);
const cursor = z
  .string()
  .regex(
    /^(PLACEMENT|INDEPENDENT):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
const paging = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: cursor.optional(),
    status: z.enum(["OPEN", "SCHEDULED", "COMPLETED"]).optional(),
    assignment: z.enum(["ME", "UNASSIGNED"]).optional(),
    due: z.enum(["true", "false"]).default("true"),
  })
  .strict();
const command = z.object({
  expectedVersion: z.number().int().min(0),
  confirmed: z.literal(true),
});
type Row = {
  id: string;
  kind: "PLACEMENT" | "INDEPENDENT";
  familyId: string;
  region: string;
  learnerName: string;
  teacherName: string;
  subject: string;
  arrangementStatus: string;
  startedAt: Date;
  dueAt: Date;
  status: "OPEN" | "SCHEDULED" | "COMPLETED";
  version: number;
  assignedToId: string | null;
  nextContactAt: Date | null;
  supportCaseId: string | null;
  continued: boolean | null;
  observedAt: Date | null;
  requestId: string | null;
  enquiryId: string | null;
  guardianVerificationId: string | null;
  childId: string | null;
};
// Follow-ups are derived from recorded starts, so worker downtime cannot lose a due task.
const source = Prisma.sql`WITH arrangements AS (
 SELECT 'PLACEMENT'::text kind,p.id,p."guardianId" AS "familyId",r.region,c.alias AS "learnerName",t.name AS "teacherName",r.subject,p.status AS "arrangementStatus",p."startedAt",p."requestId",NULL::uuid AS "enquiryId",c."guardianVerificationId",p."childId"
 FROM "Placement" p JOIN "TuitionRequest" r ON r.id=p."requestId" JOIN "Child" c ON c.id=p."childId" JOIN "Teacher" t ON t.id=p."teacherId" WHERE p."startedAt" IS NOT NULL
 UNION ALL
 SELECT 'INDEPENDENT',a.id,a."studentAccountId",a.region,owner.name,t.name,e.subject,a.status,(m."commencementDate"::date)::timestamp,NULL::uuid,a."enquiryId",NULL::uuid,NULL::uuid
 FROM "StudentArrangement" a JOIN "TuitionMinimum" m ON m."resourceId"=a.id AND m.kind='INDEPENDENT' JOIN "Account" owner ON owner.id=a."studentAccountId" JOIN "Teacher" t ON t.id=a."teacherId" JOIN "StudentEnquiry" e ON e.id=a."enquiryId"
 WHERE m."familyConfirmedAt" IS NOT NULL AND m."teacherConfirmedAt" IS NOT NULL AND m."commencementDate" IS NOT NULL
), eligible AS (
 SELECT a.*,a."startedAt"+interval '30 days' AS "dueAt",coalesce(f.status,'OPEN') status,coalesce(f.version,0) version,f."assignedToId",f."nextContactAt",f."supportCaseId",o.continued,o."observedAt"
 FROM arrangements a JOIN "Account" owner ON owner.id=a."familyId" LEFT JOIN "Consent" c ON c."guardianId"=owner.id LEFT JOIN "ServiceFollowup" f ON f.kind=a.kind AND f."resourceId"=a.id LEFT JOIN "ContinuationObservation" o ON a.kind='PLACEMENT' AND o."placementId"=a.id
 WHERE NOT owner.disabled AND ((a.kind='PLACEMENT' AND owner.role='GUARDIAN' AND owner.verified AND c."withdrawnAt" IS NULL AND c."guardianId" IS NOT NULL AND (a."guardianVerificationId" IS NULL OR EXISTS(SELECT 1 FROM "GuardianVerification" v WHERE v.id=a."guardianVerificationId" AND v.status='APPROVED'))) OR (a.kind='INDEPENDENT' AND owner.role='INDEPENDENT_STUDENT' AND EXISTS(SELECT 1 FROM "IndependentStudentProfile" s WHERE s."accountId"=owner.id)))
 AND NOT EXISTS(SELECT 1 FROM "DeletionRecord" d WHERE d."accountId"=owner.id AND (d.scope='ACCOUNT' OR d.scope='CHILD' AND d."resourceId"=a."childId"))
 AND NOT EXISTS(SELECT 1 FROM "PrivacyRequest" pr WHERE pr."accountId"=owner.id AND pr.kind='DELETION' AND pr.status='PENDING' AND (pr.scope='ACCOUNT' OR a.kind='PLACEMENT' AND pr.scope='CHILD'))
)`;
function projection(r: Row) {
  const {
    familyId,
    requestId,
    enquiryId,
    continued,
    observedAt,
    guardianVerificationId,
    childId,
    ...safe
  } = r;
  return {
    ...safe,
    recordedObservation: observedAt ? { continued, observedAt } : null,
  };
}
@Controller("api/v1")
class ServiceController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  async authority(db: DB, req: HttpRequest, a: Account) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('staff-administration',0))`;
    const current = await db.account.findUnique({ where: { id: a.id } }),
      s = await db.session.findUnique({
        where: { accessHash: hash(req.cookies.bcs_access || "") },
      });
    if (
      !current ||
      current.disabled ||
      current.role !== a.role ||
      current.region !== a.region ||
      current.authVersion !== a.authVersion ||
      !s ||
      s.revoked ||
      s.rotated ||
      s.authVersion !== current.authVersion ||
      s.expiresAt <= new Date() ||
      s.accessExpiresAt <= new Date()
    )
      fail(401, "SESSION_REVOKED", "Staff authority changed. Sign in again.");
    if (!s.mfaVerifiedAt || s.mfaVerifiedAt.getTime() < Date.now() - 300000)
      fail(
        403,
        "MFA_REQUIRED",
        "Verify your authenticator again before service follow-up.",
      );
  }
  scope(a: Account) {
    return a.role === "ADMIN"
      ? Prisma.sql`TRUE`
      : Prisma.sql`region=${a.region}`;
  }
  async row(db: DB, a: Account, k: string, id: string) {
    const rows = await db.$queryRaw<Row[]>(
      Prisma.sql`${source} SELECT * FROM eligible WHERE kind=${k} AND id=${id}::uuid AND ${this.scope(a)}`,
    );
    if (!rows[0])
      fail(
        404,
        "NOT_FOUND",
        "Service follow-up not found or outreach is paused.",
      );
    return rows[0];
  }
  async access(db: DB, req: HttpRequest, a: Account, k: string, id: string) {
    await this.authority(db, req, a);
    const row = await this.row(db, a, k, id);
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${row.familyId},0))`;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"service:" + k + ":" + id},0))`;
    return this.row(db, a, k, id);
  }
  @Get("admin/service-followups") async list(@Req() req: HttpRequest, @Query() query: unknown) {
    const a = await this.service.actor(req, ["ADMIN", "OPERATOR"]),
      q = parse(paging, query);
    return this.service.db.$transaction(async (db) => {
      await this.authority(db, req, a);
      const filter = Prisma.sql`${this.scope(a)} AND ${q.status ? Prisma.sql`status=${q.status}` : Prisma.sql`status<>'COMPLETED'`} AND ${q.assignment ? (q.assignment === "ME" ? Prisma.sql`"assignedToId"=${a.id}::uuid` : Prisma.sql`"assignedToId" IS NULL`) : Prisma.sql`TRUE`} AND ${q.due === "true" ? Prisma.sql`coalesce("nextContactAt","dueAt")<=CURRENT_TIMESTAMP` : Prisma.sql`TRUE`}`;
      let anchor: Row | undefined;
      if (q.cursor) {
        const [k, id] = q.cursor.split(":");
        anchor = (
          await db.$queryRaw<Row[]>(
            Prisma.sql`${source} SELECT * FROM eligible WHERE ${filter} AND kind=${k} AND id=${id}::uuid`,
          )
        )[0];
        if (!anchor)
          fail(404, "NOT_FOUND", "Follow-up history boundary is unavailable.");
      }
      const rows = await db.$queryRaw<Row[]>(
          Prisma.sql`${source} SELECT * FROM eligible WHERE ${filter} ${anchor ? Prisma.sql`AND ("dueAt",kind,id)>(${anchor.dueAt},${anchor.kind},${anchor.id}::uuid)` : Prisma.empty} ORDER BY "dueAt",kind,id LIMIT ${q.limit + 1}`,
        ),
        items = rows.slice(0, q.limit);
      await this.service.audit(
        db,
        a,
        req,
        "SERVICE_QUEUE_READ",
        "service",
        "Staff read scoped follow-up queue",
      );
      return {
        items: items.map(projection),
        nextCursor:
          rows.length > q.limit
            ? items.at(-1)!.kind + ":" + items.at(-1)!.id
            : null,
        asOf: new Date(),
      };
    });
  }
  @Get("admin/service-followups/:kind/:id") async detail(
    @Req() req: HttpRequest,
    @Param("kind") k: string,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    const a = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    parse(kind, k);
    parse(uuid, id);
    const q = parse(
      z
        .object({
          cursor: uuid.optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .strict(),
      query,
    );
    return this.service.db.$transaction(async (db) => {
      await this.authority(db, req, a);
      const row = await this.row(db, a, k, id),
        f = await db.serviceFollowup.findUnique({
          where: { kind_resourceId: { kind: k, resourceId: id } },
        }),
        where = { followupId: f?.id || "00000000-0000-4000-8000-000000000000" };
      if (
        q.cursor &&
        !(await db.serviceContact.count({ where: { ...where, id: q.cursor } }))
      )
        fail(404, "NOT_FOUND", "Contact history boundary is unavailable.");
      const rows = await db.serviceContact.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      await this.service.audit(
        db,
        a,
        req,
        "SERVICE_FOLLOWUP_READ",
        id,
        "Staff read service contact metadata",
      );
      return {
        followup: projection(row),
        contacts: rows.slice(0, q.limit),
        nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
      };
    });
  }
  @Post("admin/service-followups/:kind/:id/assignments") async assign(
    @Req() req: HttpRequest,
    @Param("kind") k: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const a = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    parse(kind, k);
    parse(uuid, id);
    const data = parse(
      command.extend({ action: z.enum(["CLAIM", "RELEASE"]) }).strict(),
      body,
    );
    return this.service.once(
      req,
      a,
      "service.assign",
      data,
      async (db) => {
        const row = await this.access(db, req, a, k, id);
        if (row.version !== data.expectedVersion)
          fail(409, "CONFLICT", "Follow-up changed. Reload before deciding.");
        if (
          row.assignedToId &&
          row.assignedToId !== a.id &&
          (data.action === "CLAIM" || a.role !== "ADMIN")
        )
          fail(
            409,
            "ASSIGNED_ELSEWHERE",
            "Another staff member owns this follow-up.",
          );
        const f = await db.serviceFollowup.upsert({
          where: { kind_resourceId: { kind: k, resourceId: id } },
          create: {
            kind: k,
            resourceId: id,
            assignedToId: data.action === "CLAIM" ? a.id : null,
          },
          update: {
            assignedToId: data.action === "CLAIM" ? a.id : null,
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          a,
          req,
          "SERVICE_ASSIGNMENT_CHANGED",
          id,
          "Staff claimed or released follow-up",
          undefined,
          { action: data.action },
        );
        return { id, status: f.status, version: f.version };
      },
      (db) => this.access(db, req, a, k, id),
    );
  }
  @Post("admin/service-followups/:kind/:id/contacts") async contact(
    @Req() req: HttpRequest,
    @Param("kind") k: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const a = await this.service.actor(req, ["ADMIN", "OPERATOR"]);
    parse(kind, k);
    parse(uuid, id);
    const data = parse(
      command
        .extend({
          outcome: z.enum([
            "CONTINUING",
            "ENDED",
            "NO_RESPONSE",
            "HELP_REQUESTED",
          ]),
          method: z.enum(["EMAIL", "PHONE", "VIDEO", "IN_PERSON"]),
          nextContactAt: z.string().datetime().optional(),
          supportCategory: z
            .enum(["GENERAL", "SAFETY", "REPLACEMENT"])
            .optional(),
        })
        .strict()
        .refine(
          (v) =>
            (v.outcome === "NO_RESPONSE") === !!v.nextContactAt &&
            (v.outcome === "HELP_REQUESTED") === !!v.supportCategory,
        ),
      body,
    );
    return this.service.once(
      req,
      a,
      "service.contact",
      data,
      async (db) => {
        const row = await this.access(db, req, a, k, id);
        if (row.version !== data.expectedVersion)
          fail(409, "CONFLICT", "Follow-up changed. Reload before deciding.");
        if (row.assignedToId !== a.id)
          fail(
            409,
            "CLAIM_REQUIRED",
            "Claim this follow-up before recording contact.",
          );
        if (row.status === "COMPLETED")
          fail(
            409,
            "ALREADY_COMPLETED",
            "This follow-up is complete. Use its linked support case for further help.",
          );
        if (row.dueAt > new Date())
          fail(409, "NOT_DUE", "The thirty-day follow-up is not due yet.");
        const next = data.nextContactAt ? new Date(data.nextContactAt) : null;
        if (
          next &&
          (next.getTime() <= Date.now() ||
            next.getTime() > Date.now() + 30 * 86400000)
        )
          fail(
            400,
            "VALIDATION",
            "Schedule the next attempt within the next thirty days.",
          );
        let caseId: string | null = null;
        if (data.outcome === "HELP_REQUESTED") {
          const c = await db.supportCase.create({
            data: {
              accountId: row.familyId,
              region: row.region,
              category: data.supportCategory!,
              description:
                "Staff follow-up: the learner or guardian requested help. Review the arrangement with them.",
              ...(k === "PLACEMENT"
                ? { placementId: id, requestId: row.requestId }
                : { studentEnquiryId: row.enquiryId }),
              assignedToId: a.id,
            },
          });
          caseId = c.id;
          await this.service.event(db, "case.created", c.id);
        }
        const f = await db.serviceFollowup.update({
          where: { kind_resourceId: { kind: k, resourceId: id } },
          data: {
            status: next ? "SCHEDULED" : "COMPLETED",
            nextContactAt: next,
            supportCaseId: caseId,
            version: { increment: 1 },
          },
        });
        await db.serviceContact.create({
          data: {
            followupId: f.id,
            actorId: a.id,
            outcome: data.outcome,
            method: data.method,
            nextContactAt: next,
            supportCaseId: caseId,
          },
        });
        await this.service.audit(
          db,
          a,
          req,
          "SERVICE_CONTACT_RECORDED",
          id,
          "Staff recorded a contact attempt; continuation metrics remain unchanged",
          undefined,
          { outcome: data.outcome, method: data.method },
        );
        return {
          id,
          status: f.status,
          version: f.version,
          supportCaseId: caseId,
        };
      },
      (db) => this.access(db, req, a, k, id),
    );
  }
}
@Module({ imports: [PersistenceModule], controllers: [ServiceController] })
export class ServiceModule {}
