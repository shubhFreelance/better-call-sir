import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppService } from "../../shared";
export async function sponsoredTeachers(
  service: AppService,
  placement: string,
  where: Prisma.TeacherWhereInput,
) {
  const now = new Date(),
    plan = await service.db.promotionPlan.findUnique({
      where: { id: placement },
    });
  if (!plan?.enabled) return [];
  // shortcut: at most 100 concurrent campaigns per placement; use inventory allocation before raising this limit.
  const campaigns = await service.db.teacherPromotion.findMany({
    where: {
      placement,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { id: "asc" },
    take: 100,
  });
  if (!campaigns.length) return [];
  const teachers = await service.publicTeachers(
    { AND: [where, { id: { in: campaigns.map((c) => c.teacherId) } }] },
    100,
  );
  const [capacity, placements, arrangements] = await Promise.all([
    service.db.teacher.findMany({
      where: { id: { in: teachers.map((t) => t.id) } },
      select: { id: true, accountId: true, maxActiveStudents: true },
    }),
    service.db.placement.findMany({
      where: {
        teacherId: { in: teachers.map((t) => t.id) },
        status: { in: ["ACTIVE", "TERMS_PENDING"] },
      },
      select: { teacherId: true, childId: true },
    }),
    service.db.studentArrangement.findMany({
      where: {
        teacherId: { in: teachers.map((t) => t.id) },
        status: { in: ["TERMS_PENDING", "CONFIRMED"] },
      },
      select: { teacherId: true, studentAccountId: true },
    }),
  ]);
  const pausedAccounts = new Set(
    (
      await service.db.privacyRequest.findMany({
        where: {
          accountId: { in: capacity.map((t) => t.accountId) },
          kind: "DELETION",
          scope: "ACCOUNT",
          status: "PENDING",
        },
        select: { accountId: true },
      })
    ).map((p) => p.accountId),
  );
  const currentStudents = new Map<string, Set<string>>();
  for (const p of [
    ...placements.map((p) => ({
      teacherId: p.teacherId,
      learnerId: p.childId,
    })),
    ...arrangements.map((p) => ({
      teacherId: p.teacherId,
      learnerId: p.studentAccountId,
    })),
  ]) {
    const learners = currentStudents.get(p.teacherId) || new Set<string>();
    learners.add(p.learnerId);
    currentStudents.set(p.teacherId, learners);
  }
  const limits = new Map(
    capacity
      .filter((t) => !pausedAccounts.has(t.accountId))
      .map((t) => [t.id, t.maxActiveStudents]),
  );
  const available = teachers.filter(
    (t) => (currentStudents.get(t.id)?.size || 0) < (limits.get(t.id) || 0),
  );
  const rotation = Math.floor(now.getTime() / 300000);
  return available
    .map((t) => ({
      teacher: t,
      rank: createHash("sha256")
        .update(rotation + ":" + t.id)
        .digest("hex"),
    }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .slice(0, 3)
    .map((row) => row.teacher);
}
