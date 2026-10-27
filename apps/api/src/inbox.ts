import { EventEmitter } from "node:events";
export const inboxSignals = new EventEmitter();
inboxSignals.setMaxListeners(0);
import type { DB } from "./shared";
import * as email from "@bcs/email";
export async function recordInbox(
  db: DB,
  job: { id: string; type: string; aggregateId: string },
) {
  const recipients = await email.notificationTargets(db, job);
  if (
    job.type === "request.created" ||
    job.type === "student-enquiry.created"
  ) {
    const r =
      job.type === "request.created"
        ? await db.tuitionRequest.findUnique({ where: { id: job.aggregateId } })
        : await db.studentEnquiry.findUnique({
            where: { id: job.aggregateId },
          });
    if (r?.preferredTeacherId) {
      const direct = await db.directEnquiry.findUnique({
        where: {
          kind_sourceId: {
            kind: job.type === "request.created" ? "GUARDIAN" : "INDEPENDENT",
            sourceId: r.id,
          },
        },
      });
      const path = direct
        ? "/dashboard/enquiries?conversation=" + direct.id
        : "/dashboard/enquiries";
      if (direct)
        for (const recipient of recipients) recipient.actionPath = path;
      const t = await db.teacher.findUnique({
        where: { id: r.preferredTeacherId },
      });
      if (t?.accountId)
        recipients.push({
          accountId: t.accountId,
          actionPath: path,
        });
    }
  }
  if (job.type.startsWith("tuition-booking.")) {
    const booking = await db.tuitionBooking.findUnique({where:{resourceId:job.aggregateId}});
    if (booking) {
      const p = booking.kind === "PLACEMENT" ? await db.placement.findUnique({where:{id:booking.resourceId}}) : null;
      const a = booking.kind === "INDEPENDENT" ? await db.studentArrangement.findUnique({where:{id:booking.resourceId}}) : null;
      const ownerId = p?.guardianId ?? a?.studentAccountId;
      const teacher = await db.teacher.findUnique({where:{id:p?.teacherId ?? a?.teacherId ?? "00000000-0000-4000-8000-000000000000"}});
      const path = p ? "/dashboard/arrangements?arrangement="+p.id : "/dashboard/student-arrangements";
      for (const accountId of [ownerId,teacher?.accountId]) if(accountId) recipients.push({accountId,actionPath:path});
      if(p){const child=await db.child.findUnique({where:{id:p.childId}});if(child?.studentAccountId&&!child.studentAccessRevokedAt)recipients.push({accountId:child.studentAccountId,actionPath:path});}
    }
  }
  if (job.type.startsWith("direct.")) {
    const d = await db.directEnquiry.findUnique({
      where: { id: job.aggregateId },
    });
    if (d) {
      recipients.push({
        accountId: d.ownerId,
        actionPath: "/dashboard/enquiries?conversation=" + d.id,
      });
      const t = await db.teacher.findUnique({ where: { id: d.teacherId } });
      if (t?.accountId)
        recipients.push({
          accountId: t.accountId,
          actionPath: "/dashboard/enquiries?conversation=" + d.id,
        });
    }
  }
  if (job.type === "student.invited") {
    const c = await db.child.findUnique({ where: { id: job.aggregateId } });
    if (c?.studentAccountId && !c.studentAccessRevokedAt)
      recipients.push({
        accountId: c.studentAccountId,
        actionPath: "/dashboard",
      });
  }
  if (job.type.startsWith("guardian-verification.")) {
    const v = await db.guardianVerification.findUnique({
      where: { id: job.aggregateId },
    });
    if (v)
      recipients.push({
        accountId: v.guardianId,
        actionPath: "/guardian-verification?verification=" + v.id,
      });
  }
  if (job.type === "guardian-verification.submitted") {
    const v = await db.guardianVerification.findUnique({
      where: { id: job.aggregateId },
    });
    if (v) {
      for (const a of await db.account.findMany({
        where: {
          disabled: false,
          OR: [{ role: "ADMIN" }, { role: "OPERATOR", region: v.region }],
        },
        select: { id: true },
      }))
        recipients.push({
          accountId: a.id,
          actionPath: "/guardian-verification",
        });
      if (v.studentEmail) {
        const student = await db.account.findFirst({
          where: { email: v.studentEmail, disabled: false },
          select: { id: true },
        });
        if (student)
          recipients.push({
            accountId: student.id,
            actionPath: "/guardian-verification?view=student",
          });
      }
    }
  }
  if (job.type === "supporter.changed") {
    const g = await db.studentGuardianGrant.findUnique({
      where: { id: job.aggregateId },
    });
    if (g)
      recipients.push({
        accountId: g.studentAccountId,
        actionPath: "/dashboard/student-supporters",
      });
  }
  for (const r of recipients) {
    if (!r.accountId && r.to)
      r.accountId = (
        await db.account.findFirst({
          where: { email: r.to, disabled: false },
          select: { id: true },
        })
      )?.id;
    if (!r.accountId) continue;
    if (
      !(await db.account.count({
        where: { id: r.accountId, disabled: false },
      })) ||
      (await db.privacyRequest.count({
        where: {
          accountId: r.accountId,
          scope: "ACCOUNT",
          kind: "DELETION",
          status: "PENDING",
        },
      }))
    )
      continue;
    if (
      !r.actionPath.startsWith("/dashboard") &&
      !r.actionPath.startsWith("/guardian-verification")
    )
      continue;
    await db.inboxNotification.upsert({
      where: { accountId_eventId: { accountId: r.accountId, eventId: job.id } },
      update: {},
      create: {
        accountId: r.accountId,
        eventId: job.id,
        topic: job.type,
        actionPath: r.actionPath,
        important:
          /direct\.|request|enquiry|placement|arrangement|tuition|invited|verification|case/.test(
            job.type,
          ),
      },
    });
  }
}
