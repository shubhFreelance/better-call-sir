import {
  Module,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  Inject,
} from "@nestjs/common";
import { Response } from "express";
import { Account, GuardianVerification } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as files from "@bcs/evidence";
import {
  AppService,
  PersistenceModule,
  HttpRequest,
  DB,
  uuid,
  version,
  text,
  parse,
  fail,
  development,
} from "../../shared";
import { pageQuery, pageResult } from "../../pagination";
import { unusedAccount } from "../learners/independent-students.module";

export const guardianVerificationInput = z
  .object({
    guardianName: text(100),
    learnerName: text(40),
    relationship: z.enum(["PARENT", "SIBLING", "OTHER"]),
    ageBand: z.enum(["UNDER_15", "15_TO_17", "18_PLUS"]),
    managementMode: z.enum(["GUARDIAN_ONLY", "SHARED", "STUDENT_LED"]),
    studentEmail: z.string().trim().email().toLowerCase().max(254).nullable(),
    acknowledgmentMethod: z.enum(["STUDENT_ACCOUNT", "STAFF_CALL"]),
    documentNamesGuardian: z.boolean(),
    adultDeclaration: z.literal(true),
    authorityDeclaration: z.literal(true),
    verificationPermission: z.literal(true),
    policyVersion: z.literal("guardian-verification-v1"),
  })
  .strict()
  .refine(
    (d) =>
      d.acknowledgmentMethod === "STAFF_CALL"
        ? d.studentEmail === null
        : !!d.studentEmail,
    "Choose a student email or staff-observed acknowledgment.",
  );
const editing = ["DRAFT", "CHANGES_REQUESTED"];
const staff = (a: Account) => ["ADMIN", "REVIEWER"].includes(a.role);
const active = (v: GuardianVerification) =>
  !["CANCELLED", "REVOKED", "DELETED", "REJECTED"].includes(v.status);
export async function guardianProof(
  db: DB,
  guardianId: string,
  learnerName: string,
  proofId?: string,
) {
  const records = await db.guardianVerification.findMany({
    where: {
      guardianId,
      ...(proofId ? { id: proofId } : {}),
      learnerId: null,
      status: "APPROVED",
      learnerName: { equals: learnerName, mode: "insensitive" },
    },
    orderBy: { id: "asc" },
  });
  for (const record of records)
    if (
      !(await db.child.count({ where: { guardianVerificationId: record.id } }))
    )
      return record;
  // shortcut: pre-verification synthetic accounts exist only in development; live startup remains blocked.
  if (
    !proofId &&
    development() &&
    !(await db.guardianVerification.count({ where: { guardianId } }))
  )
    return null;
  fail(
    403,
    "LEARNER_VERIFICATION_REQUIRED",
    "Complete guardian verification for this learner before creating their profile.",
  );
}
export async function linkVerifiedLearner(
  db: DB,
  proof: GuardianVerification | null,
  childId: string,
) {
  if (!proof) return;
  const claimed = await db.guardianVerification.updateMany({
    where: { id: proof.id, status: "APPROVED", learnerId: null },
    data: { learnerId: childId, version: { increment: 1 } },
  });
  if (!claimed.count)
    fail(
      409,
      "CONFLICT",
      "This guardian review is already linked or unavailable.",
    );
  await db.child.update({
    where: { id: childId },
    data: { guardianVerificationId: proof.id, learningManagementMode: proof.managementMode, learningManagementVersion: { increment: 1 } },
  });
  if (!proof.studentAccountId) return;
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${proof.studentAccountId},0))`;
  const account = await db.account.findUniqueOrThrow({
    where: { id: proof.studentAccountId },
  });
  if (account.role === "STUDENT") {
    const existing = await db.child.findUnique({
      where: { studentAccountId: account.id },
    });
    if (existing?.id !== childId)
      fail(
        409,
        "ACCOUNT_IN_USE",
        "The acknowledged student account already has another learner profile.",
      );
  } else {
    if (!(await unusedAccount(db, account.id)))
      fail(
        409,
        "ACCOUNT_IN_USE",
        "The acknowledged student account already has another setup.",
      );
    await db.account.update({
      where: { id: account.id },
      data: { role: "STUDENT" },
    });
  }
  await db.child.update({
    where: { id: childId },
    data: { studentAccountId: account.id },
  });
}
export async function eraseGuardianVerification(
  db: DB,
  accountId: string,
  childIds: string[],
  wholeAccount: boolean,
) {
  const rows = await db.guardianVerification.findMany({
    where: {
      OR: [
        ...(wholeAccount
          ? [{ guardianId: accountId }, { studentAccountId: accountId }]
          : []),
        ...(childIds.length
          ? [
              { learnerId: { in: childIds } },
              {
                id: {
                  in: (
                    await db.child.findMany({
                      where: { id: { in: childIds } },
                      select: { guardianVerificationId: true },
                    })
                  ).flatMap((c) =>
                    c.guardianVerificationId ? [c.guardianVerificationId] : [],
                  ),
                },
              },
            ]
          : []),
      ],
    },
  });
  for (const row of rows) {
    await db.idempotency.deleteMany({
      where: { operation: { contains: "/guardian-verifications/" + row.id } },
    });
    const evidence = await db.guardianEvidence.findMany({
      where: { verificationId: row.id },
    });
    for (const e of evidence)
      await db.outbox.create({
        data: {
          type: "privacy.guardian_evidence_delete_requested",
          aggregateId: e.id,
          payload: { version: e.version },
        },
      });
    await db.guardianEvidence.updateMany({
      where: { verificationId: row.id },
      data: { status: "DELETED", version: { increment: 1 } },
    });
    await db.guardianVerification.update({
      where: { id: row.id },
      data: {
        guardianName: "Deleted guardian",
        learnerName: "Deleted learner",
        studentEmail: null,
        studentAccountId: null,
        studentAcknowledgedAt: null,
        currentEvidenceId: null,
        status: "DELETED",
        reason: null,
        reviewReference: null,
        version: { increment: 1 },
      },
    });
  }
}
@Controller("api/v1")
class GuardianVerificationController {
  constructor(@Inject(AppService) private readonly service: AppService) {}
  async current(db: DB, actor: Account, id: string, review = false) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    const row = await db.guardianVerification.findUnique({ where: { id } });
    if (
      !row ||
      (staff(actor)
        ? actor.role !== "ADMIN" && actor.region !== row.region
        : row.guardianId !== actor.id)
    )
      fail(404, "NOT_FOUND", "Guardian verification not found.");
    if (
      review &&
      (row.guardianId === actor.id || row.studentAccountId === actor.id)
    )
      fail(
        403,
        "SELF_REVIEW",
        "You cannot review your own guardian relationship.",
      );
    if (
      active(row) &&
      (await db.privacyRequest.count({
        where: {
          accountId: row.guardianId,
          kind: "DELETION",
          status: "PENDING",
        },
      }))
    )
      fail(
        403,
        "PRIVACY_PENDING",
        "Verification is paused while a deletion request is reviewed.",
      );
    return row;
  }
  async projection(db: DB, row: GuardianVerification, review = false) {
    const evidence = row.currentEvidenceId
      ? await db.guardianEvidence.findUnique({
          where: { id: row.currentEvidenceId },
          select: {
            id: true,
            status: true,
            mediaType: true,
            version: true,
            uploadedAt: true,
          },
        })
      : null;
    const { reviewReference, reviewerId, ...safe } = row;
    return {
      ...safe,
      evidence,
      ...(review ? { reviewReference, reviewerId } : {}),
      policyVersion: "guardian-verification-v1",
    };
  }
  @Get("guardian-verifications") async list(
    @Req() req: HttpRequest,
    @Query() input: unknown,
  ) {
    const actor = await this.service.actor(req, ["GUARDIAN"]),
      q = parse(pageQuery, input),
      where = { guardianId: actor.id };
    return this.service.db.$transaction(async (db) => {
      if (
        q.cursor &&
        !(await db.guardianVerification.count({
          where: { ...where, id: q.cursor },
        }))
      )
        fail(404, "NOT_FOUND", "Verification cursor is unavailable.");
      const rows = await db.guardianVerification.findMany({
        where: { ...where, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: "asc" },
        take: q.limit + 1,
      });
      return pageResult(
        await Promise.all(rows.map((r) => this.projection(db, r))),
        q.limit,
      );
    });
  }
  @Post("guardian-verifications") async create(
    @Req() req: HttpRequest,
    @Body() body: unknown,
  ) {
    const actor = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(guardianVerificationInput, body);
    return this.service.once(
      req,
      actor,
      "guardian-verification.create",
      data,
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id},0))`;
        if (data.studentEmail === actor.email?.toLowerCase())
          fail(
            400,
            "SELF_ACKNOWLEDGMENT",
            "Use a separate student account or a staff-observed call.",
          );
        if (
          await db.privacyRequest.count({
            where: { accountId: actor.id, kind: "DELETION", status: "PENDING" },
          })
        )
          fail(
            403,
            "PRIVACY_PENDING",
            "Verification is paused while a deletion request is reviewed.",
          );
        if (
          (await db.guardianVerification.count({
            where: {
              guardianId: actor.id,
              status: { in: ["DRAFT", "PENDING", "CHANGES_REQUESTED"] },
            },
          })) >= 10
        )
          fail(
            409,
            "TOO_MANY_DRAFTS",
            "Complete or cancel an existing verification before starting another.",
          );
        const {
          adultDeclaration,
          authorityDeclaration,
          verificationPermission,
          policyVersion,
          ...fields
        } = data;
        const row = await db.guardianVerification.create({
          data: { ...fields, guardianId: actor.id, region: actor.region },
        });
        await this.service.audit(
          db,
          actor,
          req,
          "GUARDIAN_VERIFICATION_OPENED",
          row.id,
          "Adult declared authority and permitted restricted relationship-evidence review",
          undefined,
          { policyVersion, managementMode: data.managementMode },
        );
        return this.projection(db, row);
      },
    );
  }
  @Get("guardian-verifications/:id") async detail(
    @Req() req: HttpRequest,
    @Param("id") id: string,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN", "ADMIN", "REVIEWER"]);
    return this.service.db.$transaction(async (db) => {
      const r = await this.current(db, a, id);
      if (staff(a))
        await this.service.audit(
          db,
          a,
          req,
          "GUARDIAN_VERIFICATION_READ",
          id,
          "Restricted regional guardian verification review",
        );
      return this.projection(db, r, staff(a));
    });
  }
  @Post("guardian-verifications/:id/revisions") async revise(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({
            expectedVersion: version,
            application: guardianVerificationInput,
          })
          .strict(),
        body,
      );
    return this.service.once(
      req,
      a,
      "guardian-verification.revise",
      data,
      async (db) => {
        const r = await this.current(db, a, id);
        if (!editing.includes(r.status) || r.version !== data.expectedVersion)
          fail(
            409,
            "CONFLICT",
            "Verification changed. Refresh before editing.",
          );
        const {
          adultDeclaration,
          authorityDeclaration,
          verificationPermission,
          policyVersion,
          ...fields
        } = data.application;
        if (fields.studentEmail === a.email?.toLowerCase())
          fail(
            400,
            "SELF_ACKNOWLEDGMENT",
            "Use a separate student account or a staff-observed call.",
          );
        const row = await db.guardianVerification.update({
          where: { id },
          data: {
            ...fields,
            status: "DRAFT",
            studentAccountId: null,
            studentAcknowledgedAt: null,
            guardianAcknowledgedAt: new Date(),
            reason: null,
            reviewReference: null,
            reviewerId: null,
            reviewedAt: null,
            callMethod: null,
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          a,
          req,
          "GUARDIAN_VERIFICATION_REVISED",
          id,
          "Guardian renewed declarations; student acknowledgment must be renewed",
        );
        return this.projection(db, row);
      },
    );
  }
  @Post("guardian-verifications/:id/evidence") async upload(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({
            expectedVersion: version,
            mediaType: z.enum(["image/png", "image/jpeg"]),
            contentBase64: z.string().min(4).max(6990512),
          })
          .strict(),
        body,
      );
    await this.service.limit("guardian-upload:" + a.id, 20, 86400);
    const bytes = Buffer.from(data.contentBase64, "base64");
    if (
      bytes.toString("base64") !== data.contentBase64 ||
      !files.validContent(bytes, data.mediaType)
    )
      fail(
        400,
        "INVALID_FILE",
        "Upload a content-matching PNG or JPEG of at most 5 MiB.",
      );
    let written: string | undefined;
    try {
      return await this.service.once(
        req,
        a,
        "guardian-verification.upload",
        data,
        async (db) => {
          const r = await this.current(db, a, id);
          if (!editing.includes(r.status) || r.version !== data.expectedVersion)
            fail(
              409,
              "CONFLICT",
              "Verification changed. Refresh before uploading.",
            );
          const evidenceId = randomUUID();
          files.put(evidenceId, bytes);
          written = evidenceId;
          await db.guardianEvidence.create({
            data: {
              id: evidenceId,
              verificationId: id,
              mediaType: data.mediaType,
              size: bytes.length,
              sha256: files.digest(bytes),
            },
          });
          const row = await db.guardianVerification.update({
            where: { id },
            data: { currentEvidenceId: evidenceId, version: { increment: 1 } },
          });
          await this.service.event(
            db,
            "guardian-evidence.scan_requested",
            evidenceId,
          );
          await this.service.audit(
            db,
            a,
            req,
            "GUARDIAN_EVIDENCE_UPLOADED",
            evidenceId,
            "School report image entered private quarantine",
          );
          return this.projection(db, row);
        },
      );
    } catch (error) {
      if (written)
        await this.service.db.guardianEvidence
          .findUnique({ where: { id: written } })
          .then((r) => {
            if (!r) files.remove(written!);
          })
          .catch(() => {});
      throw error;
    }
  }
  @Get("guardian-verification-invitations") async invitations(
    @Req() req: HttpRequest,
    @Query() input: unknown,
  ) {
    const a = await this.service.actor(req, ["GUARDIAN", "STUDENT"]),
      q = parse(pageQuery, input);
    if (!a.email) return { items: [], nextCursor: null };
    const where = {
      studentEmail: a.email.toLowerCase(),
      status: { not: "DELETED" },
    };
    return this.service.db.$transaction(async (db) => {
      if (
        q.cursor &&
        !(await db.guardianVerification.count({
          where: { ...where, id: q.cursor },
        }))
      )
        fail(404, "NOT_FOUND", "Acknowledgment cursor is unavailable.");
      const rows = await db.guardianVerification.findMany({
        where: { ...where, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        take: q.limit + 1,
        orderBy: { id: "asc" },
        select: {
          id: true,
          guardianName: true,
          learnerName: true,
          relationship: true,
          ageBand: true,
          managementMode: true,
          status: true,
          studentAcknowledgedAt: true,
          version: true,
        },
      });
      return pageResult(rows, q.limit);
    });
  }
  @Post("guardian-verifications/:id/student-acknowledgments") async acknowledge(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN", "STUDENT"]),
      data = parse(
        z
          .object({
            expectedVersion: version,
            decision: z.enum(["ACKNOWLEDGE", "DECLINE"]).default("ACKNOWLEDGE"),
            confirmed: z.literal(true),
          })
          .strict(),
        body,
      );
    const authorize = async (db: DB) => {
      const r = await db.guardianVerification.findUnique({ where: { id } });
      if (
        !r ||
        r.guardianId === a.id ||
        !a.email ||
        r.studentEmail !== a.email.toLowerCase() ||
        r.acknowledgmentMethod !== "STUDENT_ACCOUNT" ||
        r.status === "DELETED"
      )
        fail(404, "NOT_FOUND", "Acknowledgment request not found.");
      return r;
    };
    await authorize(this.service.db);
    return this.service.once(
      req,
      a,
      "guardian-verification.acknowledge",
      data,
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const r = await authorize(db);
        if (
          r.version !== data.expectedVersion ||
          r.studentAcknowledgedAt ||
          !["DRAFT", "PENDING"].includes(r.status)
        )
          fail(
            409,
            "CONFLICT",
            "Acknowledgment changed. Refresh before confirming.",
          );
        if (a.role === "GUARDIAN" && !(await unusedAccount(db, a.id)))
          fail(
            409,
            "ACCOUNT_IN_USE",
            "Use the student’s separate account without an existing setup.",
          );
        if (
          a.role === "STUDENT" &&
          !(await db.child.count({
            where: { studentAccountId: a.id, guardianId: r.guardianId },
          }))
        )
          fail(403, "FORBIDDEN", "This student is linked to another guardian.");
        const declined = data.decision === "DECLINE";
        await db.guardianVerification.update({
          where: { id },
          data: {
            studentAccountId: a.id,
            ...(declined
              ? {
                  status: "REJECTED",
                  reason: "Student declined the guardian relationship.",
                }
              : { studentAcknowledgedAt: new Date() }),
            version: { increment: 1 },
          },
        });
        await this.service.audit(
          db,
          a,
          req,
          declined
            ? "GUARDIAN_RELATIONSHIP_DECLINED"
            : "GUARDIAN_RELATIONSHIP_ACKNOWLEDGED",
          id,
          declined
            ? "Student declined the guardian relationship"
            : "Student acknowledged guardian relationship and the visible management mode",
        );
        return { id, status: declined ? "REJECTED" : "ACKNOWLEDGED" };
      },
    );
  }
  @Post("guardian-verifications/:id/submissions") async submit(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({ expectedVersion: version, confirmed: z.literal(true) })
          .strict(),
        body,
      );
    return this.service.once(
      req,
      a,
      "guardian-verification.submit",
      data,
      async (db) => {
        const r = await this.current(db, a, id);
        if (r.version !== data.expectedVersion || !editing.includes(r.status))
          fail(
            409,
            "CONFLICT",
            "Verification changed. Refresh before submitting.",
          );
        if (!r.currentEvidenceId)
          fail(
            409,
            "EVIDENCE_REQUIRED",
            "Upload the school report image before submitting.",
          );
        const e = await db.guardianEvidence.findUniqueOrThrow({
          where: { id: r.currentEvidenceId },
        });
        if (["INFECTED", "DELETED"].includes(e.status))
          fail(
            409,
            "INVALID_EVIDENCE",
            "Replace the unavailable school report image.",
          );
        const row = await db.guardianVerification.update({
          where: { id },
          data: { status: "PENDING", version: { increment: 1 } },
        });
        await this.service.audit(
          db,
          a,
          req,
          "GUARDIAN_VERIFICATION_SUBMITTED",
          id,
          "Guardian submitted relationship evidence for staff review",
        );
        await this.service.event(
          db,
          "guardian-verification.submitted",
          id,
          row.version,
        );
        return this.projection(db, row);
      },
    );
  }
  @Post("guardian-verifications/:id/cancellations") async cancel(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({ expectedVersion: version, confirmed: z.literal(true) })
          .strict(),
        body,
      );
    return this.service.once(
      req,
      a,
      "guardian-verification.cancel",
      data,
      async (db) => {
        const r = await this.current(db, a, id);
        if (
          r.version !== data.expectedVersion ||
          !["DRAFT", "PENDING", "CHANGES_REQUESTED"].includes(r.status)
        )
          fail(
            409,
            "CONFLICT",
            "Verification changed. Refresh before cancelling.",
          );
        const row = await db.guardianVerification.update({
          where: { id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        await this.service.audit(
          db,
          a,
          req,
          "GUARDIAN_VERIFICATION_CANCELLED",
          id,
          "Guardian cancelled the verification request",
        );
        return this.projection(db, row);
      },
    );
  }
  @Get("admin/guardian-verifications") async queue(
    @Req() req: HttpRequest,
    @Query() input: unknown,
  ) {
    const a = await this.service.actor(req, ["ADMIN", "REVIEWER"]),
      q = parse(
        pageQuery.extend({
          status: z
            .enum([
              "DRAFT",
              "PENDING",
              "CHANGES_REQUESTED",
              "APPROVED",
              "REJECTED",
              "CANCELLED",
              "REVOKED",
              "DELETED",
            ])
            .optional(),
        }),
        input,
      ),
      where = {
        ...(a.role === "ADMIN" ? {} : { region: a.region }),
        ...(q.status ? { status: q.status } : {}),
      };
    return this.service.db.$transaction(async (db) => {
      if (
        q.cursor &&
        !(await db.guardianVerification.count({
          where: { ...where, id: q.cursor },
        }))
      )
        fail(404, "NOT_FOUND", "Verification cursor is unavailable.");
      const rows = await db.guardianVerification.findMany({
        where: { ...where, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
        orderBy: { id: "asc" },
        take: q.limit + 1,
      });
      await this.service.audit(
        db,
        a,
        req,
        "GUARDIAN_VERIFICATION_QUEUE_READ",
        "guardian-verifications",
        "Restricted regional guardian verification queue",
      );
      return pageResult(
        await Promise.all(rows.map((r) => this.projection(db, r, true))),
        q.limit,
      );
    });
  }
  @Post("admin/guardian-verifications/:id/decisions") async decide(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["ADMIN", "REVIEWER"]),
      data = parse(
        z
          .object({
            expectedVersion: version,
            decision: z.enum([
              "APPROVE",
              "REQUEST_CHANGES",
              "REJECT",
              "REVOKE",
            ]),
            reason: text(1000),
            reviewReference: text(200),
            adultAndAuthorityChecked: z.boolean().default(false),
            documentNameMatched: z.boolean().default(false),
            studentAcknowledgmentObserved: z.boolean().default(false),
            callMethod: z.enum(["VIDEO", "PHONE"]).optional(),
            confirmed: z.literal(true),
          })
          .strict(),
        body,
      );
    return this.service.once(
      req,
      a,
      "guardian-verification.decide",
      data,
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"staff-administration"},0))`;
        const reviewer = await db.account.findUniqueOrThrow({
          where: { id: a.id },
        });
        if (
          reviewer.disabled ||
          reviewer.role !== a.role ||
          reviewer.authVersion !== a.authVersion ||
          reviewer.region !== a.region
        )
          fail(
            401,
            "SESSION_REVOKED",
            "Staff authority changed. Sign in again.",
          );
        const r = await this.current(db, a, id, true);
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${r.guardianId},0))`;
        const guardian = await db.account.findUniqueOrThrow({
          where: { id: r.guardianId },
        });
        if (guardian.disabled || guardian.role !== "GUARDIAN")
          fail(
            409,
            "ACCOUNT_UNAVAILABLE",
            "The guardian account is unavailable.",
          );
        if (
          r.version !== data.expectedVersion ||
          (data.decision === "REVOKE"
            ? r.status !== "APPROVED"
            : r.status !== "PENDING")
        )
          fail(
            409,
            "CONFLICT",
            "Verification changed. Refresh before reviewing.",
          );
        if (data.decision === "APPROVE") {
          const e = r.currentEvidenceId
            ? await db.guardianEvidence.findUnique({
                where: { id: r.currentEvidenceId },
              })
            : null;
          if (
            !e ||
            e.verificationId !== id ||
            e.status !== "CLEAN" ||
            !data.adultAndAuthorityChecked
          )
            fail(
              409,
              "VERIFICATION_INCOMPLETE",
              "Review clean evidence and independently check adult status and authority.",
            );
          if (
            !(r.documentNamesGuardian && data.documentNameMatched) &&
            !data.callMethod
          )
            fail(
              409,
              "CALL_REVIEW_REQUIRED",
              "A video or phone review is required when the report does not establish the named guardian relationship.",
            );
          if (
            r.acknowledgmentMethod === "STUDENT_ACCOUNT"
              ? !r.studentAcknowledgedAt
              : !(data.callMethod && data.studentAcknowledgmentObserved)
          )
            fail(
              409,
              "STUDENT_ACKNOWLEDGMENT_REQUIRED",
              "Record the student acknowledgment before approval.",
            );
          if (r.studentAccountId) {
            const student = await db.account.findUniqueOrThrow({
              where: { id: r.studentAccountId },
            });
            if (
              student.disabled ||
              student.email?.toLowerCase() !== r.studentEmail
            )
              fail(
                409,
                "STUDENT_UNAVAILABLE",
                "The acknowledged student account is unavailable.",
              );
          }
        }
        const status = {
            APPROVE: "APPROVED",
            REQUEST_CHANGES: "CHANGES_REQUESTED",
            REJECT: "REJECTED",
            REVOKE: "REVOKED",
          }[data.decision],
          row = await db.guardianVerification.update({
            where: { id },
            data: {
              status,
              reason: data.reason,
              reviewReference: data.reviewReference,
              reviewerId: a.id,
              reviewedAt: new Date(),
              callMethod: data.callMethod ?? null,
              ...(data.decision === "APPROVE" &&
              r.acknowledgmentMethod === "STAFF_CALL"
                ? { studentAcknowledgedAt: new Date() }
                : {}),
              version: { increment: 1 },
            },
          });
        if (status === "APPROVED")
          await db.account.update({
            where: { id: r.guardianId },
            data: { verified: true },
          });
        if (status === "REVOKED")
          await db.account.update({
            where: { id: r.guardianId },
            data: { verified: false },
          });
        await this.service.audit(
          db,
          a,
          req,
          "GUARDIAN_VERIFICATION_" + status,
          id,
          data.reason,
          undefined,
          {
            version: row.version,
            adultAndAuthorityChecked: data.adultAndAuthorityChecked,
            documentNameMatched: data.documentNameMatched,
            studentAcknowledgmentObserved: data.studentAcknowledgmentObserved,
            callMethod: data.callMethod ?? null,
          },
        );
        await this.service.event(
          db,
          "guardian-verification.reviewed",
          id,
          row.version,
        );
        return this.projection(db, row, true);
      },
    );
  }
  @Post("children/:id/guardian-verifications") async restore(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN"]),
      data = parse(
        z
          .object({
            expectedVersion: version,
            verificationId: uuid,
            confirmed: z.literal(true),
          })
          .strict(),
        body,
      );
    return this.service.once(
      req,
      a,
      "guardian-verification.restore",
      data,
      async (db) => {
        await this.service.guardian(db, a.id);
        const child = await db.child.findUnique({ where: { id } });
        if (!child || child.guardianId !== a.id)
          fail(404, "NOT_FOUND", "Learner not found.");
        if (child.version !== data.expectedVersion)
          fail(
            409,
            "CONFLICT",
            "Learner changed. Refresh before restoring verification.",
          );
        const proof = await guardianProof(
          db,
          a.id,
          child.alias,
          data.verificationId,
        );
        if (!proof)
          fail(
            403,
            "LEARNER_VERIFICATION_REQUIRED",
            "Select a new approved guardian review for this learner.",
          );
        if (
          proof.studentAccountId &&
          child.studentAccountId &&
          proof.studentAccountId !== child.studentAccountId
        )
          fail(
            409,
            "ACCOUNT_IN_USE",
            "A relationship review cannot replace the existing student account.",
          );
        await linkVerifiedLearner(db, proof, id);
        const row = await db.child.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.service.audit(
          db,
          a,
          req,
          "LEARNER_GUARDIAN_VERIFICATION_RESTORED",
          id,
          "Guardian attached a new approved relationship review without changing learner history",
          undefined,
          { verificationId: proof.id },
        );
        return { id, version: row.version, guardianVerificationId: proof.id };
      },
    );
  }
  @Get("guardian-evidence/:id/content") async content(
    @Req() req: HttpRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    parse(uuid, id);
    const a = await this.service.actor(req, ["GUARDIAN", "ADMIN", "REVIEWER"]);
    const evidence = await this.service.db.$transaction(async (db) => {
      const e = await db.guardianEvidence.findUnique({ where: { id } });
      if (!e) fail(404, "NOT_FOUND", "Guardian evidence not found.");
      const r = await this.current(db, a, e.verificationId);
      if (r.status === "DELETED" || e.status !== "CLEAN")
        fail(
          409,
          "QUARANTINED",
          "Only scanner-cleared evidence can be downloaded.",
        );
      await this.service.audit(
        db,
        a,
        req,
        "GUARDIAN_EVIDENCE_DOWNLOAD_AUTHORIZED",
        id,
        "Restricted school-report evidence download",
      );
      return e;
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
        "Private evidence failed integrity verification.",
      );
    res
      .set({
        "Content-Type": evidence.mediaType,
        "Content-Disposition": `attachment; filename="school-report-${id}.${evidence.mediaType === "image/png" ? "png" : "jpg"}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(bytes);
  }
}
@Module({
  imports: [PersistenceModule],
  controllers: [GuardianVerificationController],
})
export class GuardianVerificationModule {}
