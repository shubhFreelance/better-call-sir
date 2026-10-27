import {enquiryScheduleSchema,requestedSchedule,editedSchedule,scheduleTiming} from "./enquiry-schedule";
import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Body,
  Inject,
} from "@nestjs/common";
import { Prisma, type Account, type DirectEnquiry } from "@prisma/client";
import { z } from "zod";
import {
  AppService,
  PersistenceModule,
  type DB,
  type HttpRequest,
  uuid,
  version,
  text,
  parse,
  fail,
} from "../../shared";
import { requestAuthority } from "../learners/learning-management";
import { studentAuthority } from "../learners/student-authority";
import { eligible } from "../../policies";
import { enabledRegion } from "../administration/commercial-policy";
import { capacity } from "../scheduling/calendar";
import { hiringQuote } from "../administration/commercial-policy";
import { snapshotMinimum } from "../placements/minimum-terms";
export async function createDirectEnquiry(
  db: DB,
  input: {
    kind: "GUARDIAN" | "INDEPENDENT";
    sourceId: string;
    ownerId: string;
    childId?: string;
    teacherId: string;
    region: string;
  },
) {
  return db.directEnquiry.create({ data: input });
}
const staff = (a: Account) => ["ADMIN", "OPERATOR"].includes(a.role);
async function source(db: DB, service: AppService, row: DirectEnquiry) {
  const owner = await db.account.findUniqueOrThrow({
      where: { id: row.ownerId },
    }),
    teacher = await db.teacher.findUniqueOrThrow({
      where: { id: row.teacherId },
    });
  if (owner.disabled) fail(404, "NOT_FOUND", "Enquiry unavailable.");
  if (
    await db.privacyRequest.count({
      where: {
        accountId: owner.id,
        kind: "DELETION",
        scope: { in: ["ACCOUNT", "CHILD"] },
        status: "PENDING",
      },
    })
  )
    fail(
      403,
      "PRIVACY_PAUSED",
      "Learning decisions are paused for privacy review.",
    );
  if (row.kind === "GUARDIAN") {
    await service.guardian(db, owner.id);
    const child = await service.child(db, owner, row.childId!);
    const request = await db.tuitionRequest.findUniqueOrThrow({
      where: { id: row.sourceId },
    });
    return {
      owner,
      teacher,
      request,
      learner: {
        name: child.alias,
        stage: child.educationStage,
        grade: child.grade,
        board: child.board,
        institution: child.schoolName,
        subjects: child.schoolSubjects,
        courseName: child.courseName,
        studyYear: child.studyYear,
      },
      subject: request.subject,
      mode: request.mode,
      language: request.language,
      preferredTime:
        request.scheduleStatus === "CONFIRMED" && request.schedulePreferences
          ? JSON.stringify(request.schedulePreferences)
          : request.schedule,
      open: request.status === "OPEN",
    };
  }
  const request = await db.studentEnquiry.findUniqueOrThrow({
      where: { id: row.sourceId },
    }),
    profile = await db.independentStudentProfile.findUnique({
      where: { accountId: owner.id },
    });
  if (owner.role !== "INDEPENDENT_STUDENT" || !profile)
    fail(404, "NOT_FOUND", "Student enquiry unavailable.");
  return {
    owner,
    teacher,
    request,
    learner: {
      name: owner.name,
      education:
        profile.version === request.profileVersion
          ? profile.education
          : request.educationScope,
    },
    subject: request.subject,
    mode: request.mode,
    language: request.language,
    preferredTime: JSON.stringify(request.preferences),
    open: request.status === "SUBMITTED",
  };
}
async function ownerAuthority(
  db: DB,
  service: AppService,
  actor: Account,
  row: DirectEnquiry,
  write = false,
) {
  if (row.kind === "GUARDIAN")
    await requestAuthority(db, service, actor, row.sourceId, write);
  else await studentAuthority(db, actor, row.ownerId, write);
}
async function currentFit(
  db: DB,
  row: DirectEnquiry,
  data: Awaited<ReturnType<typeof source>>,
) {
  const r = data.request,
    t = data.teacher;
  const child =
    row.kind === "GUARDIAN"
      ? await db.child.findUniqueOrThrow({ where: { id: row.childId! } })
      : null;
  const e =
    row.kind === "INDEPENDENT"
      ? ((
          await db.studentEnquiry.findUniqueOrThrow({
            where: { id: row.sourceId },
          })
        ).educationScope as Record<string, any>)
      : null;
  const learner = child ?? {
    educationStage: e!.stage,
    grade: e!.grade ?? null,
    board: e!.board ?? null,
    courseName: e!.courseName ?? null,
    studyYear: e!.studyYear ?? null,
  };
  if (
    !(await enabledRegion(db, row.region)) ||
    !(await enabledRegion(db, t.region)) ||
    !eligible(r, learner, t) ||
    (r.mode === "HOME" && (t.region !== row.region || !t.travelAccepted)) ||
    !(await capacity(
      db,
      t,
      child?.id,
      row.kind === "INDEPENDENT" ? row.ownerId : undefined,
    ))
  )
    fail(
      409,
      "TEACHER_UNAVAILABLE",
      "Teacher eligibility or capacity changed. Review your enquiry.",
    );
}
async function openArrangement(
  db: DB,
  row: DirectEnquiry,
  data: Awaited<ReturnType<typeof source>>,
) {
  const t = data.teacher,
    quote = await hiringQuote(db, t.monthlyPaise);
  const existing =
    row.kind === "GUARDIAN"
      ? await db.placement.findUnique({ where: { requestId: row.sourceId } })
      : await db.studentArrangement.findUnique({
          where: { enquiryId: row.sourceId },
        });
  if (existing) {
    if (existing.teacherId !== t.id)
      fail(409, "CONFLICT", "This enquiry already has another arrangement.");
    return existing.id;
  }
  if (row.kind === "GUARDIAN") {
    const p = await db.placement.upsert({
      where: { requestId: row.sourceId },
      update: {},
      create: {
        guardianId: row.ownerId,
        childId: row.childId!,
        teacherId: t.id,
        requestId: row.sourceId,
        monthlyPaise: t.monthlyPaise,
        ...quote,
      },
    });
    await snapshotMinimum(db, "PLACEMENT", p.id, t.monthlyPaise, t.lockInDays);
    return p.id;
  }
  const terms = {
    commercialVersion: quote.commercialVersion,
    policyVersion: "independent-hiring-development-v1",
    subject: data.subject,
    mode: data.mode,
    language: data.language,
    monthlyPaise: t.monthlyPaise,
    platformFeePaise: quote.placementFeePaise,
    currency: "INR",
    lockInDays: t.lockInDays,
    lockInEnforced: false,
    demoAvailable: !!t.demoOptIn,
    classesBooked: false,
    contactSharing: "EMAIL_AFTER_MUTUAL_CONFIRMATION",
  };
  const p = await db.studentArrangement.upsert({
    where: { enquiryId: row.sourceId },
    update: {},
    create: {
      enquiryId: row.sourceId,
      studentAccountId: row.ownerId,
      teacherId: t.id,
      region: row.region,
      terms,
    },
  });
  await snapshotMinimum(db, "INDEPENDENT", p.id, t.monthlyPaise, t.lockInDays);
  return p.id;
}
@Controller("api/v1")
class DirectEnquiriesController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  @Get("direct-enquiries") async list(
    @Req() req: HttpRequest,
    @Query() input: unknown,
  ) {
    const actor = await this.service.actor(req, [
      "GUARDIAN",
      "STUDENT",
      "INDEPENDENT_STUDENT",
      "TEACHER",
      "ADMIN",
      "OPERATOR",
    ]);
    const q = parse(
      z
        .object({
          cursor: uuid.optional(),
          id: uuid.optional(),
          arrangementId: uuid.optional(),
          status: z.enum(["PENDING", "ACCEPTED", "DECLINED"]).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(10),
        })
        .strict(),
      input,
    );
    return this.service.db.$transaction(
      async (db) => {
        const t =
          actor.role === "TEACHER"
            ? await db.teacher.findUnique({ where: { accountId: actor.id } })
            : null;
        if (
          actor.role === "TEACHER" &&
          (!t ||
            t.status !== "APPROVED" ||
            !t.screeningComplete ||
            !t.screeningValidUntil ||
            t.screeningValidUntil <= new Date())
        )
          return { items: [], counts: {}, nextCursor: null };
        const delegates =
          actor.role === "GUARDIAN"
            ? await db.studentGuardianGrant.findMany({
                where: { acceptedById: actor.id, status: "ACTIVE" },
                select: { studentAccountId: true },
              })
            : [];
        const ids = [actor.id, ...delegates.map((g) => g.studentAccountId)];
        const own =
          actor.role === "TEACHER"
            ? Prisma.sql`d."teacherId"=${t?.id ?? "00000000-0000-4000-8000-000000000000"}::uuid`
            : actor.role === "ADMIN"
              ? Prisma.sql`TRUE`
              : actor.role === "OPERATOR"
                ? Prisma.sql`d.region=${actor.region}`
                : actor.role === "STUDENT"
                  ? Prisma.sql`EXISTS(SELECT 1 FROM "Child" s WHERE s.id=d."childId" AND s."studentAccountId"=${actor.id}::uuid)`
                  : Prisma.sql`d."ownerId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`;
        const active = Prisma.sql`EXISTS(SELECT 1 FROM "Account" a WHERE a.id=d."ownerId" AND NOT a.disabled AND ((d.kind='GUARDIAN' AND a.role='GUARDIAN' AND a.verified AND EXISTS(SELECT 1 FROM "Consent" c WHERE c."guardianId"=a.id AND c."withdrawnAt" IS NULL) AND EXISTS(SELECT 1 FROM "Child" ch WHERE ch.id=d."childId" AND ch."guardianId"=a.id AND (ch."guardianVerificationId" IS NULL OR EXISTS(SELECT 1 FROM "GuardianVerification" v WHERE v.id=ch."guardianVerificationId" AND v.status='APPROVED')))) OR (d.kind='INDEPENDENT' AND a.role='INDEPENDENT_STUDENT' AND EXISTS(SELECT 1 FROM "IndependentStudentProfile" p WHERE p."accountId"=a.id)))) AND NOT EXISTS(SELECT 1 FROM "PrivacyRequest" p WHERE p."accountId"=d."ownerId" AND p.kind='DELETION' AND p.scope IN ('ACCOUNT','CHILD') AND p.status='PENDING')`;
        const scope = Prisma.sql`(${own}) AND (${active})`;
        const filter = q.status
          ? Prisma.sql`d.status::text=${q.status} AND (${q.status}!='PENDING' OR EXISTS(SELECT 1 FROM "TuitionRequest" r WHERE r.id=d."sourceId" AND d.kind='GUARDIAN' AND r.status='OPEN') OR EXISTS(SELECT 1 FROM "StudentEnquiry" e WHERE e.id=d."sourceId" AND d.kind='INDEPENDENT' AND e.status='SUBMITTED'))`
          : Prisma.sql`TRUE`;
        let cursor: DirectEnquiry | null = null;
        if (q.cursor) {
          const allowed = await db.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT d.id FROM "DirectEnquiry" d WHERE ${scope} AND (${filter}) AND d.id=${q.cursor}::uuid`,
          );
          if (!allowed.length)
            fail(404, "NOT_FOUND", "Enquiry cursor is unavailable.");
          cursor = await db.directEnquiry.findUniqueOrThrow({
            where: { id: q.cursor },
          });
        }
        const counts = await db.$queryRaw<{ status: string; count: bigint }[]>(
          Prisma.sql`SELECT d.status,count(*) AS count FROM "DirectEnquiry" d WHERE ${scope} GROUP BY d.status`,
        );
        const rows = await db.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT d.id FROM "DirectEnquiry" d WHERE ${scope} AND (${filter}) AND (${q.id ?? null}::uuid IS NULL OR d.id=${q.id ?? null}::uuid) AND (${q.arrangementId ?? null}::uuid IS NULL OR d."arrangementId"=${q.arrangementId ?? null}::uuid) AND (${cursor?.id ?? null}::uuid IS NULL OR d."createdAt"<${cursor?.createdAt ?? new Date()} OR (d."createdAt"=${cursor?.createdAt ?? new Date()} AND d.id<${cursor?.id ?? null}::uuid)) ORDER BY d."createdAt" DESC,d.id DESC LIMIT ${q.limit + 1}`,
        );
        if (q.id && !rows.length)
          fail(404, "NOT_FOUND", "Enquiry unavailable.");
        const items = [];
        for (const entry of rows.slice(0, q.limit)) {
          const row = await db.directEnquiry.findUniqueOrThrow({
              where: { id: entry.id },
            }),
            data = await source(db, this.service, row);
          items.push({
            ...row,
            subject: data.subject,
            mode: data.mode,
            language: data.language,
            parentName: data.owner.name,
            teacherName: data.teacher.name,
            learner: data.learner,
            preferredTime: data.preferredTime,
            sourceVersion: data.request.version,
            canReply:
              actor.role === "TEACHER" && data.teacher.accountId === actor.id,
            canDecide:
              row.kind === "GUARDIAN"
                ? (actor.role === "GUARDIAN" && row.ownerId === actor.id) ||
                  (actor.role === "STUDENT" &&
                    !!(await db.child.count({
                      where: {
                        id: row.childId!,
                        studentAccountId: actor.id,
                        learningManagementMode: {
                          in: ["SHARED", "STUDENT_LED"],
                        },
                      },
                    })))
                : (actor.role === "INDEPENDENT_STUDENT" &&
                    row.ownerId === actor.id) ||
                  (actor.role === "GUARDIAN" &&
                    !!(await db.studentGuardianGrant.count({
                      where: {
                        studentAccountId: row.ownerId,
                        acceptedById: actor.id,
                        status: "ACTIVE",
                        supportMode: "MANAGE",
                      },
                    }))),
            sourceOpen: data.open,
          });
        }
        if (staff(actor))
          await this.service.audit(
            db,
            actor,
            req,
            "DIRECT_ENQUIRY_OVERSIGHT",
            "direct-enquiries",
            "Staff read regional direct enquiry history",
          );
        return {
          items,
          counts: Object.fromEntries(
            counts.map((c) => [c.status, Number(c.count)]),
          ),
          nextCursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  @Post("direct-enquiries/:id/responses") async respond(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const actor = await this.service.actor(req, [
      "TEACHER",
      "GUARDIAN",
      "STUDENT",
      "INDEPENDENT_STUDENT",
    ]);
    const data = parse(
      z.discriminatedUnion("action", [
        z
          .object({
            action: z.enum([
              "ACCEPT",
              "DECLINE",
              "ACCEPT_PROPOSAL",
              "DECLINE_PROPOSAL",
            ]),
            expectedVersion: version,
            expectedSourceVersion: version,
            confirmed: z.literal(true),
            confirmedTiming: text(1200).optional(),
            message: text(1000).optional(),
          })
          .strict(),
        z
          .object({
            action: z.enum(["PROPOSE", "COUNTER_PROPOSE"]),
            expectedVersion: version,
            expectedSourceVersion: version,
            confirmed: z.literal(true),
            format: z.enum(["ONE_TO_ONE", "GROUP"]),
            timing: text(1200).optional(),
            message: text(1000),
            schedule: enquiryScheduleSchema.optional(),
          })
          .strict(),
      ]),
      body,
    );
    return this.service.once(
      req,
      actor,
      "direct-enquiry.respond",
      { id, ...data },
      async (db) => {
        const initial = await db.directEnquiry.findUnique({ where: { id } });
        if (!initial) fail(404, "NOT_FOUND", "Enquiry unavailable.");
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.ownerId},0))`;
        if (actor.role === "TEACHER") {
          const t = await db.teacher.findUnique({
            where: { accountId: actor.id },
          });
          if (t?.id !== initial.teacherId)
            fail(404, "NOT_FOUND", "Enquiry unavailable.");
          if (!["ACCEPT", "DECLINE", "PROPOSE"].includes(data.action))
            fail(403, "FORBIDDEN", "Only the family can decide a proposal.");
        } else {
          await ownerAuthority(db, this.service, actor, initial, true);
          if (!["ACCEPT_PROPOSAL", "DECLINE_PROPOSAL", "COUNTER_PROPOSE"].includes(data.action))
            fail(
              403,
              "FORBIDDEN",
              "Only the assigned teacher can answer this enquiry.",
            );
        }
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${initial.teacherId},0))`;
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const row = await db.directEnquiry.findUniqueOrThrow({ where: { id } }),
          context = await source(db, this.service, row);
        if (
          row.version !== data.expectedVersion ||
          context.request.version !== data.expectedSourceVersion ||
          !["PENDING", "PROPOSED"].includes(row.status) ||
          !context.open
        )
          fail(
            409,
            "CONFLICT",
            "Enquiry changed or is already answered. Refresh before continuing.",
          );
        const currentProposal = row.proposal as Prisma.JsonObject | null;
        const original=requestedSchedule(context.preferredTime);
        let revised: ReturnType<typeof editedSchedule>=null;
        if("format" in data){
          if(!original)fail(409,"SCHEDULE_REQUIRED","The family must record structured availability before it can be edited.");
          revised=data.schedule?editedSchedule(original!,data.schedule):null;
          if(!revised)fail(400,"SCHEDULE_MISMATCH","Edit the submitted days and time ranges. Do not add dates or remove requested ranges.");
        }
        if(original&&currentProposal&&["ACCEPT","ACCEPT_PROPOSAL"].includes(data.action)){
          if(currentProposal.sourceVersion!==undefined&&currentProposal.sourceVersion!==context.request.version)fail(409,"SCHEDULE_MISMATCH","The requested availability changed. Revise the proposal before confirming.");
          const candidate=enquiryScheduleSchema.safeParse(currentProposal.schedule);
          if(!candidate.success||!editedSchedule(original,candidate.data))fail(409,"SCHEDULE_MISMATCH","This proposal must be revised to match the family's submitted schedule.");
        }
        if (actor.role !== "TEACHER" && (row.status !== "PROPOSED" || currentProposal?.proposedBy === "FAMILY"))
          fail(409, "CONFLICT", "There is no current proposal to decide.");
        if (data.action === "ACCEPT" && row.status === "PROPOSED" && currentProposal?.proposedBy !== "FAMILY")
          fail(409, "CONFLICT", "Wait for the family to confirm your latest proposal before accepting.");
        if (data.action === "ACCEPT" && currentProposal?.familyConfirmed === true) {
          if (!data.confirmedTiming || data.confirmedTiming !== currentProposal.timing)
            fail(409, "TIMING_CHANGED", "Confirm the family-approved time exactly, or send a new proposal for family approval.");
        } else if ("confirmedTiming" in data && data.confirmedTiming !== undefined) {
          fail(400, "INVALID_REQUEST", "Only a family-approved time can be confirmed when accepting an enquiry.");
        }
        if (
          data.action !== "DECLINE" &&
          data.action !== "DECLINE_PROPOSAL" &&
          !(await this.service.publicTeachers({ id: row.teacherId }, 1)).length
        )
          fail(
            409,
            "TEACHER_UNAVAILABLE",
            "Teacher is not currently available.",
          );
        if (
          row.kind === "INDEPENDENT" &&
          data.action !== "DECLINE" &&
          data.action !== "DECLINE_PROPOSAL"
        ) {
          const current = await db.independentStudentProfile.findUniqueOrThrow({
            where: { accountId: row.ownerId },
          });
          const enquiry = await db.studentEnquiry.findUniqueOrThrow({
            where: { id: row.sourceId },
          });
          if (current.version !== enquiry.profileVersion)
            fail(
              409,
              "PROFILE_CHANGED",
              "Education details changed. Submit an updated enquiry.",
            );
        }
        if (!["DECLINE", "DECLINE_PROPOSAL"].includes(data.action))
          await currentFit(db, row, context);
        const accepted = data.action === "ACCEPT";
        const arrangementId = accepted
          ? await openArrangement(db, row, context)
          : null;
        const status =
          ["PROPOSE", "COUNTER_PROPOSE"].includes(data.action)
            ? "PROPOSED"
            : data.action === "ACCEPT_PROPOSAL"
              ? "PENDING"
            : accepted
              ? "ACCEPTED"
              : "DECLINED";
        const proposal =
          "format" in data
            ? {
                format: data.format,
                timing: scheduleTiming(revised!),
                message: data.message,
                timezone: "Asia/Kolkata",
                schedule: revised!,
                sourceVersion:context.request.version,
                proposedBy: actor.role === "TEACHER" ? "TEACHER" : "FAMILY",
                ...(data.action === "COUNTER_PROPOSE" ? {familyConfirmed:true, familyConfirmedAt:new Date().toISOString()} : {}),
              }
            : data.action === "ACCEPT_PROPOSAL"
              ? { ...currentProposal, familyConfirmed: true, familyConfirmedAt: new Date().toISOString(), ...(currentProposal?.schedule ? {agreedSchedule:currentProposal.schedule} : {}) }
              : accepted && currentProposal?.familyConfirmed === true
                ? { ...currentProposal, agreedTiming: data.action === "ACCEPT" ? data.confirmedTiming : undefined, ...(currentProposal.schedule ? {agreedSchedule:currentProposal.schedule} : {}), agreedSourceVersion:context.request.version, teacherConfirmedAt: new Date().toISOString() }
              : accepted && original ? {format:"ONE_TO_ONE",timing:scheduleTiming(original),message:"Original requested schedule accepted.",timezone:"Asia/Kolkata",schedule:original,agreedSchedule:original,agreedTiming:scheduleTiming(original),agreedSourceVersion:context.request.version,familyConfirmed:true,teacherConfirmedAt:new Date().toISOString()}
              : data.action === "DECLINE_PROPOSAL" && data.message ? {...currentProposal, declineReason:data.message}
              : (row.proposal ?? Prisma.DbNull);
        const updated = await db.directEnquiry.update({
          where: { id },
          data: {
            status,
            proposal: proposal as Prisma.InputJsonValue,
            arrangementId,
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "DIRECT_ENQUIRY_" + data.action,
          id,
          "Teacher and family handled direct enquiry without staff approval",
          undefined,
          {
            version: updated.version,
            status,
            proposal:
              data.action === "PROPOSE" ? { format: data.format } : null,
          } as Prisma.InputJsonValue,
        );
        await this.service.event(
          db,
          "direct." + data.action.toLowerCase(),
          id,
          updated.version,
        );
        return updated;
      },
      async (db) => {
        const row = await db.directEnquiry.findUniqueOrThrow({ where: { id } });
        if (actor.role === "TEACHER") {
          if (
            !(await db.teacher.count({
              where: { id: row.teacherId, accountId: actor.id },
            }))
          )
            fail(404, "NOT_FOUND", "Enquiry unavailable.");
        } else await ownerAuthority(db, this.service, actor, row, true);
        await source(db, this.service, row);
      },
    );
  }
}
@Module({
  imports: [PersistenceModule],
  controllers: [DirectEnquiriesController],
})
export class DirectEnquiriesModule {}
